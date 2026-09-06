import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import { MAX_DESCRIPTION_LENGTH } from "../../../shared/protocol.ts";

type Props = {
  text: string | null;
  editable: boolean;
  /** The text being edited, or null when not editing. Owned by the page so it survives remounts. */
  draft: string | null;
  onDraftChange: (draft: string | null) => void;
  onChange: (description: string | null) => void;
};

/**
 * An item's description: Markdown rendered as React elements when idle (spec S9). react-markdown
 * never injects HTML, so raw HTML in the text shows as text; links open in a new tab safely; images
 * render as their alt text so a shared list cannot make viewers fetch from third parties.
 */
export function Description({ text, editable, draft, onDraftChange, onChange }: Props) {
  if (draft !== null && editable) {
    const save = () => {
      const next = draft.trim() === "" ? null : draft;
      if (next !== text) onChange(next);
      onDraftChange(null);
    };
    return (
      <div className="notes-edit">
        <textarea
          autoFocus
          rows={Math.min(12, Math.max(2, draft.split("\n").length))}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="Notes — Markdown is supported"
          aria-label="Description"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
            if (e.key === "Escape") {
              e.stopPropagation();
              onDraftChange(null);
            }
          }}
        />
        <span className="muted hint">Ctrl+Enter to save, Esc to cancel</span>
      </div>
    );
  }

  if (text === null) return null;
  return (
    <div className="description">
      <Markdown components={{ a: SafeLink, img: AltTextOnly }}>{text}</Markdown>
    </div>
  );
}

function SafeLink(props: ComponentProps<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

function AltTextOnly({ alt }: ComponentProps<"img">) {
  return <span className="muted">{alt ?? "image"}</span>;
}
