import { CopyButton } from "@/components/CopyButton";
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
 */

interface Props {
  fileName: string;
  onFileNameChange: (value: string) => void;
  /** Roadmap 035: there is something to revert TO — see the button's comment. */
  canRevert: boolean;
  onRevert: () => void;
  /** Security 2026-07-25: the host a share link chose, while its guard stands. */
  untrustedHost: string | null;
  onTrustUntrustedHost: () => void;
  running: boolean;
  onRun: () => void;
  /** Roadmap 031: hover/focus signal Run intent — start the engine download. */
  onRunIntent: () => void;
  onCopyLink: () => Promise<void>;
}

export function ConfigToolbar({
  fileName,
  onFileNameChange,
  canRevert,
  onRevert,
  untrustedHost,
  onTrustUntrustedHost,
  running,
  onRun,
  onRunIntent,
  onCopyLink,
}: Props) {
  // Read once per render, not memoized: `formatShortcut` is two string
  // comparisons and a join, and the platform cannot change mid-session.
  const runHint = formatShortcut(RUN_SHORTCUT);
  return (
    <div className="toolbar">
      {/* Roadmap 039: `.ctl` gives form controls the same metrics as
          `.btn`, so this row is ONE height end to end. */}
      <select
        className="ctl"
        aria-label="Config file name"
        value={fileName}
        onChange={(e) => onFileNameChange(e.target.value)}
      >
        <option value="renovate.json">renovate.json</option>
        <option value="renovate.json5">renovate.json5</option>
      </select>
      {/* Roadmap 035: rendered only when there is something to revert.
          It used to be permanently present and merely `disabled`, which
          looked identical to the enabled state — an offer of an action
          that silently did nothing. Absence is the honest signal. */}
      {canRevert ? (
        <button
          type="button"
          className="btn"
          onClick={onRevert}
          title="Restore the config text as it was last loaded — the default, an example, a share link, a repo fetch, or an applied fix — discarding edits made since"
        >
          Revert to loaded config
        </button>
      ) : null}
      <span className="toolbar-spacer" />
      {/* Security 2026-07-25: the standing reminder. Small, but right
          where the risk materializes — the Run button — and it never
          goes away on its own, because the suppression it describes
          never does either. The opt-in stays reachable from here so a
          user who acknowledged the banner is not stuck. */}
      {untrustedHost !== null ? (
        <span
          className="untrusted-endpoint-chip"
          title="A shared link chose this host. Runs leave your sign-in and tokens behind until you allow it."
        >
          runs against {untrustedHost} without tokens
          <button type="button" className="untrusted-endpoint-allow" onClick={onTrustUntrustedHost}>
            use my tokens
          </button>
        </span>
      ) : null}
      {/* Roadmap 067: the shortcut's visible home. A binding that lives only
          in a keyboard-shortcut document does not exist — so it is printed on
          the control it duplicates, in the platform's own spelling, and named
          in the title for anyone who hovers instead. The `<kbd>` hides itself
          on narrow viewports (index.css), where the row is tight and the
          shortcut is least likely to be usable anyway. */}
      <button
        type="button"
        className="btn primary"
        onClick={onRun}
        onPointerEnter={onRunIntent}
        onFocus={onRunIntent}
        disabled={running}
        title={`Process this config with Renovate's own code — it never leaves your browser (${runHint})`}
      >
        {running ? "Running…" : "Run"}
        <kbd className="btn-kbd" aria-hidden="true">
          {runHint}
        </kbd>
      </button>
      {/* Roadmap 036: the shared copy affordance. `buildShareLinkAndCopy`
          writes the clipboard itself (it also mirrors the URL into the
          address bar), so this passes `onCopy`, not `getText`. */}
      <CopyButton
        onCopy={onCopyLink}
        label="Copy link"
        title="Copy a link that reopens this config and view — never includes your tokens"
      />
    </div>
  );
}
