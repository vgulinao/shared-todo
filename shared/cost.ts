import type { Items } from "./apply.ts";
import type { Item } from "./types.ts";

/** A parent's own cost plus its sub-tasks' costs, or null when none of them has a cost. */
export function subtotalOf(parent: Item, children: Item[]): number | null {
  return sum([parent, ...children]);
}

/** The sum of every item's cost in the list, or null when no item has a cost. */
export function totalOf(items: Items): number | null {
  return sum([...items.values()]);
}

function sum(list: Item[]): number | null {
  const costs = list.map((i) => i.cost).filter((c): c is number => c !== null);
  if (costs.length === 0) return null;
  return round2(costs.reduce((a, b) => a + b, 0));
}

/** Costs are kept to two decimals; this also keeps float sums presentable. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
