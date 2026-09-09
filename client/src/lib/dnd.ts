import {
  closestCenter,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import type { Items } from "../../../shared/apply.ts";

/**
 * Only the dragged item's siblings can be drop targets (spec S7 AC9). With one DndContext and a
 * sortable list per level, the default detection would happily report a sub-task as "over" while a
 * top-level item is dragged past its group (or a parent's own sub-tasks while the parent is dragged),
 * and the sorting strategy then finds no such id among its items and snaps everything back mid-drag.
 * An unknown active item yields no targets at all: dropping nowhere is the honest answer.
 */
export function siblingsOnly<T extends { id: string | number }>(
  items: Items,
  activeId: string | number,
  containers: T[],
): T[] {
  const active = items.get(String(activeId));
  if (!active) return [];
  return containers.filter((c) => items.get(String(c.id))?.parentId === active.parentId);
}

export function sameLevelCollision(items: Items): CollisionDetection {
  return (args) =>
    closestCenter({
      ...args,
      droppableContainers: siblingsOnly(items, args.active.id, args.droppableContainers),
    });
}

/**
 * Keyboard reordering: ArrowUp / ArrowDown move the dragged row to the nearest sibling above or below.
 * The library's own getter looks at every level, so on a keyboard a top-level item would step through a
 * neighbouring group's sub-tasks one row at a time; this one steps sibling to sibling.
 */
export function sameLevelKeyboardCoordinates(items: Items): KeyboardCoordinateGetter {
  return (event, { active, currentCoordinates, context }) => {
    const direction = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
    const { collisionRect, droppableRects, droppableContainers } = context;
    if (direction === 0 || !collisionRect) return undefined;

    const siblings = siblingsOnly(items, active, droppableContainers.getEnabled()).filter(
      (c) => c.id !== active,
    );
    const tops = siblings
      .map((c) => droppableRects.get(c.id)?.top)
      .filter((top): top is number => top !== undefined)
      .filter((top) => (direction > 0 ? top > collisionRect.top : top < collisionRect.top))
      .sort((a, b) => direction * (a - b));
    const next = tops[0];
    if (next === undefined) return undefined;
    return { x: currentCoordinates.x, y: currentCoordinates.y + (next - collisionRect.top) };
  };
}
