import { nextPosition, type Items } from "../../../shared/apply.ts";
import type { ItemPatch, Op } from "../../../shared/protocol.ts";

const CLIENT_ID_KEY = "shared-todo.clientId";

/** A stable anonymous id for this browser. It labels operations; it grants nothing. */
function clientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function stamp() {
  return { opId: crypto.randomUUID(), clientId: clientId() };
}

export function createItem(items: Items, title: string, parentId: string | null = null): Op {
  return {
    ...stamp(),
    kind: "createItem",
    item: {
      id: crypto.randomUUID(),
      parentId,
      title,
      description: null,
      done: false,
      cost: null,
      position: nextPosition(items, parentId),
    },
  };
}

export function updateItem(id: string, patch: ItemPatch): Op {
  return { ...stamp(), kind: "updateItem", id, patch };
}

export function deleteItem(id: string): Op {
  return { ...stamp(), kind: "deleteItem", id };
}

export function renameList(title: string): Op {
  return { ...stamp(), kind: "renameList", title };
}

export function moveItem(id: string, parentId: string | null, position: number): Op {
  return { ...stamp(), kind: "moveItem", id, parentId, position };
}
