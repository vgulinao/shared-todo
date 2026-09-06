import { useState } from "react";
import { round2 } from "../../../shared/cost.ts";
import { formatCost } from "../lib/format.ts";

type Props = {
  /** The item's own cost, which is what editing changes. */
  own: number | null;
  /** For a parent: the sum of its sub-tasks' costs (null when none has one). Display only. */
  subtasks: number | null;
  editable: boolean;
  itemTitle: string;
  onChange: (cost: number | null) => void;
};

/**
 * Inline cost editor (spec S8 AC1–AC3). Enter saves a valid number, a deliberately emptied field
 * clears the cost, an invalid entry keeps the editor open and marked invalid, and leaving the field
 * with an invalid entry cancels rather than saving or clearing.
 */
export function CostControl({ own, subtasks, editable, itemTitle, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  // `<input type="number">` reports value "" while it holds text the browser cannot parse; the
  // browser flags that as badInput. Without this flag a typo would look like "clear the cost".
  const [badInput, setBadInput] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const shown = subtasks === null ? own : round2((own ?? 0) + subtasks);
  const label = describe(itemTitle, own, subtasks, shown);

  if (!editable) {
    // Read-only: the title serves mouse users; a generic span must not carry aria-label, so the
    // breakdown for assistive tech is real (visually hidden) text.
    return shown === null ? null : (
      <span className="cost" title={label}>
        {formatCost(shown)}
        {subtasks !== null && <span className="visually-hidden"> ({label})</span>}
      </span>
    );
  }

  /** The value to save, `null` to clear, or "invalid". */
  function parse(): number | null | "invalid" {
    if (draft === null || badInput) return "invalid";
    const text = draft.trim();
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? round2(n) : "invalid";
  }

  function close() {
    setDraft(null);
    setBadInput(false);
    setInvalid(false);
  }

  function commit(on: "enter" | "blur") {
    const value = parse();
    if (value === "invalid") {
      if (on === "blur")
        close(); // cancel: never save or clear on a value we could not read
      else setInvalid(true);
      return;
    }
    if (value !== own) onChange(value);
    close();
  }

  if (draft !== null) {
    return (
      <input
        className={invalid ? "cost-edit invalid" : "cost-edit"}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        aria-label={`Cost of ${itemTitle}`}
        aria-invalid={invalid || undefined}
        title={invalid ? "Enter a number of 0 or more" : undefined}
        autoFocus
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setBadInput(e.target.validity.badInput);
          setInvalid(false);
        }}
        onBlur={() => commit("blur")}
        onWheel={(e) => e.currentTarget.blur()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit("enter");
          if (e.key === "Escape") close();
        }}
      />
    );
  }
  return (
    <button
      className={shown === null ? "cost cost-empty" : "cost"}
      aria-label={label}
      title={subtasks !== null ? label : "Set cost"}
      onClick={() => setDraft(own === null ? "" : String(own))}
    >
      {shown === null ? "+ cost" : formatCost(shown)}
    </button>
  );
}

/** Names what the control edits, not just what it shows (a parent's own cost vs its subtotal). */
function describe(
  title: string,
  own: number | null,
  subtasks: number | null,
  shown: number | null,
): string {
  if (shown === null) return `Cost of ${title}: none`;
  if (subtasks === null) return `Cost of ${title}: ${formatCost(shown)}`;
  return `Cost of ${title}: own ${formatCost(own ?? 0)}, sub-tasks ${formatCost(subtasks)}, total ${formatCost(shown)}`;
}
