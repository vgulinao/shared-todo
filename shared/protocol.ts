import type { Item, ListInfo, Result } from "./types.ts";

export const MAX_TITLE_LENGTH = 500;

export type ItemPatch = Partial<Pick<Item, "title" | "description" | "done" | "cost">>;

export type Op = { opId: string; clientId: string } & (
  | { kind: "createItem"; item: Item }
  | { kind: "updateItem"; id: string; patch: ItemPatch }
  | { kind: "moveItem"; id: string; parentId: string | null; position: number }
  | { kind: "deleteItem"; id: string }
  | { kind: "renameList"; title: string }
);

export type ClientMessage = { type: "op"; op: Op };

export type ServerMessage =
  | { type: "snapshot"; list: ListInfo; items: Item[] }
  | { type: "op"; op: Op }
  | { type: "rejected"; opId: string | null; reason: string };

/** Trims a title. Returns null when the result is empty or too long. */
export function normalizeTitle(raw: string): string | null {
  const title = raw.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) return null;
  return title;
}

/**
 * Validates an untrusted client message. The server calls this on every frame; the client never
 * needs it because it builds ops itself.
 */
export function parseClientMessage(raw: unknown): Result<Op> {
  if (!isRecord(raw) || raw.type !== "op" || !isRecord(raw.op)) {
    return { ok: false, reason: "expected { type: 'op', op }" };
  }
  const op = raw.op;
  if (!isString(op.opId) || !isString(op.clientId)) {
    return { ok: false, reason: "op needs opId and clientId" };
  }
  const base = { opId: op.opId, clientId: op.clientId };

  switch (op.kind) {
    case "createItem": {
      const item = parseItem(op.item);
      if (!item) return { ok: false, reason: "invalid item" };
      return { ok: true, value: { ...base, kind: "createItem", item } };
    }
    case "updateItem": {
      if (!isString(op.id)) return { ok: false, reason: "updateItem needs id" };
      const patch = parsePatch(op.patch);
      if (!patch) return { ok: false, reason: "invalid patch" };
      return { ok: true, value: { ...base, kind: "updateItem", id: op.id, patch } };
    }
    case "moveItem": {
      if (!isString(op.id) || !isNullableString(op.parentId) || !isFinite(op.position)) {
        return { ok: false, reason: "moveItem needs id, parentId, position" };
      }
      return {
        ok: true,
        value: {
          ...base,
          kind: "moveItem",
          id: op.id,
          parentId: op.parentId,
          position: op.position,
        },
      };
    }
    case "deleteItem": {
      if (!isString(op.id)) return { ok: false, reason: "deleteItem needs id" };
      return { ok: true, value: { ...base, kind: "deleteItem", id: op.id } };
    }
    case "renameList": {
      const title = isString(op.title) ? normalizeTitle(op.title) : null;
      if (title === null) return { ok: false, reason: "invalid title" };
      return { ok: true, value: { ...base, kind: "renameList", title } };
    }
    default:
      return { ok: false, reason: "unknown op kind" };
  }
}

function parseItem(raw: unknown): Item | null {
  if (!isRecord(raw)) return null;
  const title = isString(raw.title) ? normalizeTitle(raw.title) : null;
  if (
    !isString(raw.id) ||
    !isNullableString(raw.parentId) ||
    title === null ||
    !isNullableString(raw.description) ||
    typeof raw.done !== "boolean" ||
    !isNullableFinite(raw.cost) ||
    !isFinite(raw.position)
  ) {
    return null;
  }
  return {
    id: raw.id,
    parentId: raw.parentId,
    title,
    description: raw.description,
    done: raw.done,
    cost: raw.cost,
    position: raw.position,
  };
}

function parsePatch(raw: unknown): ItemPatch | null {
  if (!isRecord(raw)) return null;
  const patch: ItemPatch = {};
  if ("title" in raw) {
    const title = isString(raw.title) ? normalizeTitle(raw.title) : null;
    if (title === null) return null;
    patch.title = title;
  }
  if ("description" in raw) {
    if (!isNullableString(raw.description)) return null;
    patch.description = raw.description;
  }
  if ("done" in raw) {
    if (typeof raw.done !== "boolean") return null;
    patch.done = raw.done;
  }
  if ("cost" in raw) {
    if (!isNullableFinite(raw.cost)) return null;
    patch.cost = raw.cost;
  }
  return patch;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}
function isFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isNullableFinite(v: unknown): v is number | null {
  return v === null || isFinite(v);
}
