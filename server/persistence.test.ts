import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { Db } from "./db.ts";
import { base, connect, createList, item, listen, uid } from "./test-helpers.ts";

const dir = mkdtempSync(path.join(tmpdir(), "shared-todo-"));
const file = path.join(dir, "test.db");

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A fresh server process, as far as the database is concerned: new connection, same file. */
async function startServer() {
  const db = new Db(file);
  const app = await buildApp(db);
  const baseUrl = await listen(app);
  return {
    baseUrl,
    app,
    async stop() {
      await app.close();
      db.close();
    },
  };
}

describe("S3 persistence", () => {
  it("AC1 a new server on the same database file serves the same items", async () => {
    const first = await startServer();
    const { editToken } = await createList(first.app, "Groceries");
    const a = uid();
    const b = uid();

    const writer = connect(first.baseUrl, editToken);
    await writer.next();
    writer.send({ ...base, opId: "op-1", kind: "createItem", item: item({ id: a, position: 1 }) });
    writer.send({ ...base, opId: "op-2", kind: "createItem", item: item({ id: b, position: 2 }) });
    writer.send({ ...base, opId: "op-3", kind: "updateItem", id: a, patch: { done: true } });
    for (let i = 0; i < 3; i++) await writer.next();
    writer.socket.close();
    await first.stop();

    const second = await startServer();
    const reader = connect(second.baseUrl, editToken);
    const snapshot = await reader.next();
    expect(snapshot).toEqual({
      type: "snapshot",
      list: { id: expect.any(String), title: "Groceries", role: "edit" },
      items: [item({ id: a, position: 1, done: true }), item({ id: b, position: 2 })],
    });
    reader.socket.close();
    await second.stop();
  });
});
