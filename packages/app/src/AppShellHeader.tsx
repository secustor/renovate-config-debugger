import { AppHeaderTools } from "@/AppHeaderTools";
import type { ResultsTabId } from "@/data/results-tabs";
import type { StoredUser } from "@/platform/oauth";

/**
 * Roadmap 075 (v2, iteration 2) — the integrated shell's header row.
 *
 * The v1 header was an identity corner and a session corner with a subtitle
 * paragraph underneath, and the run's digest lived in an Overview tab three
 * clicks away from the instrument each of its numbers describes. The shell
 * turns the header into the run's status line: identity, the verdict as a
 * pill, and the digest as jump-links that open the instrument that explains
 * them. The subtitle moved to the landing, where a first-time reader is.
 *
 * Every number here is handed in from `useRunSummary` — the same derivation the
 * tab badges and the 029 digest paragraph read, so the header can no more
 * disagree with a badge than the paragraph can.
 */

const nf = new Intl.NumberFormat();

interface DigestLinksProps {
  rewrites: number;
  presets: number;
  /** null while the effective-config view has not reported yet — the clause is
   *  omitted rather than shown as a wrong zero (the 028 badge rule). */
  effectiveKeys: number | null;
  problems: number;
  onJump: (tab: ResultsTabId) => void;
}

/** One digest clause: a count and the instrument it belongs to. */
function DigestLink({
  count,
  label,
  tab,
  onJump,
}: {
  count: number;
  label: string;
  tab: ResultsTabId;
  onJump: (tab: ResultsTabId) => void;
}) {
  return (
    <button type="button" className="digest-link" onClick={() => onJump(tab)}>
      {nf.format(count)} {label}
    </button>
  );
}

/**
 * The digest as a muted cluster of jump-links separated by `·` — the Overview's
 * paragraph, reduced to the four numbers a reader steers by and wired to the
 * tabs that explain them (`jumpToTab`, so the one-step way back is recorded).
 */
function DigestLinks({ rewrites, presets, effectiveKeys, problems, onJump }: DigestLinksProps) {
  return (
    <div className="app-header-digest">
      <DigestLink
        count={rewrites}
        label={rewrites === 1 ? "rewrite" : "rewrites"}
        tab="rewrites"
        onJump={onJump}
      />
      <span aria-hidden="true">·</span>
      <DigestLink count={presets} label="presets" tab="presets" onJump={onJump} />
      {effectiveKeys === null ? null : <span aria-hidden="true">·</span>}
      {effectiveKeys === null ? null : (
        <DigestLink
          count={effectiveKeys}
          label="effective options"
          tab="effective"
          onJump={onJump}
        />
      )}
      <span aria-hidden="true">·</span>
      <DigestLink count={problems} label="problems" tab="problems" onJump={onJump} />
    </div>
  );
}

/** The header's identity corner: logo + title. Its own component for the same
 *  reason the digest is — the header sits at the depth ratchet's limit. */
function AppBrand() {
  return (
    <div className="app-brand">
      <img src="/logo-192.png" alt="" width={26} height={26} />
      <h1>
        <span className="app-brand-title">Renovate Config Debugger</span>
      </h1>
    </div>
  );
}

/**
 * The run's verdict. `accepted` when the validate stage reported no errors —
 * the same `validateHasErrors` the hypothetical banner and every post-validate
 * instrument are gated on — otherwise the error count in the error tone.
 */
function RunStatusPill({ hasErrors, errorCount }: { hasErrors: boolean; errorCount: number }) {
  if (hasErrors) {
    return (
      <span className="pill pill-error app-header-status">
        <span className="app-header-status-dot" aria-hidden="true" />
        {nf.format(errorCount)} error{errorCount === 1 ? "" : "s"}
      </span>
    );
  }
  return (
    <span className="pill pill-ok app-header-status">
      <span className="app-header-status-dot" aria-hidden="true" />
      accepted
    </span>
  );
}

interface Props {
  /** Whether a run exists at all: before one, the header is identity + session
   *  only — there is no verdict to state and no instrument to jump to. */
  hasResult: boolean;
  validateHasErrors: boolean;
  errorCount: number;
  warningCount: number;
  rewrites: number;
  presets: number;
  effectiveKeys: number | null;
  onJumpToTab: (tab: ResultsTabId) => void;
  renovateVersion: string | undefined;
  oauthConfigured: boolean;
  signedIn: boolean;
  authUser: StoredUser | null;
  installUrl: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onShowShortcuts: () => void;
}

export function AppShellHeader({
  hasResult,
  validateHasErrors,
  errorCount,
  warningCount,
  rewrites,
  presets,
  effectiveKeys,
  onJumpToTab,
  renovateVersion,
  oauthConfigured,
  signedIn,
  authUser,
  installUrl,
  onSignIn,
  onSignOut,
  onShowShortcuts,
}: Props) {
  return (
    <header className="app-header">
      <AppBrand />
      {hasResult ? <RunStatusPill hasErrors={validateHasErrors} errorCount={errorCount} /> : null}
      {hasResult ? (
        <DigestLinks
          rewrites={rewrites}
          presets={presets}
          effectiveKeys={effectiveKeys}
          problems={errorCount + warningCount}
          onJump={onJumpToTab}
        />
      ) : null}
      {/* Roadmap 066: the GitHub session lives in the corner every user looks
          in for an account control, and 037 already called it "about this
          session". Untouched by the shell — it just stops being the only thing
          in the row. */}
      <AppHeaderTools
        renovateVersion={renovateVersion}
        oauthConfigured={oauthConfigured}
        signedIn={signedIn}
        authUser={authUser}
        installUrl={installUrl}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onShowShortcuts={onShowShortcuts}
      />
    </header>
  );
}
