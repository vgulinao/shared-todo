import { useState } from "react";
import { normalizeTitle } from "../../../shared/protocol.ts";
import type { Item } from "../../../shared/types.ts";

type Props = {
  item: Item;
  onRename: (title: string) => void;
  onDelete: () => void;
};

export function ItemRow({ item, onRename, onDelete }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  function save() {
    const title = draft === null ? null : normalizeTitle(draft);
    if (title !== null && title !== item.title) onRename(title);
    setDraft(null);
  }

  return (
    <li className="item">
      {draft === null ? (
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
      <button className="item-delete" aria-label={`Delete ${item.title}`} onClick={onDelete}>
        ×
      </button>
    </li>
  );
}
