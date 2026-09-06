import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Op } from "../../../shared/protocol.ts";
import type { Item } from "../../../shared/types.ts";
import type { Items } from "../../../shared/apply.ts";
import { childrenOf } from "../../../shared/apply.ts";
import { idsToCompleteWith, progressOf } from "../../../shared/subtasks.ts";
import { createItem, deleteItem, updateItem } from "../lib/ops.ts";
import { AddItem } from "./AddItem.tsx";
import { ItemRow, type ItemRowProps } from "./ItemRow.tsx";
import { SortableItemRow } from "./SortableItemRow.tsx";

type Props = {
  parent: Item;
  items: Items;
  editable: boolean;
  /** Draggable rows (pending list) or plain rows (Completed section). */
  sortable: boolean;
  dispatch: (op: Op) => void;
};

/** A top-level item with its sub-tasks: progress, collapse, inline "add sub-task", nested list. */
export function ItemGroup({ parent, items, editable, sortable, dispatch }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const children = childrenOf(items, parent.id);
  const progress = progressOf(items, parent.id);
  const Row = sortable ? SortableItemRow : ItemRow;

  const rowProps = (item: Item, isParent: boolean): ItemRowProps => ({
    item,
    editable,
    onToggleDone: (done) => {
      // Ticking a parent ticks its open sub-tasks too: ordinary ops, one per item (spec S7 AC4).
      const ids = isParent && done ? idsToCompleteWith(items, item.id) : [item.id];
      for (const id of ids) dispatch(updateItem(id, { done }));
    },
    onRename: (title) => dispatch(updateItem(item.id, { title })),
    onDelete: () => dispatch(deleteItem(item.id)),
  });

  const extras = (
    <>
      {progress.total > 0 && (
        <button
          className="collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show sub-tasks" : "Hide sub-tasks"}
          onClick={() => setCollapsed((v) => !v)}
        >
          <span className="progress">
            {progress.done} / {progress.total}
          </span>
          <span className="chevron">{collapsed ? "▸" : "▾"}</span>
        </button>
      )}
      {editable && !adding && (
        <button
          className="add-subtask"
          aria-label={`Add a sub-task to ${parent.title}`}
          onClick={() => {
            setCollapsed(false);
            setAdding(true);
          }}
        >
          + Sub-task
        </button>
      )}
    </>
  );

  const showChildren = !collapsed && (children.length > 0 || adding);

  return (
    <Row {...rowProps(parent, true)} extras={extras}>
      {progress.total > 0 && (
        <div className="progress-bar" aria-hidden="true">
          <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      {showChildren && (
        <div className="subtasks">
          {children.length > 0 && (
            <SortableContext
              items={children.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
              disabled={!sortable}
            >
              <ul className="items subtask-list">
                {children.map((child) => (
                  <Row key={child.id} {...rowProps(child, false)} />
                ))}
              </ul>
            </SortableContext>
          )}
          {adding && (
            <AddItem
              className="add-item add-item-sub"
              placeholder="Add a sub-task"
              onAdd={(title) => dispatch(createItem(items, title, parent.id))}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </Row>
  );
}
