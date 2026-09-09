import { describe, expect, it } from "vitest";
import type { Items } from "../../../shared/apply.ts";
import type { Item } from "../../../shared/types.ts";
import { siblingsOnly } from "./dnd.ts";

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

describe("S6/S7 drag: only siblings are drop targets", () => {
  it("a top-level item sees only top-level items, never anyone's sub-tasks", () => {
    expect(ids(siblingsOnly(items, "a", containers))).toEqual(["a", "b"]);
  });

  it("a sub-task sees only its own siblings, not the parent or another group's sub-tasks", () => {
    expect(ids(siblingsOnly(items, "a1", containers))).toEqual(["a1", "a2"]);
  });

  it("an unknown active id leaves the containers untouched", () => {
    expect(ids(siblingsOnly(items, "ghost", containers))).toEqual(ids(containers));
  });
});
