import { childrenOf, type Items } from "./apply.ts";
import type { Item } from "./types.ts";

export type Progress = { done: number; total: number };

/** How many of a parent's sub-tasks are done. `total` is 0 for an item without sub-tasks. */
export function progressOf(children: Item[]): Progress {
  return { done: children.filter((c) => c.done).length, total: children.length };
}

/**
 * Which items change `done` when the user toggles one (spec S7 AC4):
 * - ticking a parent: its open sub-tasks, then the parent (already-done ones are left alone, so a
 *   replay adds nothing new);
 * - unticking a parent: the parent only — sub-tasks keep their state;
 * - a sub-task: itself only.
 */
export function idsToToggle(items: Items, id: string, done: boolean, isParent: boolean): string[] {
  if (!isParent || !done) return [id];
  const open = childrenOf(items, id).filter((c) => !c.done);
  return [...open.map((c) => c.id), id];
}
