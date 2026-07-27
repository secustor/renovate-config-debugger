import { REVOKE_URL, type StoredUser } from "@/platform/oauth";
import { CopyButton } from "@/components/CopyButton";

/**
 * Roadmap 040 — the config column's action row: file name, revert, GitHub
 * sign-in state, the standing untrusted-host reminder, Run and Copy link.
 * Lifted out of App.tsx by the JSX-depth ratchet; it owns no state, and every
 * prop is a plain value or a callback App already had.
 */

interface Props {
  fileName: string;
  onFileNameChange: (value: string) => void;
  /** Roadmap 035: there is something to revert TO — see the button's comment. */
  canRevert: boolean;
  onRevert: () => void;
  oauthConfigured: boolean;
  signedIn: boolean;
  authUser: StoredUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
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
  oauthConfigured,
  signedIn,
  authUser,
  onSignIn,
  onSignOut,
  untrustedHost,
  onTrustUntrustedHost,
  running,
  onRun,
  onRunIntent,
  onCopyLink,
}: Props) {
  return (
    <div className="toolbar">
      {/* Roadmap 039: `.ctl` gives form controls the same metrics as
          `.btn`, so this row is ONE height end to end. */}
      <select className="ctl" value={fileName} onChange={(e) => onFileNameChange(e.target.value)}>
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
      {oauthConfigured ? (
        signedIn ? (
          <span className="gh-auth-chip" title="Signed in with GitHub">
            {authUser?.avatarUrl ? (
              <img
                className="gh-auth-avatar"
                src={authUser.avatarUrl}
                alt=""
                width={18}
                height={18}
              />
            ) : null}
            <span className="gh-auth-login">{authUser?.login || "signed in"}</span>
            <button type="button" className="gh-auth-signout" onClick={onSignOut}>
              Sign out
            </button>
            <a
              className="gh-auth-revoke"
              href={REVOKE_URL}
              target="_blank"
              rel="noreferrer"
              title="Revoke this app's access on GitHub (sign-out only clears the local token)"
            >
              revoke
            </a>
          </span>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={onSignIn}
            title="Sign in to reach private GitHub presets and repositories (read-only)"
          >
            Sign in with GitHub
          </button>
        )
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
      <button
        type="button"
        className="btn primary"
        onClick={onRun}
        onPointerEnter={onRunIntent}
        onFocus={onRunIntent}
        disabled={running}
        title="Process this config with Renovate's own code — it never leaves your browser"
      >
        {running ? "Running…" : "Run"}
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
