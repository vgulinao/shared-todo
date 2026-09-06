import type { Item } from "./types.ts";

export type Placement = { id: string; position: number };

/**
 * A position strictly between two neighbours, or past the end when a neighbour is missing.
 * Returns null when the neighbours are adjacent floats and nothing fits between them.
 */
export function positionBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  const mid = (before + after) / 2;
  return mid > before && mid < after ? mid : null;
}

/**
 * The placements that move `itemId` to `toIndex` among `siblings` (given in display order).
 * Normally one placement. When no float fits between the new neighbours, every sibling is first
 * renumbered to a whole number so the move has room; order is preserved.
 */
export function planMove(siblings: Item[], itemId: string, toIndex: number): Placement[] {
  const others = siblings.filter((s) => s.id !== itemId);
  if (others.length === siblings.length) return [];
  const index = Math.max(0, Math.min(toIndex, others.length));
  const before = others[index - 1]?.position ?? null;
  const after = others[index]?.position ?? null;

  const position = positionBetween(before, after);
  if (position !== null) return [{ id: itemId, position }];

  // Renumber: others get 1..n in order, the moved item lands on the half step in its slot.
  const placements: Placement[] = others.map((s, i) => ({ id: s.id, position: i + 1 }));
  placements.push({ id: itemId, position: index + 0.5 });
  return placements;
}
