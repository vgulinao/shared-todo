import { childrenOf, type Items } from "./apply.ts";

export type Progress = { done: number; total: number };

/** How many of an item's sub-tasks are done. `total` is 0 for an item without sub-tasks. */
export function progressOf(items: Items, parentId: string): Progress {
  const children = childrenOf(items, parentId);
  return { done: children.filter((c) => c.done).length, total: children.length };
}

/**
 * The ids to mark done when a parent is ticked: its open sub-tasks, then the parent itself.
 * Already-done sub-tasks are left alone, so replaying the resulting ops changes nothing new.
 */
export function idsToCompleteWith(items: Items, parentId: string): string[] {
  const open = childrenOf(items, parentId).filter((c) => !c.done);
  return [...open.map((c) => c.id), parentId];
}
