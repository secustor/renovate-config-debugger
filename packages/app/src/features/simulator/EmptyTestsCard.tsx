import { QUICK_FILLS } from "./form";
import type { FormState } from "@/types/simulator";

/**
 * The design's empty state (Proposal F / "Skip Reason Funnel", `state:
 * empty`): a dashed card that says what a pin is, points at the Add-a-test
 * card below, and offers the quick-fill descriptors as "common cases" —
 * clicking one seeds the form rather than pinning, because a chip is an offer
 * (075 iteration 6; the shell's own starter pins, roadmap 091, are the one
 * thing that fills the list unasked — and they wear a chip saying so, which is
 * why this card is on screen at all only when they derived nothing).
 * Everything goes through the SEED
 * channel: since the ghost rework the card below may be collapsed, and the
 * seed is what opens it and moves focus into the form once it has rendered —
 * a direct DOM focus from here would query a form that is not on screen yet.
 */

/** The chip grammar the design uses — `lodash · npm · patch`. */
function chipLabel(fill: Partial<FormState>): string {
  return [fill.packageName, fill.manager, fill.updateType]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");
}

export function EmptyTestsCard({
  onStartFrom,
}: {
  onStartFrom: (fill: Partial<FormState>) => void;
}) {
  return (
    <div className="pin-empty-card">
      <p className="pin-empty-title">No tests pinned yet</p>
      <p className="pin-empty-copy">
        Pin a dependency update and it becomes a standing test: every config edit re-runs it and
        shows which rules matched, which of yours didn’t, and why the rest were skipped.
      </p>
      <button type="button" className="btn-primary" onClick={() => onStartFrom({})}>
        + Pin a dependency…
      </button>
      <p className="pin-empty-or">or start from a common case:</p>
      <div className="pin-empty-chips">
        {QUICK_FILLS.slice(0, 3).map(({ label, fill }) => (
          <button key={label} type="button" onClick={() => onStartFrom(fill)}>
            {chipLabel(fill)}
          </button>
        ))}
      </div>
    </div>
  );
}
