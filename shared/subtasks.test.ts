import { describe, expect, it } from "vitest";
import type { Items } from "./apply.ts";
import { idsToCompleteWith, progressOf } from "./subtasks.ts";
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

describe("S7 sub-tasks", () => {
  it("AC2 progressOf counts done sub-tasks out of all sub-tasks", () => {
    const items = itemsOf(
      item("p"),
      item("a", { parentId: "p", done: true, position: 1 }),
      item("b", { parentId: "p", position: 2 }),
      item("c", { parentId: "p", done: true, position: 3 }),
      item("other"),
    );
    expect(progressOf(items, "p")).toEqual({ done: 2, total: 3 });
    expect(progressOf(items, "other")).toEqual({ done: 0, total: 0 });
  });

  it("AC4 idsToCompleteWith lists the open sub-tasks and then the parent", () => {
    const items = itemsOf(
      item("p"),
      item("a", { parentId: "p", done: true, position: 1 }),
      item("b", { parentId: "p", position: 2 }),
      item("c", { parentId: "p", position: 3 }),
    );
    expect(idsToCompleteWith(items, "p")).toEqual(["b", "c", "p"]);
  });

  it("AC4 a parent without open sub-tasks completes alone", () => {
    const items = itemsOf(item("p"), item("a", { parentId: "p", done: true }));
    expect(idsToCompleteWith(items, "p")).toEqual(["p"]);
  });
});
