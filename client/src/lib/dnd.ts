import { closestCenter, type CollisionDetection } from "@dnd-kit/core";
import type { Items } from "../../../shared/apply.ts";

/**
 * Only the dragged item's siblings can be drop targets. With one DndContext and a sortable list per
 * level, the default detection would happily report a sub-task as "over" while a top-level item is
 * dragged past its group (or a parent's own sub-tasks while the parent is dragged), and the sorting
 * strategy then finds no such id among its items and snaps everything back mid-drag.
 */
export function siblingsOnly<T extends { id: string | number }>(
  items: Items,
  activeId: string | number,
  containers: T[],
): T[] {
  const active = items.get(String(activeId));
  if (!active) return containers;
  return containers.filter((c) => items.get(String(c.id))?.parentId === active.parentId);
}

export function sameLevelCollision(items: Items): CollisionDetection {
  return (args) =>
    closestCenter({
      ...args,
      droppableContainers: siblingsOnly(items, args.active.id, args.droppableContainers),
    });
}
