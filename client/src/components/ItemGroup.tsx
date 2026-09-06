import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Op } from "../../../shared/protocol.ts";
import type { Item } from "../../../shared/types.ts";
import { childrenOf, type Items } from "../../../shared/apply.ts";
import { idsToToggle, progressOf } from "../../../shared/subtasks.ts";
import { subtotalOf } from "../../../shared/cost.ts";
import { CostControl } from "./CostControl.tsx";
import { Description } from "./Description.tsx";
import { createItem, deleteItem, updateItem } from "../lib/ops.ts";
import { AddItem } from "./AddItem.tsx";
import { ItemRow, type ItemRowProps } from "./ItemRow.tsx";
import { SortableItemRow } from "./SortableItemRow.tsx";

export type NotesDraft = { id: string; text: string };

type Props = {
  parent: Item;
  items: Items;
  editable: boolean;
  /** Draggable rows inside the page's DndContext (pending list), or plain rows (Completed, view-only). */
  sortable: boolean;
  notesDraft: NotesDraft | null;
  onNotesDraft: (draft: NotesDraft | null) => void;
  dispatch: (op: Op) => void;
};

/** A top-level item with its sub-tasks: progress, collapse, inline "add sub-task", nested list. */
export function ItemGroup({
  parent,
  items,
  editable,
  sortable,
  notesDraft,
  onNotesDraft,
  dispatch,
}: Props) {
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

  const costOf = (item: Item, isParent: boolean) => (
    <CostControl
      own={item.cost}
      subtasks={isParent ? subtotalOf({ ...item, cost: null }, children) : null}
      editable={editable}
      itemTitle={item.title}
      onChange={(cost) => dispatch(updateItem(item.id, { cost }))}
    />
  );

  const notesButton = (item: Item) =>
    editable && notesDraft?.id !== item.id ? (
      <button
        className="add-notes"
        aria-label={`${item.description === null ? "Add" : "Edit"} notes for ${item.title}`}
        onClick={() => onNotesDraft({ id: item.id, text: item.description ?? "" })}
      >
        {item.description === null ? "+ notes" : "notes"}
      </button>
    ) : null;

  const description = (item: Item) => (
    <Description
      text={item.description}
      editable={editable}
      draft={notesDraft?.id === item.id ? notesDraft.text : null}
      onDraftChange={(text) => onNotesDraft(text === null ? null : { id: item.id, text })}
      onChange={(text) => dispatch(updateItem(item.id, { description: text }))}
    />
  );

  const extras = (
    <>
      {notesButton(parent)}
      {costOf(parent, true)}
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
  const childRows = children.map((child) => (
    <Row
      key={child.id}
      {...rowProps(child, false)}
      extras={
        <>
          {notesButton(child)}
          {costOf(child, false)}
        </>
      }
    >
      {description(child)}
    </Row>
  ));

  return (
    <Row {...rowProps(parent, true)} extras={extras}>
      {description(parent)}
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
