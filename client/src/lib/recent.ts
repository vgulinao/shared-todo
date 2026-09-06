import type { Role } from "../../../shared/types.ts";

/** A list this browser has opened. Only links the browser already holds; nothing comes from the server. */
export type RecentList = { token: string; title: string; role: Role; at: number };

export const RECENT_KEY = "shared-todo.recent";
export const MAX_RECENT = 20;

/** Adds or refreshes an entry and puts it first. Pure. */
export function remember(list: RecentList[], entry: RecentList): RecentList[] {
  return [entry, ...list.filter((r) => r.token !== entry.token)].slice(0, MAX_RECENT);
}

/** Updates the title of an existing entry without moving it or touching `at`. Pure. */
export function retitle(list: RecentList[], token: string, title: string): RecentList[] {
  return list.map((r) => (r.token === token && r.title !== title ? { ...r, title } : r));
}

/** Removes an entry. Pure. */
export function forget(list: RecentList[], token: string): RecentList[] {
  return list.filter((r) => r.token !== token);
}

/** Parses what localStorage held; anything malformed is dropped rather than trusted. */
export function parseRecent(raw: string | null): RecentList[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isRecentList).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function isRecentList(v: unknown): v is RecentList {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.token === "string" &&
    typeof r.title === "string" &&
    (r.role === "edit" || r.role === "view") &&
    typeof r.at === "number"
  );
}

export function loadRecent(): RecentList[] {
  try {
    return parseRecent(localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

export function saveRecent(list: RecentList[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode, quota): the feature simply does not remember.
  }
}

/** "just now", "5 minutes ago", "3 days ago". Coarse on purpose, and never more than has passed. */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
