import { describe, expect, it } from "vitest";
import type { Op } from "../../../shared/protocol.ts";
import { mergePending } from "./cache.ts";

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
