import { useState, type CSSProperties, type ReactNode } from "react";
import { normalizeTitle } from "../../../shared/protocol.ts";
import type { Item } from "../../../shared/types.ts";

export type ItemRowProps = {
  item: Item;
  editable: boolean;
  onToggleDone: (done: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  /** Controls rendered between the title and delete (progress, collapse, add sub-task). */
  extras?: ReactNode;
  /** Nested content under the row, e.g. the sub-task list. Moves with the row when dragged. */
  children?: ReactNode;
  /** Set by SortableItemRow when the row can be dragged. */
  handle?: ReactNode;
  rowRef?: (element: HTMLLIElement | null) => void;
  style?: CSSProperties;
  dragging?: boolean;
};

export function ItemRow({
  item,
  editable,
  onToggleDone,
  onRename,
  onDelete,
  extras,
  children,
  handle,
  rowRef,
  style,
  dragging = false,
}: ItemRowProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function save() {
    const title = draft === null ? null : normalizeTitle(draft);
    if (title !== null && title !== item.title) onRename(title);
    setDraft(null);
  }

  const className = ["item", item.done && "done", dragging && "dragging"].filter(Boolean).join(" ");

  return (
    <li ref={rowRef} style={style} className={className}>
      <div className="row">
        {handle}
        <input
          type="checkbox"
          className="item-check"
          checked={item.done}
          disabled={!editable}
          aria-label={`Mark ${item.title} as ${item.done ? "not done" : "done"}`}
          onChange={(e) => onToggleDone(e.target.checked)}
        />
        {!editable ? (
          <span className="item-title">{item.title}</span>
        ) : draft === null ? (
          <button className="item-title" onClick={() => setDraft(item.title)}>
            {item.title}
          </button>
        ) : (
          <input
            className="item-edit"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setDraft(null);
            }}
          />
        )}
        {extras}
        {editable && (
          <button className="item-delete" aria-label={`Delete ${item.title}`} onClick={onDelete}>
            ×
          </button>
        )}
      </div>
      {children}
    </li>
  );
}
