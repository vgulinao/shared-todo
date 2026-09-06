import { describe, expect, it } from "vitest";
import { childrenOf, type Items } from "./apply.ts";
import { idsToToggle, progressOf } from "./subtasks.ts";
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

const group = itemsOf(
  item("p"),
  item("a", { parentId: "p", done: true, position: 1 }),
  item("b", { parentId: "p", position: 2 }),
  item("c", { parentId: "p", position: 3 }),
  item("other"),
);

describe("S7 sub-tasks", () => {
  it("AC2 progressOf counts done sub-tasks out of all sub-tasks", () => {
    expect(progressOf(childrenOf(group, "p"))).toEqual({ done: 1, total: 3 });
    expect(progressOf(childrenOf(group, "other"))).toEqual({ done: 0, total: 0 });
  });

  it("AC4 ticking a parent toggles its open sub-tasks and then the parent", () => {
    expect(idsToToggle(group, "p", true, true)).toEqual(["b", "c", "p"]);
  });

  it("AC4 ticking a parent whose sub-tasks are all done toggles the parent alone", () => {
    const allDone = itemsOf(item("p"), item("a", { parentId: "p", done: true }));
    expect(idsToToggle(allDone, "p", true, true)).toEqual(["p"]);
  });

  it("AC4 unticking a parent reopens the parent only; sub-tasks keep their state", () => {
    expect(idsToToggle(group, "p", false, true)).toEqual(["p"]);
  });

  it("AC4 toggling a sub-task never touches its siblings or parent", () => {
    expect(idsToToggle(group, "b", true, false)).toEqual(["b"]);
    expect(idsToToggle(group, "a", false, false)).toEqual(["a"]);
  });
});
