import type { RefObject } from "react";
import { CopyButton } from "@/components/CopyButton";
import { openPickerOnEnter } from "@/lib/select-picker";
import { formatShortcut, RUN_SHORTCUT } from "@/lib/shortcuts";

/**
 * Roadmap 040 — the config column's action row: file name, revert, the
 * standing untrusted-host reminder, Run and Copy link. Lifted out of App.tsx
 * by the JSX-depth ratchet; it owns no state, and every prop is a plain value
 * or a callback App already had.
 *
 * Roadmap 066 took the GitHub session chip out of this row: an account control
 * belongs in the header's top-right corner, not between the file-name select
 * and the Run button, and the signed-out state was a labelled button competing
 * with Run two controls away.
 *
 * Roadmap 075 (v2, iteration 2) made it the editor card's TITLE BAR rather than
 * a row under the card. The strip now carries everything about the document —
 * which file it is, where to fetch one from, how to reformat it, and how to run
 * it — so the card has one chrome row instead of a title bar naming the file
 * and a separate toolbar acting on it. "Load from repo…" came up from the title
 * bar with the same move (its form is now an overlay over the editor, so it no
 * longer has a row to open into).
 */

interface Props {
  fileName: string;
  onFileNameChange: (value: string) => void;
  /** Roadmap 075: the repo-load overlay's trigger — the button focus comes back
   *  to when the overlay closes (`use-repo-load.ts`). */
  repoFormOpen: boolean;
  repoToggleRef: RefObject<HTMLButtonElement | null>;
  onToggleRepoForm: () => void;
  /** Roadmap 035: there is something to revert TO — see the button's comment. */
  canRevert: boolean;
  onRevert: () => void;
  /** Re-indents the config. Always offered — the parse happens on the click,
   *  never per keystroke, so there is no cheap validity signal to gate it on
   *  and a disabled-looking button would be the 035 mistake again. App reports
   *  a document it cannot format through the notice bar. */
  onFormat: () => void;
  /** Security 2026-07-25: the host a share link chose, while its guard stands. */
  untrustedHost: string | null;
  onTrustUntrustedHost: () => void;
  /** Roadmap 075: the landing owns the Run button before the first run (one
   *  large, centered primary), so the strip renders it only in the shell. */
  showRun: boolean;
  running: boolean;
  onRun: () => void;
  /** Roadmap 031: hover/focus signal Run intent — start the engine download. */
  onRunIntent: () => void;
  /** Roadmap 075: why Run is refusing, or null when it is not — today only the
   *  repo-load overlay, which covers the document Run would act on. */
  blockedReason: string | null;
  onCopyLink: () => Promise<void>;
}

export function ConfigToolbar({
  fileName,
  onFileNameChange,
  repoFormOpen,
  repoToggleRef,
  onToggleRepoForm,
  canRevert,
  onRevert,
  onFormat,
  untrustedHost,
  onTrustUntrustedHost,
  showRun,
  running,
  onRun,
  onRunIntent,
  blockedReason,
  onCopyLink,
}: Props) {
  // Read once per render, not memoized: `formatShortcut` is two string
  // comparisons and a join, and the platform cannot change mid-session.
  const runHint = formatShortcut(RUN_SHORTCUT);
  return (
    <div className="toolbar">
      {/* Roadmap 039: `.ctl` gives form controls the same metrics as
          `.btn-*`, so this row is ONE height end to end. 075: it is also the
          card's file-name label now — the title bar it replaced said the same
          name in text beside it. */}
      <select
        className="ctl"
        aria-label="Config file name"
        value={fileName}
        onChange={(e) => onFileNameChange(e.target.value)}
        onKeyDown={openPickerOnEnter}
      >
        <option value="renovate.json">renovate.json</option>
        <option value="renovate.json5">renovate.json5</option>
      </select>
      <span className="toolbar-spacer" />
      {/* Security 2026-07-25: the standing reminder. Small, but right
          where the risk materializes — the Run button — and it never
          goes away on its own, because the suppression it describes
          never does either. The opt-in stays reachable from here so a
          user who acknowledged the banner is not stuck. */}
      {untrustedHost !== null ? (
        <span
          className="pill pill-warn untrusted-endpoint-chip"
          title="A shared link chose this host. Runs leave your sign-in and tokens behind until you allow it."
        >
          runs against {untrustedHost} without tokens
          <button type="button" className="untrusted-endpoint-allow" onClick={onTrustUntrustedHost}>
            use my tokens
          </button>
        </span>
      ) : null}
      <button
        ref={repoToggleRef}
        type="button"
        className="btn-secondary repo-toggle"
        aria-expanded={repoFormOpen}
        onClick={onToggleRepoForm}
        title="Fetch a Renovate config from a repository into this editor"
      >
        Load from repo…
      </button>
      {/* Design review: a pasted config is one long line, and the app offered
          no way to make it readable. Two-space indentation, in place — the
          editor's own text, not a copy shown somewhere else. Ordered BEFORE
          the conditional Revert: formatting is itself an edit that summons
          Revert, and a control must not displace the button under the cursor
          that just clicked it. */}
      <button
        type="button"
        className="btn-secondary"
        onClick={onFormat}
        title="Re-indent this config with two-space indentation"
      >
        Format
      </button>
      {/* Roadmap 035: rendered only when there is something to revert.
          It used to be permanently present and merely `disabled`, which
          looked identical to the enabled state — an offer of an action
          that silently did nothing. Absence is the honest signal. */}
      {canRevert ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={onRevert}
          title="Restore the config text as it was last loaded — the default, an example, a share link, a repo fetch, or an applied fix — discarding edits made since"
        >
          Revert to loaded config
        </button>
      ) : null}
      {/* Roadmap 036: the shared copy affordance. `buildShareLinkAndCopy`
          writes the clipboard itself (it also mirrors the URL into the
          address bar), so this passes `onCopy`, not `getText`. */}
      <CopyButton
        onCopy={onCopyLink}
        label="Copy link"
        title="Copy a link that reopens this config and view — never includes your tokens"
      />
      {/* Roadmap 068: the shortcut's visible home. A binding that lives only
          in a keyboard-shortcut document does not exist — so it is printed on
          the control it duplicates, in the platform's own spelling, and named
          in the title for anyone who hovers instead. The `<kbd>` hides itself
          on narrow viewports (index.css), where the row is tight and the
          shortcut is least likely to be usable anyway. */}
      {showRun ? (
        <button
          type="button"
          className="btn-primary run-button"
          onClick={onRun}
          onPointerEnter={onRunIntent}
          onFocus={onRunIntent}
          disabled={running || blockedReason !== null}
          title={
            blockedReason ??
            `Process this config with Renovate's own code — it never leaves your browser (${runHint})`
          }
        >
          {running ? "Running…" : "Run"}
          <kbd aria-hidden="true">{runHint}</kbd>
        </button>
      ) : null}
    </div>
  );
}
