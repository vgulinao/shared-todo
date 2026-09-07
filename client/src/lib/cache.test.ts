import { describe, expect, it } from "vitest";
import type { Op } from "../../../shared/protocol.ts";
import { mergePending, parseCached } from "./cache.ts";

const op = (opId: string): Op => ({ opId, clientId: "c", kind: "deleteItem", id: "x" });
const ids = (ops: Op[]) => ops.map((o) => o.opId);

describe("S10 offline cache", () => {
  it("AC6 mergePending keeps the other tab's queued ops, then this tab's, without duplicates", () => {
    const stored = [op("a"), op("b"), op("c")]; // written by another tab (or an earlier session)
    const current = [op("c"), op("d")]; // this tab's queue; c is shared
    expect(ids(mergePending(stored, current, new Set()))).toEqual(["a", "b", "c", "d"]);
  });

  it("AC6 mergePending drops stored ops this session has already seen acknowledged", () => {
    const stored = [op("a"), op("b")];
    expect(ids(mergePending(stored, [], new Set(["a"])))).toEqual(["b"]);
  });

  it("AC6 mergePending with nothing stored is just the current queue", () => {
    expect(ids(mergePending([], [op("x")], new Set()))).toEqual(["x"]);
  });
});

describe("S10 offline cache — stored entries are validated", () => {
  const list = { id: "l1", title: "Groceries", role: "edit", viewToken: "v" };
  const item = {
    id: "a",
    parentId: null,
    title: "milk",
    description: null,
    done: false,
    cost: null,
    position: 1,
  };

  it("accepts a well-formed entry", () => {
    const parsed = parseCached({ list, items: [item], pending: [op("x")] });
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.pending).toHaveLength(1);
  });

  it("drops malformed items and ops instead of crashing the page", () => {
    const parsed = parseCached({
      list,
      items: [item, null, { id: 1 }],
      pending: [op("x"), { kind: "explode" }, null],
    });
    expect(parsed?.items.map((i) => i.id)).toEqual(["a"]);
    expect(parsed?.pending.map((o) => o.opId)).toEqual(["x"]);
  });

  it("rejects an entry whose list is not a list", () => {
    expect(parseCached({ list: [], items: [], pending: [] })).toBeNull();
    expect(parseCached({ list: { id: "l1" }, items: [], pending: [] })).toBeNull();
    expect(parseCached(null)).toBeNull();
  });
});
