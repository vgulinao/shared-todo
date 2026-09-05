import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SyncClient, type ListState } from "../client/src/lib/SyncClient.ts";
import type { ItemPatch, Op } from "../shared/protocol.ts";
import { buildApp } from "./app.ts";
import { Db } from "./db.ts";
import { createList, item, uid, type App } from "./test-helpers.ts";

// These tests drive the real browser-side SyncClient (Node 24 has a global WebSocket) against a
// real server, so they cover the whole path a change travels: optimistic apply → socket → validation
// → SQLite → broadcast → apply on every client.

const dir = mkdtempSync(path.join(tmpdir(), "shared-todo-collab-"));
const file = path.join(dir, "test.db");
let port: number;
let server: { app: App; db: Db } | null = null;

beforeAll(async () => {
  // The port is chosen up front, not with `port: 0`, because AC3 stops the server and restarts it
  // on the same address so that clients can reconnect to it.
  port = await freePort();
  await startServer();
});
afterEach(() => clients.splice(0).forEach((c) => c.close()));
afterAll(async () => {
  await stopServer();
  rmSync(dir, { recursive: true, force: true });
});

async function startServer() {
  const db = new Db(file);
  const app = await buildApp(db);
  await app.listen({ port, host: "127.0.0.1" });
  server = { app, db };
}
async function stopServer() {
  if (!server) return;
  await server.app.close();
  server.db.close();
  server = null;
}
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const found = address && typeof address !== "string" ? address.port : 0;
      probe.close(() => resolve(found));
    });
  });
}

/** A SyncClient with its latest state, how many times it notified React, and its pending queue size. */
type Client = {
  state: ListState;
  renders: number;
  pendingCount: number;
  dispatch: (op: Op) => void;
  close: () => void;
};
const clients: Client[] = [];

function connect(token: string): Client {
  let state: ListState = { status: "connecting", list: null, items: new Map(), error: null };
  let renders = 0;
  const sync = new SyncClient(`ws://127.0.0.1:${port}/ws?token=${token}`, (next) => {
    state = next;
    renders++;
  });
  const client: Client = {
    get state() {
      return state;
    },
    get renders() {
      return renders;
    },
    get pendingCount() {
      return sync.pendingCount;
    },
    dispatch: (op) => sync.dispatch(op),
    close: () => sync.close(),
  };
  clients.push(client);
  return client;
}

async function until(check: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

const titlesOf = (c: Client) =>
  [...c.state.items.values()].sort((a, b) => a.position - b.position).map((i) => i.title);

const stamp = () => ({ opId: uid(), clientId: "test" });
const createOp = (id: string, title: string, position: number): Op => ({
  ...stamp(),
  kind: "createItem",
  item: item({ id, title, position }),
});
const updateOp = (id: string, patch: ItemPatch): Op => ({
  ...stamp(),
  kind: "updateItem",
  id,
  patch,
});
const deleteOp = (id: string): Op => ({ ...stamp(), kind: "deleteItem", id });

async function twoClients() {
  const { editToken } = await createList(server!.app);
  const a = connect(editToken);
  const b = connect(editToken);
  await until(() => a.state.list !== null && b.state.list !== null, "both snapshots");
  return { a, b, editToken };
}

describe("S4 real-time collaboration", () => {
  it("AC1 a change by one client reaches the other", async () => {
    const { a, b } = await twoClients();
    const id = uid();
    a.dispatch(createOp(id, "milk", 1));
    await until(() => b.state.items.has(id), "B sees the new item");
    a.dispatch(updateOp(id, { title: "oat milk" }));
    await until(() => b.state.items.get(id)?.title === "oat milk", "B sees the rename");
    a.dispatch(deleteOp(id));
    await until(() => !b.state.items.has(id), "B sees the delete");
  });

  it("AC2 the sender sees its change immediately, and the echo causes no re-render", async () => {
    const { a } = await twoClients();
    const id = uid();
    a.dispatch(createOp(id, "eggs", 1));
    expect(a.state.items.get(id)?.title).toBe("eggs"); // synchronous, before any round trip
    const optimistic = a.state.items;
    const rendersAfterDispatch = a.renders;

    await until(() => a.pendingCount === 0, "the echo acknowledged the op");
    expect(a.state.items).toBe(optimistic); // same Map instance
    expect(a.renders).toBe(rendersAfterDispatch); // React was not notified at all
    expect(a.state.error).toBeNull();
  });

  it("AC3 after an outage my offline edits go out and the others' edits come in", async () => {
    const { a, editToken } = await twoClients();
    const before = uid();
    a.dispatch(createOp(before, "before outage", 1));
    await until(() => a.pendingCount === 0, "first item acked");

    await stopServer();
    await until(() => a.state.status === "offline", "A notices the outage");
    const mine = uid();
    a.dispatch(createOp(mine, "mine, offline", 2));
    expect(titlesOf(a)).toEqual(["before outage", "mine, offline"]); // still usable offline
    expect(a.pendingCount).toBe(1);

    // Server is back. A's first retry is at least 500 ms away (backoff), so another client can edit
    // "meanwhile". The assertion on A's status makes that assumption explicit.
    await startServer();
    const c = connect(editToken);
    const theirs = uid();
    await until(() => c.state.list !== null, "C connected");
    c.dispatch(createOp(theirs, "theirs, meanwhile", 3));
    await until(() => c.pendingCount === 0, "C's edit acked");
    expect(a.state.status).toBe("offline");

    await until(() => a.state.status === "online" && a.pendingCount === 0, "A reconnected", 6000);
    const all = ["before outage", "mine, offline", "theirs, meanwhile"];
    expect(titlesOf(a)).toEqual(all); // theirs came in with the snapshot, mine survived the replay
    await until(() => c.state.items.has(mine), "C received A's offline edit");
    expect(titlesOf(c)).toEqual(all);
  });

  it("AC4 concurrent edits to different fields of the same item both survive", async () => {
    const { a, b } = await twoClients();
    const id = uid();
    a.dispatch(createOp(id, "bread", 1));
    await until(() => b.state.items.has(id), "shared item");

    a.dispatch(updateOp(id, { title: "sourdough" }));
    b.dispatch(updateOp(id, { done: true }));
    const settled = (c: Client) =>
      c.state.items.get(id)?.title === "sourdough" && c.state.items.get(id)?.done === true;
    await until(() => settled(a) && settled(b), "both fields on both clients");
  });

  it("AC5 concurrent edits to the same field converge to one value", async () => {
    const { a, b } = await twoClients();
    const id = uid();
    a.dispatch(createOp(id, "cheese", 1));
    await until(() => b.state.items.has(id), "shared item");

    a.dispatch(updateOp(id, { title: "brie" }));
    b.dispatch(updateOp(id, { title: "cheddar" }));
    await until(() => a.pendingCount === 0 && b.pendingCount === 0, "both acked");
    const title = a.state.items.get(id)?.title;
    expect(["brie", "cheddar"]).toContain(title);
    expect(b.state.items.get(id)?.title).toBe(title);
  });

  it("AC6 a delete racing an update wins on both clients; the late update is acked, not an error", async () => {
    const { a, b } = await twoClients();
    const id = uid();
    a.dispatch(createOp(id, "butter", 1));
    await until(() => b.state.items.has(id), "shared item");

    a.dispatch(deleteOp(id));
    b.dispatch(updateOp(id, { title: "salted butter" }));
    await until(() => !a.state.items.has(id) && !b.state.items.has(id), "gone on both");
    // The update found no row. The server must still acknowledge it to B, or it would sit in B's
    // pending queue forever and be resent on every reconnect.
    await until(() => b.pendingCount === 0, "B's late update acknowledged");
    expect(b.state.error).toBeNull();
    expect(a.state.error).toBeNull();
  });
});
