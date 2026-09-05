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
