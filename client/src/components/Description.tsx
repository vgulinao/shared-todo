import { useState, type ComponentProps } from "react";
import Markdown from "react-markdown";
import { MAX_DESCRIPTION_LENGTH } from "../../../shared/protocol.ts";

type Props = {
  text: string | null;
  editable: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (description: string | null) => void;
};

/**
 * An item's description: Markdown rendered as React elements when idle (spec S9). react-markdown
 * never injects HTML, so raw HTML in the text shows as text; links open in a new tab safely.
 */
export function Description({ text, editable, editing, onEditingChange, onChange }: Props) {
  const [draft, setDraft] = useState(text ?? "");

  function save() {
    const next = draft.trim() === "" ? null : draft;
    if (next !== text) onChange(next);
    onEditingChange(false);
  }
  function cancel() {
    setDraft(text ?? "");
    onEditingChange(false);
  }

  if (editing && editable) {
    return (
      <div className="notes-edit">
        <textarea
          autoFocus
          rows={Math.min(12, Math.max(2, draft.split("\n").length))}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="Notes — Markdown is supported"
          aria-label="Description"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
            if (e.key === "Escape") cancel();
          }}
        />
        <span className="muted hint">Ctrl+Enter to save, Esc to cancel</span>
      </div>
    );
  }

  if (text === null) return null;
  const body = <Markdown components={{ a: SafeLink }}>{text}</Markdown>;
  return editable ? (
    <button
      className="description"
      onClick={() => {
        setDraft(text);
        onEditingChange(true);
      }}
      title="Edit notes"
    >
      {body}
    </button>
  ) : (
    <div className="description">{body}</div>
  );
}

function SafeLink(props: ComponentProps<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}
