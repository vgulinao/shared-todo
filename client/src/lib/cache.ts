import { parseClientMessage, parseItem, type Op } from "../../../shared/protocol.ts";
import type { Item, ListInfo } from "../../../shared/types.ts";

/** What the browser keeps per list so a reload while offline loses nothing (spec S10). */
export type Cached = { list: ListInfo; items: Item[]; pending: Op[] };

export type ListCache = {
  load(): Cached | null;
  /** `acked` are ops this session has seen confirmed; they are dropped from what was stored. */
  save(cached: Cached, acked: ReadonlySet<string>): void;
  clear(): void;
};

export const CACHE_PREFIX = "shared-todo.cache.";

/**
 * Two tabs of one browser may queue edits for the same list while offline. Saving must not let one
 * tab overwrite the other's queue: keep stored ops this tab does not hold and has not seen acked,
 * then this tab's own queue. Pure.
 */
export function mergePending(stored: Op[], current: Op[], acked: ReadonlySet<string>): Op[] {
  const mine = new Set(current.map((op) => op.opId));
  const others = stored.filter((op) => !mine.has(op.opId) && !acked.has(op.opId));
  return [...others, ...current];
}

export function localStorageCache(token: string): ListCache {
  const key = CACHE_PREFIX + token;
  const read = (): Cached | null => {
    try {
      const raw = localStorage.getItem(key);
      return parseCached(raw ? JSON.parse(raw) : null);
    } catch {
      return null;
    }
  };
  return {
    load: read,
    save(cached, acked) {
      try {
        const stored = read();
        const pending = mergePending(stored?.pending ?? [], cached.pending, acked);
        localStorage.setItem(key, JSON.stringify({ ...cached, pending }));
      } catch {
        // Storage unavailable or full: the page still works, it just will not survive a reload offline.
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // nothing to do
      }
    },
  };
}

/**
 * Validates a stored entry element by element with the same parsers the server uses. The contents
 * came from this browser, but from a possibly older version of the app or a truncated write; anything
 * that does not parse is dropped rather than allowed to crash the page.
 */
export function parseCached(v: unknown): Cached | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  const list = c.list as Record<string, unknown> | null;
  if (
    typeof list !== "object" ||
    list === null ||
    typeof list.id !== "string" ||
    typeof list.title !== "string" ||
    (list.role !== "edit" && list.role !== "view") ||
    !(list.viewToken === null || typeof list.viewToken === "string") ||
    !Array.isArray(c.items) ||
    !Array.isArray(c.pending)
  ) {
    return null;
  }
  const items = c.items.map(parseItem).filter((item): item is Item => item !== null);
  const pending = c.pending
    .map((op) => parseClientMessage({ type: "op", op }))
    .flatMap((result) => (result.ok ? [result.value] : []));
  return {
    list: { id: list.id, title: list.title, role: list.role, viewToken: list.viewToken },
    items,
    pending,
  };
}
