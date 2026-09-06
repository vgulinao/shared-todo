import type { Item } from "./types.ts";
import type { Op } from "./protocol.ts";

export type Items = ReadonlyMap<string, Item>;

/**
 * Applies one operation to the item map and returns the new map. Pure: the input is never
 * mutated, and an operation that changes nothing returns the same map instance so React can skip
 * a render. Every client runs this same function on the same operations in the same order.
 */
export function apply(items: Items, op: Op): Items {
  switch (op.kind) {
    case "createItem": {
      if (items.has(op.item.id)) return items;
      return new Map(items).set(op.item.id, op.item);
    }
    case "updateItem": {
      const current = items.get(op.id);
      if (!current) return items;
      return new Map(items).set(op.id, { ...current, ...op.patch });
    }
    case "moveItem": {
      const current = items.get(op.id);
      if (!current) return items;
      return new Map(items).set(op.id, {
        ...current,
        parentId: op.parentId,
        position: op.position,
      });
    }
    case "deleteItem": {
      if (!items.has(op.id)) return items;
      const next = new Map(items);
      next.delete(op.id);
      for (const item of items.values()) {
        if (item.parentId === op.id) next.delete(item.id);
      }
      return next;
    }
    case "renameList":
      return items;
  }
}

/**
 * Direct children of `parentId` (null for top level), in display order. Ties on position are
 * broken by id so the order is a pure function of the data: two clients that created items at the
 * same moment (same `nextPosition`) must not end up sorted by their own insertion order. The server
 * orders the snapshot the same way.
 */
export function childrenOf(items: Items, parentId: string | null): Item[] {
  const result: Item[] = [];
  for (const item of items.values()) {
    if (item.parentId === parentId) result.push(item);
  }
  return result.sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
}

/** Position for a new item appended after the current last sibling. */
export function nextPosition(items: Items, parentId: string | null): number {
  let max = 0;
  for (const item of items.values()) {
    if (item.parentId === parentId && item.position > max) max = item.position;
  }
  return max + 1;
}
