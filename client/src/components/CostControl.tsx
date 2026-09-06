import { useState } from "react";
import { round2 } from "../../../shared/cost.ts";
import { formatCost } from "../lib/format.ts";

type Props = {
  /** The item's own cost, which is what editing changes. */
  own: number | null;
  /** What the row displays: the own cost, or a parent's group subtotal. */
  shown: number | null;
  /** Explanation for the shown value when it differs from the own cost (parent subtotal). */
  breakdown?: string;
  editable: boolean;
  itemTitle: string;
  onChange: (cost: number | null) => void;
};

/** Inline cost: click to edit; Enter saves, Escape cancels, empty clears (spec S8 AC1–AC3). */
export function CostControl({ own, shown, breakdown, editable, itemTitle, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  if (!editable) {
    return shown === null ? null : (
      <span className="cost" title={breakdown}>
        {formatCost(shown)}
      </span>
    );
  }

  function save() {
    if (draft === null) return;
    const text = draft.trim();
    if (text === "") {
      if (own !== null) onChange(null);
    } else {
      const n = Number(text);
      if (Number.isFinite(n) && n >= 0 && round2(n) !== own) onChange(round2(n));
    }
    setDraft(null);
  }

  if (draft !== null) {
    return (
      <input
        className="cost-edit"
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        aria-label={`Cost of ${itemTitle}`}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    );
  }
  return (
    <button
      className={shown === null ? "cost cost-empty" : "cost"}
      title={breakdown ?? "Set cost"}
      aria-label={`Cost of ${itemTitle}: ${shown === null ? "none" : formatCost(shown)}`}
      onClick={() => setDraft(own === null ? "" : String(own))}
    >
      {shown === null ? "+ cost" : formatCost(shown)}
    </button>
  );
}
