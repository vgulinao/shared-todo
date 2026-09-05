import { useState } from "react";
import { normalizeTitle } from "../../../shared/protocol.ts";

export function AddItem({ onAdd }: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState("");

  function submit() {
    const title = normalizeTitle(draft);
    if (title === null) return;
    onAdd(title);
    setDraft("");
  }

  return (
    <input
      className="add-item"
      type="text"
      placeholder="Add an item"
      aria-label="Add an item"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
      }}
    />
  );
}
