import { describe, expect, it } from "vitest";
import { apply, childrenOf, type Items } from "./apply.ts";
import { planMove, positionBetween } from "./order.ts";
import type { Item } from "./types.ts";

function item(id: string, position: number, extra: Partial<Item> = {}): Item {
  return {
    id,
    parentId: null,
    title: id,
    description: null,
    done: false,
    cost: null,
    position,
    ...extra,
  };
}

describe("S6 reorder", () => {
  it("AC3 positionBetween takes the midpoint, or steps past an end", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(null, 1)).toBe(0);
    expect(positionBetween(3, null)).toBe(4);
    expect(positionBetween(null, null)).toBe(1);
  });

  it("AC5 positionBetween returns null when the neighbours are adjacent floats", () => {
    const a = 1;
    const b = 1 + Number.EPSILON; // the next representable double after 1
    expect(positionBetween(a, b)).toBeNull();
  });

  it("AC3 planMove changes one item only, in the normal case", () => {
    const siblings = [item("a", 1), item("b", 2), item("c", 3)];
    expect(planMove(siblings, "c", 0)).toEqual([{ id: "c", position: 0 }]);
    expect(planMove(siblings, "a", 1)).toEqual([{ id: "a", position: 2.5 }]);
    expect(planMove(siblings, "a", 2)).toEqual([{ id: "a", position: 4 }]);
  });

  it("AC5 planMove renumbers the siblings when no float fits, preserving order", () => {
    const siblings = [item("a", 1), item("b", 1 + Number.EPSILON), item("c", 3)];
    const placements = planMove(siblings, "c", 1); // between a and b: no room
    const positions = new Map(placements.map((p) => [p.id, p.position]));
    expect(positions.get("a")).toBe(1);
    expect(positions.get("b")).toBe(2);
    expect(positions.get("c")).toBe(1.5);
  });

  it("AC3 a planned move applied through moveItem yields the intended order", () => {
    const siblings = [item("a", 1), item("b", 2), item("c", 3)];
    let items: Items = new Map(siblings.map((s) => [s.id, s]));
    for (const { id, position } of planMove(siblings, "c", 0)) {
      items = apply(items, {
        opId: id,
        clientId: "t",
        kind: "moveItem",
        id,
        parentId: null,
        position,
      });
    }
    expect(childrenOf(items, null).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("AC7 moving a done item changes its position only", () => {
    const done = item("d", 5, { done: true });
    const items: Items = new Map([["d", done]]);
    const next = apply(items, {
      opId: "o",
      clientId: "t",
      kind: "moveItem",
      id: "d",
      parentId: null,
      position: 0.5,
    });
    expect(next.get("d")).toEqual({ ...done, position: 0.5 });
  });

  it("planMove ignores an item that is not among the siblings", () => {
    expect(planMove([item("a", 1)], "ghost", 0)).toEqual([]);
  });
});
