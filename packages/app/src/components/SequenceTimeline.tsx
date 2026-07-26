import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Roadmap 046: the app's ONE clickable-sequence grammar — a row of selectable
 * chips joined by `→` separators, wrapping with a leading arrow on
 * continuation lines (042). Extracted from roadmap 024/042's stage timeline so
 * the simulator's merge sequence is the SAME vocabulary (`.stage-timeline` /
 * `.stage-chip` / `.stage-sep` CSS, the 024 dot signals), not a second dialect
 * of it. `StageTimeline` (the Pipeline tab) and the simulator's merge timeline
 * are both thin adapters over these three pieces.
 *
 * The dot levels keep their 024 meanings everywhere: `clean` = ran and changed
 * nothing (green circle), `changed` = changed things (amber diamond), `error`
 * = failed (red square), `skipped` = nothing happened (hollow ring) — each a
 * distinct shape too, so the signal survives grayscale and color-blind
 * viewing. A chip that IS none of these (a terminal stop) simply has no dot.
 */
export type SequenceDotLevel = "clean" | "changed" | "error" | "skipped";

export function SequenceTimeline({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stage-timeline" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** The order signal between two chips. Decoration only: aria-hidden, not
 *  focusable, no handler — its own flex item so a wrapped line leads with it. */
export function SequenceSep() {
  return (
    <span className="stage-sep" aria-hidden="true">
      →
    </span>
  );
}

interface SequenceChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  dot?: SequenceDotLevel;
  /** The muted trailing slot (a stage's `·N`, a merge stop's `+2`/`±0`/`⊘7`). */
  count?: ReactNode;
  children: ReactNode;
}

export function SequenceChip({
  selected,
  dot,
  count,
  children,
  className,
  ...buttonProps
}: SequenceChipProps) {
  return (
    <button
      type="button"
      className={`stage-chip${selected ? " selected" : ""}${className ? ` ${className}` : ""}`}
      {...buttonProps}
    >
      {dot ? <span className={`dot ${dot}`} /> : null}
      {children}
      {count !== undefined ? <span className="stage-chip-count">{count}</span> : null}
    </button>
  );
}
