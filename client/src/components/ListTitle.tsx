import { useState } from "react";
import { normalizeTitle } from "../../../shared/protocol.ts";

type Props = { title: string; editable: boolean; onRename: (title: string) => void };

/** The list title; click to rename when editable. Enter saves, Escape cancels, empty keeps the old. */
export function ListTitle({ title, editable, onRename }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  if (!editable) return <h1>{title}</h1>;

  function save() {
    const next = draft === null ? null : normalizeTitle(draft);
    if (next !== null && next !== title) onRename(next);
    setDraft(null);
  }

  if (draft !== null) {
    return (
      <input
        className="title-edit"
        aria-label="List title"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            e.stopPropagation(); // this editor owns Escape; page-level shortcuts must not also fire
            setDraft(null);
          }
        }}
      />
    );
  }
  return (
    <h1>
      <button className="title-button" onClick={() => setDraft(title)} title="Rename list">
        {title}
      </button>
    </h1>
  );
}
