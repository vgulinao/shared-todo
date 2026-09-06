import { describe, expect, it } from "vitest";
import { apply, childrenOf, nextPosition, type Items } from "./apply.ts";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeTitle,
  parseClientMessage,
  type Op,
} from "./protocol.ts";
import type { Item } from "./types.ts";

const base = { opId: "op-1", clientId: "client-a" };

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    parentId: null,
    title: overrides.id,
    description: null,
    done: false,
    cost: null,
    position: 1,
    ...overrides,
  };
}

function itemsOf(...list: Item[]): Items {
  return new Map(list.map((i) => [i.id, i]));
}

describe("S1 create items", () => {
  it("AC2 createItem adds the item after the existing ones", () => {
    const items = itemsOf(item({ id: "a", position: 1 }));
    const op: Op = { ...base, kind: "createItem", item: item({ id: "b", position: 2 }) };
    const next = apply(items, op);
    expect(childrenOf(next, null).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("AC2 applying the same createItem twice adds the item once", () => {
    const op: Op = { ...base, kind: "createItem", item: item({ id: "a" }) };
    const once = apply(itemsOf(), op);
    const twice = apply(once, op);
    expect(twice.size).toBe(1);
    expect(twice).toBe(once);
  });

  it("AC2 nextPosition appends to the bottom", () => {
    const items = itemsOf(item({ id: "a", position: 1 }), item({ id: "b", position: 4.5 }));
    expect(nextPosition(items, null)).toBe(5.5);
    expect(nextPosition(itemsOf(), null)).toBe(1);
  });

  it("AC3 normalizeTitle trims and rejects empty or too long titles", () => {
    expect(normalizeTitle("  milk  ")).toBe("milk");
    expect(normalizeTitle("")).toBeNull();
    expect(normalizeTitle("   ")).toBeNull();
    expect(normalizeTitle("x".repeat(MAX_TITLE_LENGTH))).toHaveLength(MAX_TITLE_LENGTH);
    expect(normalizeTitle("x".repeat(MAX_TITLE_LENGTH + 1))).toBeNull();
  });

  it("AC5 updateItem changes only the patched fields", () => {
    const items = itemsOf(item({ id: "a", title: "milk", done: false }));
    const op: Op = { ...base, kind: "updateItem", id: "a", patch: { title: "oat milk" } };
    const next = apply(items, op);
    expect(next.get("a")).toMatchObject({ title: "oat milk", done: false });
  });

  it("AC5 updateItem on a missing item is a no-op", () => {
    const items = itemsOf(item({ id: "a" }));
    const op: Op = { ...base, kind: "updateItem", id: "ghost", patch: { title: "x" } };
    expect(apply(items, op)).toBe(items);
  });

  it("AC6 deleteItem removes the item", () => {
    const items = itemsOf(item({ id: "a" }), item({ id: "b" }));
    const next = apply(items, { ...base, kind: "deleteItem", id: "a" });
    expect([...next.keys()]).toEqual(["b"]);
  });

  it("AC6 deleteItem twice is a no-op the second time", () => {
    const items = itemsOf(item({ id: "a" }));
    const once = apply(items, { ...base, kind: "deleteItem", id: "a" });
    expect(apply(once, { ...base, kind: "deleteItem", id: "a" })).toBe(once);
  });
});

describe("protocol rules", () => {
  it("deleteItem also removes the item's sub-tasks", () => {
    const items = itemsOf(
      item({ id: "p" }),
      item({ id: "c1", parentId: "p" }),
      item({ id: "c2", parentId: "p" }),
      item({ id: "other" }),
    );
    const next = apply(items, { ...base, kind: "deleteItem", id: "p" });
    expect([...next.keys()]).toEqual(["other"]);
  });

  it("apply never mutates its input", () => {
    const items = itemsOf(item({ id: "a" }));
    apply(items, { ...base, kind: "updateItem", id: "a", patch: { done: true } });
    apply(items, { ...base, kind: "deleteItem", id: "a" });
    expect(items.get("a")?.done).toBe(false);
    expect(items.size).toBe(1);
  });

  it("parseClientMessage accepts a well-formed createItem", () => {
    const result = parseClientMessage({
      type: "op",
      op: { ...base, kind: "createItem", item: item({ id: "a", title: "  eggs " }) },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "createItem") {
      expect(result.value.item.title).toBe("eggs");
    }
  });

  it("parseClientMessage rejects malformed input", () => {
    expect(parseClientMessage(null).ok).toBe(false);
    expect(parseClientMessage({ type: "nope" }).ok).toBe(false);
    expect(parseClientMessage({ type: "op", op: { kind: "createItem" } }).ok).toBe(false);
    expect(
      parseClientMessage({ type: "op", op: { ...base, kind: "createItem", item: { id: "a" } } }).ok,
    ).toBe(false);
    expect(
      parseClientMessage({
        type: "op",
        op: { ...base, kind: "updateItem", id: "a", patch: { title: " " } },
      }).ok,
    ).toBe(false);
    expect(parseClientMessage({ type: "op", op: { ...base, kind: "explode", id: "a" } }).ok).toBe(
      false,
    );
  });
});

describe("S2 mark done", () => {
  it("AC1/AC2 toggling done never touches the position", () => {
    const items = itemsOf(item({ id: "a", position: 1 }), item({ id: "b", position: 2 }));
    const done = apply(items, { ...base, kind: "updateItem", id: "a", patch: { done: true } });
    expect(done.get("a")).toMatchObject({ done: true, position: 1 });
    expect(childrenOf(done, null).map((i) => i.id)).toEqual(["a", "b"]);

    const undone = apply(done, { ...base, kind: "updateItem", id: "a", patch: { done: false } });
    expect(undone.get("a")).toEqual(items.get("a"));
  });
});

describe("S9 markdown descriptions", () => {
  it("AC6 the protocol accepts null and a 5 000-char description, rejects longer or non-string", () => {
    const parse = (description: unknown) =>
      parseClientMessage({
        type: "op",
        op: { ...base, kind: "updateItem", id: "a", patch: { description } },
      }).ok;
    expect(parse(null)).toBe(true);
    expect(parse("x".repeat(MAX_DESCRIPTION_LENGTH))).toBe(true);
    expect(parse("x".repeat(MAX_DESCRIPTION_LENGTH + 1))).toBe(false);
    expect(parse(42)).toBe(false);
  });
});
