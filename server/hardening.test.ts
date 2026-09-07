import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_MESSAGE_BYTES } from "../shared/protocol.ts";
import { buildApp } from "./app.ts";
import { Db } from "./db.ts";
import { base, connect, createList, item, listen, uid, type App } from "./test-helpers.ts";

let app: App;
let baseUrl: string;

beforeAll(async () => {
  app = await buildApp(new Db(":memory:"), undefined, false, { maxItems: 3 });
  baseUrl = await listen(app);
});
afterAll(() => app.close());

describe("X2 hardening", () => {
  it("AC1 a frame over the size limit closes the socket with 1009; a new socket works", async () => {
    const { editToken } = await createList(app);
    const big = connect(baseUrl, editToken);
    await big.next();
    big.socket.send("x".repeat(MAX_MESSAGE_BYTES + 1024));
    expect(await big.closed()).toBe(1009);

    const fresh = connect(baseUrl, editToken);
    expect((await fresh.next()).type).toBe("snapshot");
    fresh.socket.close();
  });

  it("AC2 more than 60 ops in 10 seconds are rejected with a slow-down reason", async () => {
    const { editToken } = await createList(app);
    const client = connect(baseUrl, editToken);
    await client.next();
    const id = uid();
    client.send({ ...base, opId: "op-0", kind: "createItem", item: item({ id, position: 1 }) });
    await client.next();
    for (let i = 1; i <= 60; i++) {
      client.send({
        ...base,
        opId: `op-${i}`,
        kind: "updateItem",
        id,
        patch: { done: i % 2 === 0 },
      });
    }
    const replies = [];
    for (let i = 1; i <= 60; i++) replies.push(await client.next());
    // 59 more echoes fill the window (the create was the first); the 61st op in the window is refused.
    expect(replies.slice(0, 59).every((m) => m.type === "op")).toBe(true);
    expect(replies[59]).toMatchObject({ type: "rejected", reason: "too many changes, slow down" });
    client.socket.close();
  });

  it("AC3 a list at the item cap refuses another create", async () => {
    const { editToken } = await createList(app);
    const client = connect(baseUrl, editToken);
    await client.next();
    for (let i = 1; i <= 3; i++) {
      client.send({
        ...base,
        opId: `op-${i}`,
        kind: "createItem",
        item: item({ id: uid(), position: i }),
      });
      await client.next();
    }
    client.send({
      ...base,
      opId: "op-4",
      kind: "createItem",
      item: item({ id: uid(), position: 4 }),
    });
    expect(await client.next()).toMatchObject({
      type: "rejected",
      opId: "op-4",
      reason: "this list is full",
    });
    client.socket.close();
  });

  it("AC4 responses carry the security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' wss: ws:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("AC5 closing the server tells open sockets it is going away (1001)", async () => {
    const own = await buildApp(new Db(":memory:"));
    const url = await listen(own);
    const { editToken } = await createList(own);
    const client = connect(url, editToken);
    await client.next();
    const closed = client.closed();
    await own.close();
    expect(await closed).toBe(1001);
  });
});
