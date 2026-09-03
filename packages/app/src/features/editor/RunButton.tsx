import { formatShortcut, RUN_SHORTCUT } from "@/lib/shortcuts";

/**
 * The pipeline's one primary action, in both places it is offered: the
 * landing's large centered Run and the editor title bar's Run in the shell.
 * They were two copies differing only in a class and the idle label.
 *
 * Roadmap 068: the shortcut's visible home. A binding that lives only in a
 * keyboard-shortcut document does not exist — so it is printed on the control
 * it duplicates, in the platform's own spelling, and named in the title for
 * anyone who hovers instead. The `<kbd>` is `aria-hidden` (the accessible name
 * stays the label alone) and hides itself on narrow viewports (index.css),
 * where the row is tight and the shortcut is least likely to be usable anyway.
 */
export function RunButton({
  label,
  extraClass,
  running,
  onRun,
  onRunIntent,
  blockedReason,
}: {
  /** The idle label; the running state says "Running…" in both places. */
  label: string;
  /** Placement-only class beside the shared `run-button` (e.g. `landing-run`). */
  extraClass?: string;
  running: boolean;
  onRun: () => void;
  /** Roadmap 031: hover/focus signal Run intent — start the engine download. */
  onRunIntent: () => void;
  /** Roadmap 075: why Run is refusing, or null when it is not — today only the
   *  repo-load overlay, which covers the document Run would act on. */
  blockedReason: string | null;
}) {
  // Read once per render, not memoized: `formatShortcut` is two string
  // comparisons and a join, and the platform cannot change mid-session.
  const runHint = formatShortcut(RUN_SHORTCUT);
  return (
    <button
      type="button"
      className={`btn-primary run-button${extraClass ? ` ${extraClass}` : ""}`}
      onClick={onRun}
      onPointerEnter={onRunIntent}
      onFocus={onRunIntent}
      disabled={running || blockedReason !== null}
      title={
        blockedReason ??
        `Process this config with Renovate's own code — it never leaves your browser (${runHint})`
      }
    >
      {running ? "Running…" : label}
      <kbd aria-hidden="true">{runHint}</kbd>
    </button>
  );
}
