import { formatShortcut, RUN_SHORTCUT } from "@/lib/shortcuts";

/**
 * Design review: after an edit (or a Revert) the results panel kept showing
 * the previous run with nothing to say it no longer matched the editor — the
 * two columns sit side by side, so a reader has every reason to assume they
 * describe each other.
 *
 * The run-level sibling of the simulator's `SimStaleBanner`, and deliberately
 * the same warn-tinted sentence: one visual language for "what you are
 * looking at is behind the inputs above it". It lives in the tab shell's
 * run-level `banner` slot, so it shows on whichever tab the reader is on.
 *
 * Staleness is decided on the run's CONFIG inputs (App's `resultsStale`): the
 * editor text, and — since roadmap 076 moved them into the results pane's own
 * pipeline stage cards — the two 008 merge layers. The advanced zone's
 * remaining inputs stay out of scope, so this still never fires for a changed
 * token or endpoint.
 */
export function StaleResultsBanner() {
  return (
    <p className="stale-banner" role="status">
      The config changed since this run — these results describe the earlier text. Press Run (
      {formatShortcut(RUN_SHORTCUT)}) to refresh.
    </p>
  );
}
