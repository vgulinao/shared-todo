import { useState } from "react";
import { normalizeTitle } from "../../../shared/protocol.ts";
import type { Item } from "../../../shared/types.ts";

type Props = {
  item: Item;
  editable: boolean;
  onToggleDone: (done: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
};

export function ItemRow({ item, editable, onToggleDone, onRename, onDelete }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  function save() {
    const title = draft === null ? null : normalizeTitle(draft);
    if (title !== null && title !== item.title) onRename(title);
    setDraft(null);
  }

  return (
    <li className={item.done ? "item done" : "item"}>
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
      {editable && (
        <button className="item-delete" aria-label={`Delete ${item.title}`} onClick={onDelete}>
          ×
        </button>
      )}
    </li>
  );
}
