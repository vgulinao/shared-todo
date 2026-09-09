import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import type { Items } from "../../../shared/apply.ts";
import type { Item } from "../../../shared/types.ts";
import { sameLevelKeyboardCoordinates, siblingsOnly } from "./dnd.ts";

const item = (id: string, parentId: string | null = null): Item => ({
  id,
  parentId,
  title: id,
  description: null,
  done: false,
  cost: null,
  position: 1,
});
const items: Items = new Map(
  [item("a"), item("b"), item("a1", "a"), item("a2", "a"), item("b1", "b")].map((i) => [i.id, i]),
);
const containers = [...items.keys()].map((id) => ({ id }));
const ids = (list: { id: string | number }[]) => list.map((c) => c.id);

describe("S7 drag with sub-tasks", () => {
  it("AC9 a top-level item sees only top-level items, never anyone's sub-tasks", () => {
    expect(ids(siblingsOnly(items, "a", containers))).toEqual(["a", "b"]);
  });

  it("AC9 a sub-task sees only its own siblings, not the parent or another group's sub-tasks", () => {
    expect(ids(siblingsOnly(items, "a1", containers))).toEqual(["a1", "a2"]);
  });

  it("AC9 an unknown active item has no drop targets", () => {
    expect(siblingsOnly(items, "ghost", containers)).toEqual([]);
  });

  it("AC9 keyboard: ArrowDown from a group skips its sub-tasks and lands on the next sibling", () => {
    // Rows on screen, top to bottom: a (0), a1 (40), a2 (80), b (120), b1 (160).
    const rects = new Map(
      [
        ["a", 0],
        ["a1", 40],
        ["a2", 80],
        ["b", 120],
        ["b1", 160],
      ].map(([id, top]) => [
        id,
        { top, left: 0, width: 300, height: 40, right: 300, bottom: (top as number) + 40 },
      ]),
    );
    const getter = sameLevelKeyboardCoordinates(items);
    const args = {
      active: "a",
      currentCoordinates: { x: 0, y: 0 },
      context: {
        collisionRect: rects.get("a"),
        droppableRects: rects,
        droppableContainers: { getEnabled: () => containers },
      },
    } as unknown as Parameters<KeyboardCoordinateGetter>[1];
    const down = { code: "ArrowDown" } as unknown as Parameters<KeyboardCoordinateGetter>[0];
    const up = { code: "ArrowUp" } as unknown as Parameters<KeyboardCoordinateGetter>[0];
    const left = { code: "ArrowLeft" } as unknown as Parameters<KeyboardCoordinateGetter>[0];

    expect(getter(down, args)).toEqual({ x: 0, y: 120 }); // straight to b, over a1 and a2
    expect(getter(up, args)).toBeUndefined(); // nothing above a
    expect(getter(left, args)).toBeUndefined(); // a vertical list ignores left/right
  });
});
