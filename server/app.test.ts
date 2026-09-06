import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { Op } from "../shared/protocol.ts";
import { buildApp } from "./app.ts";
import { Db } from "./db.ts";
import {
  base,
  connect as connectTo,
  createList as createListOn,
  item,
  listen,
  uid,
  type App,
} from "./test-helpers.ts";

let app: App;
let baseUrl: string;

beforeAll(async () => {
  app = await buildApp(new Db(":memory:"));
  baseUrl = await listen(app);
});

afterAll(() => app.close());

const createList = (title?: string) => createListOn(app, title);
const connect = (token: string) => connectTo(baseUrl, token);

describe("S1 create items", () => {
  it("AC1 POST /api/lists creates a list with two distinct tokens and an empty snapshot", async () => {
    const { editToken, viewToken } = await createList();
    expect(editToken).toHaveLength(22);
    expect(viewToken).toHaveLength(22);
    expect(editToken).not.toBe(viewToken);

    const client = connect(editToken);
    expect(await client.next()).toEqual({
      type: "snapshot",
      list: {
        id: expect.any(String),
        title: "Untitled list",
        role: "edit",
        viewToken: expect.any(String),
      },
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

describe("sub-task rules (specs/010: one level deep)", () => {
  it("an item cannot become its own parent", async () => {
    const { editToken } = await createList();
    const a = uid();
    const client = connect(editToken);
    await client.next();
    client.send({ ...base, opId: "op-1", kind: "createItem", item: item({ id: a, position: 1 }) });
    await client.next();
    client.send({ ...base, opId: "op-2", kind: "moveItem", id: a, parentId: a, position: 1 });
    expect(await client.next()).toMatchObject({ type: "rejected", opId: "op-2" });
    const snapshot = await client.next();
    expect(snapshot.type).toBe("snapshot");
    if (snapshot.type === "snapshot") expect(snapshot.items[0]?.parentId).toBeNull();
    client.socket.close();
  });

  it("an item that has sub-tasks cannot become a sub-task", async () => {
    const { editToken } = await createList();
    const parent = uid();
    const child = uid();
    const other = uid();
    const client = connect(editToken);
    await client.next();
    client.send({
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: parent, position: 1 }),
    });
    client.send({
      ...base,
      opId: "op-2",
      kind: "createItem",
      item: item({ id: other, position: 2 }),
    });
    client.send({
      ...base,
      opId: "op-3",
      kind: "createItem",
      item: item({ id: child, position: 1, parentId: parent }),
    });
    for (let i = 0; i < 3; i++) await client.next();
    client.send({
      ...base,
      opId: "op-4",
      kind: "moveItem",
      id: parent,
      parentId: other,
      position: 1,
    });
    expect(await client.next()).toMatchObject({
      type: "rejected",
      opId: "op-4",
      reason: "an item with sub-tasks cannot become a sub-task",
    });
    client.socket.close();
  });
});

describe("ops that change nothing", () => {
  it("a createItem whose id already exists is rejected, followed by a snapshot, and not broadcast", async () => {
    const shared = uid();
    const first = await createList();
    const second = await createList();
    const owner = connect(first.editToken);
    await owner.next();
    owner.send({
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: shared, position: 1 }),
    });
    await owner.next();

    const intruder = connect(second.editToken);
    const bystander = connect(second.editToken);
    await intruder.next();
    await bystander.next();
    intruder.send({
      ...base,
      opId: "op-2",
      kind: "createItem",
      item: item({ id: shared, position: 1 }),
    });
    expect(await intruder.next()).toMatchObject({
      type: "rejected",
      opId: "op-2",
      reason: "item id already exists",
    });
    expect(await intruder.next()).toMatchObject({ type: "snapshot", items: [] });

    // The bystander must have heard nothing. Prove it by sending a real op and seeing it arrive first.
    bystander.send({
      ...base,
      opId: "op-3",
      kind: "createItem",
      item: item({ id: uid(), position: 1 }),
    });
    expect(await bystander.next()).toMatchObject({ type: "op", op: { opId: "op-3" } });
    for (const c of [owner, intruder, bystander]) c.socket.close();
  });

  it("an update to an item that no longer exists is acknowledged to the sender only", async () => {
    const { editToken } = await createList();
    const editor = connect(editToken);
    const peer = connect(editToken);
    await editor.next();
    await peer.next();
    editor.send({ ...base, opId: "op-1", kind: "updateItem", id: uid(), patch: { done: true } });
    expect(await editor.next()).toMatchObject({ type: "op", op: { opId: "op-1" } });

    peer.send({
      ...base,
      opId: "op-2",
      kind: "createItem",
      item: item({ id: uid(), position: 1 }),
    });
    expect(await peer.next()).toMatchObject({ type: "op", op: { opId: "op-2" } });
    editor.socket.close();
    peer.socket.close();
  });
});

describe("S5 share link", () => {
  it("AC4 the view token is sent to edit-role connections only; the edit token never", async () => {
    const { editToken, viewToken } = await createList();
    const editor = connect(editToken);
    const viewer = connect(viewToken);
    const editorSnapshot = await editor.next();
    const viewerSnapshot = await viewer.next();
    expect(editorSnapshot).toMatchObject({ type: "snapshot", list: { role: "edit", viewToken } });
    expect(viewerSnapshot).toMatchObject({
      type: "snapshot",
      list: { role: "view", viewToken: null },
    });
    expect(JSON.stringify(editorSnapshot)).not.toContain(editToken);
    expect(JSON.stringify(viewerSnapshot)).not.toContain(editToken);
    editor.socket.close();
    viewer.socket.close();
  });

  it("AC3 an op from a view-role socket is rejected, followed by a snapshot, and not broadcast", async () => {
    const { editToken, viewToken } = await createList();
    const editor = connect(editToken);
    const viewer = connect(viewToken);
    await editor.next();
    await viewer.next();

    viewer.send({
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: uid(), position: 1 }),
    });
    expect(await viewer.next()).toMatchObject({
      type: "rejected",
      opId: "op-1",
      reason: "read-only link",
    });
    expect(await viewer.next()).toMatchObject({ type: "snapshot", items: [] });

    // The editor heard nothing: its own next op is the first message it receives.
    editor.send({
      ...base,
      opId: "op-2",
      kind: "createItem",
      item: item({ id: uid(), position: 1 }),
    });
    expect(await editor.next()).toMatchObject({ type: "op", op: { opId: "op-2" } });
    editor.socket.close();
    viewer.socket.close();
  });

  it("AC5 renameList reaches peers and survives a reconnect", async () => {
    const { editToken, viewToken } = await createList();
    const editor = connect(editToken);
    const viewer = connect(viewToken);
    await editor.next();
    await viewer.next();

    editor.send({ ...base, opId: "op-1", kind: "renameList", title: "  Family groceries " });
    expect(await viewer.next()).toMatchObject({
      type: "op",
      op: { kind: "renameList", title: "Family groceries" },
    });
    await editor.next();
    editor.socket.close();
    viewer.socket.close();

    const again = connect(viewToken);
    expect(await again.next()).toMatchObject({
      type: "snapshot",
      list: { title: "Family groceries" },
    });
    again.socket.close();
  });
});

describe("S6 reorder", () => {
  it("AC1/AC2 a moveItem reaches the peer and the new order survives a reconnect", async () => {
    const { editToken } = await createList();
    const [a, b, c] = [uid(), uid(), uid()];
    const mover = connect(editToken);
    const peer = connect(editToken);
    await mover.next();
    await peer.next();
    mover.send({ ...base, opId: "op-1", kind: "createItem", item: item({ id: a, position: 1 }) });
    mover.send({ ...base, opId: "op-2", kind: "createItem", item: item({ id: b, position: 2 }) });
    mover.send({ ...base, opId: "op-3", kind: "createItem", item: item({ id: c, position: 3 }) });
    for (let i = 0; i < 3; i++) await peer.next();
    for (let i = 0; i < 3; i++) await mover.next();

    mover.send({ ...base, opId: "op-4", kind: "moveItem", id: c, parentId: null, position: 0.5 });
    expect(await peer.next()).toMatchObject({
      type: "op",
      op: { kind: "moveItem", id: c, position: 0.5 },
    });
    mover.socket.close();
    peer.socket.close();

    const again = connect(editToken);
    const snapshot = await again.next();
    if (snapshot.type === "snapshot") expect(snapshot.items.map((i) => i.id)).toEqual([c, a, b]);
    again.socket.close();
  });
});

describe("S7 sub-tasks", () => {
  it("AC1/AC3 a sub-task reaches the peer and the snapshot keeps it under its parent", async () => {
    const { editToken } = await createList();
    const parent = uid();
    const child = uid();
    const editor = connect(editToken);
    const peer = connect(editToken);
    await editor.next();
    await peer.next();
    editor.send({
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: parent, position: 1 }),
    });
    await peer.next();
    editor.send({
      ...base,
      opId: "op-2",
      kind: "createItem",
      item: item({ id: child, position: 1, parentId: parent }),
    });
    expect(await peer.next()).toMatchObject({
      type: "op",
      op: { kind: "createItem", item: { id: child, parentId: parent } },
    });
    editor.socket.close();
    peer.socket.close();

    const again = connect(editToken);
    const snapshot = await again.next();
    if (snapshot.type === "snapshot") {
      expect(snapshot.items.find((i) => i.id === child)?.parentId).toBe(parent);
    }
    again.socket.close();
  });
});
