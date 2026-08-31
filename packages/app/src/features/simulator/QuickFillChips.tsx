import { activeQuickFill, QUICK_FILLS } from "./form";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 079: the design's "Start from:" row — the quick-fills as pills, with
 * the one the form currently AGREES WITH rendered active.
 *
 * Active is derived from the form, not remembered from the click: a chip is
 * lit exactly while every value it writes is still in the form. That answers
 * the same question the design's `state.fill` does ("which example is this?")
 * without the two ways it could lie — a chip left lit after the form was
 * cleared by a pin, or after the empty state's own quick-start chips seeded a
 * DIFFERENT example through a channel this component never sees.
 */
export function QuickFillChips({
  form,
  onQuickFill,
}: {
  form: FormState;
  onQuickFill: (fill: Partial<FormState>) => void;
}) {
  const active = activeQuickFill(form);
  return (
    <div className="sim-quickfills">
      <span className="sim-quickfills-lead">Start from:</span>
      {QUICK_FILLS.map(({ label, fill }) => (
        <button
          key={label}
          type="button"
          className={`btn-chip sim-quickfill${label === active ? " active" : ""}`}
          aria-pressed={label === active}
          onClick={() => onQuickFill(fill)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
