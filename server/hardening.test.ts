import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_MESSAGE_BYTES } from "../shared/protocol.ts";
import { RATE_LIMITED_CLOSE_CODE, buildApp } from "./app.ts";
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

  it("AC2 a flood of frames closes the socket with 4029; nothing was rejected or settled", async () => {
    const { editToken } = await createList(app);
    const client = connect(baseUrl, editToken);
    await client.next();
    // 600 frames of any kind fill the window (malformed ones count too); the 601st closes the socket.
    for (let i = 0; i < 601; i++) client.socket.send("flood");
    expect(await client.closed()).toBe(RATE_LIMITED_CLOSE_CODE);

    // A read-only socket is bounded the same way (it would otherwise get a snapshot per rejection).
    const { viewToken } = await createList(app);
    const viewer = connect(baseUrl, viewToken);
    await viewer.next();
    for (let i = 0; i < 601; i++) viewer.socket.send("flood");
    expect(await viewer.closed()).toBe(RATE_LIMITED_CLOSE_CODE);
  });

  it("AC2 a bulk gesture under the limit goes through in full", async () => {
    const { editToken } = await createList(app);
    const client = connect(baseUrl, editToken);
    await client.next();
    const id = uid();
    client.send({ ...base, opId: "op-0", kind: "createItem", item: item({ id, position: 1 }) });
    await client.next();
    for (let i = 1; i <= 100; i++) {
      client.send({
        ...base,
        opId: `op-${i}`,
        kind: "updateItem",
        id,
        patch: { done: i % 2 === 0 },
      });
    }
    for (let i = 1; i <= 100; i++) expect((await client.next()).type).toBe("op");
    client.socket.close();
  });

  it("AC3 a list at the item cap refuses another create", async () => {
    const { editToken } = await createList(app);
    const client = connect(baseUrl, editToken);
    await client.next();
    const firstId = uid();
    for (let i = 1; i <= 3; i++) {
      client.send({
        ...base,
        opId: `op-${i}`,
        kind: "createItem",
        item: item({ id: i === 1 ? firstId : uid(), position: i }),
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
    await client.next(); // the snapshot that follows a rejection
    // A replayed create of an item the list already holds is acknowledged even at the cap (S10).
    client.send({
      ...base,
      opId: "op-1",
      kind: "createItem",
      item: item({ id: firstId, position: 1 }),
    });
    expect(await client.next()).toMatchObject({ type: "op", op: { opId: "op-1" } });
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
