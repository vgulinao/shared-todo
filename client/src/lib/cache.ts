import type { Op } from "../../../shared/protocol.ts";
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
      const value: unknown = raw ? JSON.parse(raw) : null;
      return isCached(value) ? value : null;
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

/** Shape check only; the contents came from this browser, not from a stranger. */
function isCached(v: unknown): v is Cached {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.list === "object" &&
    c.list !== null &&
    Array.isArray(c.items) &&
    Array.isArray(c.pending)
  );
}
