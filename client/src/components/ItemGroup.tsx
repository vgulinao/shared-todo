import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Op } from "../../../shared/protocol.ts";
import type { Item } from "../../../shared/types.ts";
import { childrenOf, type Items } from "../../../shared/apply.ts";
import { idsToToggle, progressOf } from "../../../shared/subtasks.ts";
import { createItem, deleteItem, updateItem } from "../lib/ops.ts";
import { AddItem } from "./AddItem.tsx";
import { ItemRow, type ItemRowProps } from "./ItemRow.tsx";
import { SortableItemRow } from "./SortableItemRow.tsx";

type Props = {
  parent: Item;
  items: Items;
  editable: boolean;
  /** Draggable rows inside the page's DndContext (pending list), or plain rows (Completed, view-only). */
  sortable: boolean;
  dispatch: (op: Op) => void;
};

/** A top-level item with its sub-tasks: progress, collapse, inline "add sub-task", nested list. */
export function ItemGroup({ parent, items, editable, sortable, dispatch }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const children = childrenOf(items, parent.id);
  const progress = progressOf(children);
  const Row = sortable ? SortableItemRow : ItemRow;

  const rowProps = (item: Item, isParent: boolean): ItemRowProps => ({
    item,
    editable,
    onToggleDone: (done) => {
      for (const id of idsToToggle(items, item.id, done, isParent)) {
        dispatch(updateItem(id, { done }));
      }
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
  const childRows = children.map((child) => <Row key={child.id} {...rowProps(child, false)} />);

  return (
    <Row {...rowProps(parent, true)} extras={extras}>
      {progress.total > 0 && (
        <div className="progress-bar" aria-hidden="true">
          <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      {showChildren && (
        <div className="subtasks">
          {children.length > 0 &&
            (sortable ? (
              <SortableContext
                items={children.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="items subtask-list">{childRows}</ul>
              </SortableContext>
            ) : (
              <ul className="items subtask-list">{childRows}</ul>
            ))}
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
