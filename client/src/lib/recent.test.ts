import { describe, expect, it } from "vitest";
import { MAX_RECENT, forget, parseRecent, remember, timeAgo, type RecentList } from "./recent.ts";

const entry = (token: string, at = 0): RecentList => ({ token, title: token, role: "edit", at });

describe("X1 recent lists", () => {
  it("AC2 remember puts a new entry first and refreshes an existing one in place of its old entry", () => {
    let list = remember([], entry("a", 1));
    list = remember(list, entry("b", 2));
    expect(list.map((r) => r.token)).toEqual(["b", "a"]);
    list = remember(list, { ...entry("a", 3), title: "renamed" });
    expect(list.map((r) => r.token)).toEqual(["a", "b"]);
    expect(list[0]?.title).toBe("renamed");
  });

  it("AC2 remember caps the list", () => {
    let list: RecentList[] = [];
    for (let i = 0; i < MAX_RECENT + 5; i++) list = remember(list, entry(`t${i}`, i));
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]?.token).toBe(`t${MAX_RECENT + 4}`);
  });

  it("AC2 forget removes only the given token", () => {
    const list = remember(remember([], entry("a")), entry("b"));
    expect(forget(list, "a").map((r) => r.token)).toEqual(["b"]);
  });

  it("AC2 parseRecent drops malformed storage instead of trusting it", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    const mixed = JSON.stringify([
      entry("ok"),
      { token: 1 },
      { token: "x", title: "y", role: "admin", at: 0 },
    ]);
    expect(parseRecent(mixed).map((r) => r.token)).toEqual(["ok"]);
  });

  it("timeAgo is coarse and readable", () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 5_000, now)).toBe("just now");
    expect(timeAgo(now - 60_000, now)).toBe("1 minute ago");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2 days ago");
  });
});
