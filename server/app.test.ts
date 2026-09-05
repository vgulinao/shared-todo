import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { Op, ServerMessage } from "../shared/protocol.ts";
import type { Item } from "../shared/types.ts";
import { buildApp } from "./app.ts";
import { Db } from "./db.ts";

let app: Awaited<ReturnType<typeof buildApp>>;
let baseUrl: string;

beforeAll(async () => {
  app = await buildApp(new Db(":memory:"));
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `127.0.0.1:${address.port}`;
});

afterAll(() => app.close());

async function createList(title?: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/lists",
    payload: title ? { title } : {},
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { editToken: string; viewToken: string };
}

/** Opens a socket and returns helpers that resolve with the next message or close event. */
function connect(token: string) {
  const socket = new WebSocket(`ws://${baseUrl}/ws?token=${token}`);
  const inbox: ServerMessage[] = [];
  const waiting: Array<(m: ServerMessage) => void> = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as ServerMessage;
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else inbox.push(message);
  });
  return {
    socket,
    next(): Promise<ServerMessage> {
      const queued = inbox.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve) => waiting.push(resolve));
    },
    send(op: Op) {
      socket.send(JSON.stringify({ type: "op", op }));
    },
    closed(): Promise<number> {
      return new Promise((resolve) => socket.on("close", (code) => resolve(code)));
    },
  };
}

function item(overrides: Partial<Item> & { id: string; position: number }): Item {
  return {
    parentId: null,
    title: overrides.id,
    description: null,
    done: false,
    cost: null,
    ...overrides,
  };
}

const base = { clientId: "client-a" };

/** Item ids are unique across all lists, like the UUIDs the client generates. */
function uid(): string {
  return randomUUID();
}

describe("S1 create items", () => {
  it("AC1 POST /api/lists creates a list with two distinct tokens and an empty snapshot", async () => {
    const { editToken, viewToken } = await createList();
    expect(editToken).toHaveLength(22);
    expect(viewToken).toHaveLength(22);
    expect(editToken).not.toBe(viewToken);

    const client = connect(editToken);
    expect(await client.next()).toEqual({
      type: "snapshot",
      list: { id: expect.any(String), title: "Untitled list", role: "edit" },
      items: [],
    });
    client.socket.close();
  });

  it("AC2 a createItem is applied and echoed back as the acknowledgement", async () => {
    const { editToken } = await createList("Groceries");
    const a = uid();
    const client = connect(editToken);
    await client.next(); // snapshot

    const op: Op = {
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: a, position: 1 }),
    };
    client.send(op);
    expect(await client.next()).toEqual({ type: "op", op });
    client.socket.close();
  });

  it("AC3 the server rejects an item with an empty title", async () => {
    const { editToken } = await createList();
    const client = connect(editToken);
    await client.next();

    client.send({
      ...base,
      opId: "op-bad",
      kind: "createItem",
      item: item({ id: uid(), position: 1, title: "   " }),
    });
    expect(await client.next()).toMatchObject({ type: "rejected", reason: "invalid item" });
    client.socket.close();
  });

  it("AC4 items survive a reconnect and come back in position order", async () => {
    const { editToken } = await createList();
    const a = uid();
    const b = uid();
    const first = connect(editToken);
    await first.next();
    first.send({ ...base, opId: "op-1", kind: "createItem", item: item({ id: b, position: 2 }) });
    first.send({ ...base, opId: "op-2", kind: "createItem", item: item({ id: a, position: 1 }) });
    await first.next();
    await first.next();
    first.socket.close();

    const second = connect(editToken);
    const snapshot = await second.next();
    expect(snapshot.type).toBe("snapshot");
    if (snapshot.type === "snapshot") {
      expect(snapshot.items.map((i) => i.id)).toEqual([a, b]);
    }
    second.socket.close();
  });

  it("AC5/AC6 update and delete round-trip through the database", async () => {
    const { editToken } = await createList();
    const a = uid();
    const b = uid();
    const client = connect(editToken);
    await client.next();
    client.send({
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: a, position: 1 }),
    });
    client.send({
      ...base,
      opId: "op-2",
      kind: "createItem",
      item: item({ id: b, position: 2 }),
    });
    client.send({
      ...base,
      opId: "op-3",
      kind: "updateItem",
      id: a,
      patch: { title: "oat milk" },
    });
    client.send({ ...base, opId: "op-4", kind: "deleteItem", id: b });
    for (let i = 0; i < 4; i++) await client.next();
    client.socket.close();

    const again = connect(editToken);
    const snapshot = await again.next();
    if (snapshot.type === "snapshot") {
      expect(snapshot.items).toEqual([item({ id: a, position: 1, title: "oat milk" })]);
    }
    again.socket.close();
  });

  it("AC7 an unknown token is closed with code 4004", async () => {
    const client = connect("does-not-exist");
    expect(await client.closed()).toBe(4004);
  });
});

describe("protocol rules", () => {
  it("a malformed frame gets a rejected message and the connection stays open", async () => {
    const { editToken } = await createList();
    const client = connect(editToken);
    await client.next();
    client.socket.send("not json");
    expect(await client.next()).toMatchObject({ type: "rejected" });
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.close();
  });

  it("a sub-task's parent must be a top-level item of the same list", async () => {
    const { editToken } = await createList();
    const client = connect(editToken);
    await client.next();
    client.send({
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: uid(), position: 1, parentId: "nope" }),
    });
    expect(await client.next()).toMatchObject({
      type: "rejected",
      opId: "op-1",
      reason: "invalid parent",
    });
    client.socket.close();
  });
});

describe("S2 mark done", () => {
  it("AC5 done state is persisted and comes back in the snapshot", async () => {
    const { editToken } = await createList();
    const a = uid();
    const client = connect(editToken);
    await client.next();
    client.send({ ...base, opId: "op-1", kind: "createItem", item: item({ id: a, position: 1 }) });
    client.send({ ...base, opId: "op-2", kind: "updateItem", id: a, patch: { done: true } });
    await client.next();
    await client.next();
    client.socket.close();

    const again = connect(editToken);
    const snapshot = await again.next();
    if (snapshot.type === "snapshot") {
      expect(snapshot.items).toEqual([item({ id: a, position: 1, done: true })]);
    }
    again.socket.close();
  });
});
