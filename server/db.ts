import Database, { type Statement } from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import type { Item, ListInfo } from "../shared/types.ts";
import type { Op } from "../shared/protocol.ts";
import { schema } from "./schema.ts";

type ItemRow = {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  done: number;
  cost: number | null;
  position: number;
};

/** The SQLite database: one connection, the statements the app needs, nothing cached in memory. */
export class Db {
  private readonly sqlite: Database.Database;
  private readonly insertList: Statement;
  private readonly findByToken: Statement<
    [string, string],
    { id: string; title: string; edit_token: string }
  >;
  private readonly selectItems: Statement<[string], ItemRow>;
  private readonly topLevelItem: Statement<[string, string], { ok: number }>;
  private readonly anyChild: Statement<[string, string], { ok: number }>;
  private readonly insertItem: Statement;
  private readonly updateItem: Statement;
  private readonly moveItem: Statement;
  private readonly deleteItem: Statement;
  private readonly renameList: Statement;

  constructor(path: string) {
    this.sqlite = new Database(path);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.exec(schema);

    this.insertList = this.sqlite.prepare(
      "INSERT INTO lists (id, title, edit_token, view_token) VALUES (?, ?, ?, ?)",
    );
    this.findByToken = this.sqlite.prepare(
      "SELECT id, title, edit_token FROM lists WHERE edit_token = ? OR view_token = ?",
    );
    this.selectItems = this.sqlite.prepare(
      "SELECT id, parent_id, title, description, done, cost, position FROM items WHERE list_id = ? ORDER BY position",
    );
    this.topLevelItem = this.sqlite.prepare(
      "SELECT 1 AS ok FROM items WHERE id = ? AND list_id = ? AND parent_id IS NULL",
    );
    this.anyChild = this.sqlite.prepare(
      "SELECT 1 AS ok FROM items WHERE parent_id = ? AND list_id = ? LIMIT 1",
    );
    this.insertItem = this.sqlite.prepare(
      `INSERT OR IGNORE INTO items (id, list_id, parent_id, title, description, done, cost, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.updateItem = this.sqlite.prepare(
      `UPDATE items SET
         title = coalesce(?, title),
         description = CASE WHEN ? THEN ? ELSE description END,
         done = coalesce(?, done),
         cost = CASE WHEN ? THEN ? ELSE cost END
       WHERE id = ? AND list_id = ?`,
    );
    this.moveItem = this.sqlite.prepare(
      "UPDATE items SET parent_id = ?, position = ? WHERE id = ? AND list_id = ?",
    );
    this.deleteItem = this.sqlite.prepare("DELETE FROM items WHERE id = ? AND list_id = ?");
    this.renameList = this.sqlite.prepare("UPDATE lists SET title = ? WHERE id = ?");
  }

  createList(title: string): { editToken: string; viewToken: string } {
    const editToken = newToken();
    const viewToken = newToken();
    this.insertList.run(randomUUID(), title, editToken, viewToken);
    return { editToken, viewToken };
  }

  /** Resolves a share token to the list and the role it grants, or null if no list matches. */
  findListByToken(token: string): ListInfo | null {
    const row = this.findByToken.get(token, token);
    if (!row) return null;
    return { id: row.id, title: row.title, role: row.edit_token === token ? "edit" : "view" };
  }

  listItems(listId: string): Item[] {
    return this.selectItems.all(listId).map(toItem);
  }

  /** True if `itemId` is a top-level item of the list, i.e. a valid parent for a sub-task. */
  isTopLevelItem(listId: string, itemId: string): boolean {
    return this.topLevelItem.get(itemId, listId) !== undefined;
  }

  /** True if `itemId` has at least one sub-task in the list. */
  hasChildren(listId: string, itemId: string): boolean {
    return this.anyChild.get(itemId, listId) !== undefined;
  }

  /**
   * Runs one already-validated operation against the list. Returns whether a row changed. Every
   * write is scoped to the list, so an op aimed at another list's item changes nothing.
   */
  applyOp(listId: string, op: Op): boolean {
    switch (op.kind) {
      case "createItem": {
        const { item } = op;
        return (
          this.insertItem.run(
            item.id,
            listId,
            item.parentId,
            item.title,
            item.description,
            item.done ? 1 : 0,
            item.cost,
            item.position,
          ).changes > 0
        );
      }
      case "updateItem": {
        const p = op.patch;
        return (
          this.updateItem.run(
            p.title ?? null,
            "description" in p ? 1 : 0,
            p.description ?? null,
            p.done === undefined ? null : p.done ? 1 : 0,
            "cost" in p ? 1 : 0,
            p.cost ?? null,
            op.id,
            listId,
          ).changes > 0
        );
      }
      case "moveItem":
        return this.moveItem.run(op.parentId, op.position, op.id, listId).changes > 0;
      case "deleteItem":
        return this.deleteItem.run(op.id, listId).changes > 0;
      case "renameList":
        return this.renameList.run(op.title, listId).changes > 0;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}

/** 128 bits of randomness, URL-safe, 22 characters. */
function newToken(): string {
  return randomBytes(16).toString("base64url");
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    done: row.done === 1,
    cost: row.cost,
    position: row.position,
  };
}
