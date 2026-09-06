import { describe, expect, it } from "vitest";
import type { Items } from "./apply.ts";
import { round2, subtotalOf, totalOf } from "./cost.ts";
import { parseClientMessage } from "./protocol.ts";
import type { Item } from "./types.ts";

function item(id: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    parentId: null,
    title: id,
    description: null,
    done: false,
    cost: null,
    position: 1,
    ...extra,
  };
}
const itemsOf = (...list: Item[]): Items => new Map(list.map((i) => [i.id, i]));

describe("S8 cost", () => {
  it("AC4 subtotalOf adds the parent's own cost and its sub-tasks' costs", () => {
    const parent = item("p", { cost: 15 });
    const children = [item("a", { cost: 10.5 }), item("b"), item("c", { cost: 19.5 })];
    expect(subtotalOf(parent, children)).toBe(45);
  });

  it("AC4 subtotalOf without an own cost is the sub-tasks' sum; with no costs at all it is null", () => {
    expect(subtotalOf(item("p"), [item("a", { cost: 2 }), item("b", { cost: 3 })])).toBe(5);
    expect(subtotalOf(item("p"), [item("a"), item("b")])).toBeNull();
    expect(subtotalOf(item("p"), [])).toBeNull();
  });

  it("AC5 totalOf sums every level, ignores nulls, and is null when nothing has a cost", () => {
    const items = itemsOf(
      item("p", { cost: 1 }),
      item("a", { parentId: "p", cost: 2 }),
      item("q"),
      item("b", { parentId: "q", cost: 0.1 }),
      item("c", { parentId: "q", cost: 0.2 }),
    );
    expect(totalOf(items)).toBe(3.3); // 0.1 + 0.2 would otherwise be 0.30000000000000004
    expect(totalOf(itemsOf(item("x"), item("y")))).toBeNull();
    expect(totalOf(itemsOf(item("z", { cost: 0 })))).toBe(0);
  });

  it("round2 keeps two decimals", () => {
    expect(round2(1.005)).toBe(1); // float 1.005 is just under; documents the behaviour
    expect(round2(2.345)).toBe(2.35);
    expect(round2(10)).toBe(10);
  });

  it("AC3 the protocol accepts null and zero costs and rejects negative or non-numeric ones", () => {
    const base = { opId: "o", clientId: "c", kind: "updateItem", id: "a" };
    const parse = (cost: unknown) =>
      parseClientMessage({ type: "op", op: { ...base, patch: { cost } } }).ok;
    expect(parse(null)).toBe(true);
    expect(parse(0)).toBe(true);
    expect(parse(12.5)).toBe(true);
    expect(parse(-1)).toBe(false);
    expect(parse("12")).toBe(false);
    expect(parse(Number.NaN)).toBe(false);
  });
});
