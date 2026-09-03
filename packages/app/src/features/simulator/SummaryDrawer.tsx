import type { ReactNode, RefObject } from "react";

/**
 * Roadmap 047: the summary drawer — the simulator detail view's signature
 * disclosure.
 * A collapsed layer is never a bare label: the summary row carries a COMPUTED
 * abstract of what it hides (counts, provenance, the values it currently
 * holds), so the collapsed state still answers "what's in here, and is it
 * worth opening" without a click.
 *
 * The open state is controlled by the parent so it survives a re-simulation
 * (a re-run must never fold what the user opened) and so a cross-link can open
 * the drawer it targets. Native `<details>`/`<summary>` semantics are kept
 * intact — the caret, the keyboard toggle and the disclosure role all come
 * from the platform rather than an ARIA re-implementation.
 *
 * The body renders only while open: the rules drawer's full rule list and the
 * merge drawer's stop list with its resolved-config render are the most
 * expensive thing on the tab, and a closed drawer should not pay for them.
 */
export function SummaryDrawer({
  title,
  summary,
  badges,
  open,
  onToggle,
  className,
  detailsRef,
  children,
}: {
  title: ReactNode;
  /** The computed abstract of the body — muted, right after the title. */
  summary?: ReactNode;
  /** Optional right-aligned status badges (e.g. per-layer match counts). */
  badges?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  className?: string;
  /** For cross-links that scroll the drawer they just opened into view. */
  detailsRef?: RefObject<HTMLDetailsElement | null>;
  children: ReactNode;
}) {
  return (
    <details
      ref={detailsRef}
      className={`drawer${className ? ` ${className}` : ""}`}
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary>
        <span className="drawer-title">{title}</span>
        {summary === undefined ? null : <span className="drawer-summary">{summary}</span>}
        {badges === undefined ? null : <span className="drawer-badges">{badges}</span>}
      </summary>
      {open ? <div className="drawer-body">{children}</div> : null}
    </details>
  );
}
