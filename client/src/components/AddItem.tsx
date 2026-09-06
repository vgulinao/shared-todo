import { useState } from "react";
import { normalizeTitle } from "../../../shared/protocol.ts";

type Props = {
  onAdd: (title: string) => void;
  placeholder?: string;
  /** Escape on an empty draft; used to close the inline sub-task input. */
  onCancel?: () => void;
  className?: string;
};

export function AddItem({ onAdd, placeholder = "Add an item", onCancel, className }: Props) {
  const [draft, setDraft] = useState("");

  function submit() {
    const title = normalizeTitle(draft);
    if (title === null) return;
    onAdd(title);
    setDraft("");
  }

  return (
    <input
      className={className ?? "add-item"}
      type="text"
      placeholder={placeholder}
      aria-label={placeholder}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          if (draft === "") onCancel?.();
          else setDraft("");
        }
      }}
    />
  );
}
