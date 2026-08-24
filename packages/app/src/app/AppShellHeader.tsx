import { nf, plural } from "@/lib/format";
import { AppHeaderTools } from "@/app/AppHeaderTools";
import { useRunView } from "@/app/run-view-context";
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
 * tab badges read, so the header can no more disagree with a badge than 029's
 * paragraph could. Iteration 3 retired that paragraph outright: these links ARE
 * the digest in the app now, and the clause model behind the prose stays what
 * `rcd digest` renders.
 *
 * Roadmap 083 brought the Overview tab back and deliberately left this row
 * alone. The two things called "the digest" are not the same digest: this is
 * the RUN's (rewrites, presets, effective options, problems — four counts, each
 * linked to the instrument that explains it), while the Overview is the
 * DESCRIPTION digest, the config's own prose. No clause here ever pointed at
 * that card, so there was nothing to re-point; and repointing a clause at the
 * Overview would send a reader asking "which presets?" to a tab that does not
 * answer it. What 075's note above now over-claims is only the word "retired" —
 * the tab is back, the header's links stay what they are.
 */

interface DigestLinksProps {
  rewrites: number;
  presets: number;
  /** null while the effective-config view has not reported yet — the clause is
   *  omitted rather than shown as a wrong zero (the 028 badge rule). */
  effectiveKeys: number | null;
  problems: number;
  onJump: (tab: ResultsTabId) => void;
  /** Roadmap 075 (iteration 3): the rewrites clause is the one link whose
   *  target is not just a tab — the Rewrites tab folded into Pipeline's migrate
   *  stage, so getting there means selecting that stage too, and only App owns
   *  the stage. */
  onShowRewrites: () => void;
}

/** One digest clause: a count and the instrument it belongs to. */
function DigestLink({
  count,
  label,
  onOpen,
}: {
  count: number;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="digest-link" onClick={onOpen}>
      {nf.format(count)} {label}
    </button>
  );
}

/**
 * The digest as a muted cluster of jump-links separated by `·` — the retired
 * Overview paragraph, reduced to the four numbers a reader steers by and wired
 * to the instruments that explain them (through `jumpToTab`, so the one-step
 * way back is recorded).
 */
function DigestLinks({
  rewrites,
  presets,
  effectiveKeys,
  problems,
  onJump,
  onShowRewrites,
}: DigestLinksProps) {
  return (
    <div className="app-header-digest">
      <DigestLink
        count={rewrites}
        label={rewrites === 1 ? "rewrite" : "rewrites"}
        onOpen={onShowRewrites}
      />
      <span aria-hidden="true">·</span>
      <DigestLink count={presets} label="presets" onOpen={() => onJump("presets")} />
      {effectiveKeys === null ? null : <span aria-hidden="true">·</span>}
      {effectiveKeys === null ? null : (
        <DigestLink
          count={effectiveKeys}
          label="effective options"
          onOpen={() => onJump("effective")}
        />
      )}
      <span aria-hidden="true">·</span>
      <DigestLink count={problems} label="problems" onOpen={() => onJump("problems")} />
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
        <span>Renovate Config Debugger</span>
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
        {plural(errorCount, "error")}
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

/**
 * The session half stays props (it is account state, not run view); the run
 * half — verdict, counts, digest links — reads `useRunView()` (roadmap 086).
 */
interface Props {
  /** Roadmap 077: builds and copies the share link (header Share button).
   *  Undefined before a run — nothing to share yet, no control. */
  onShare: (() => Promise<void>) | undefined;
  oauthConfigured: boolean;
  signedIn: boolean;
  authUser: StoredUser | null;
  onSignOut: () => void;
  onShowShortcuts: () => void;
}

export function AppShellHeader({
  onShare,
  oauthConfigured,
  signedIn,
  authUser,
  onSignOut,
  onShowShortcuts,
}: Props) {
  const {
    result,
    validateHasErrors,
    errorCount,
    warningCount,
    presetCount,
    effectiveKeys,
    migrateSteps,
    onJumpToTab,
    onShowRewrites,
    onSignIn,
  } = useRunView();
  const hasResult = result !== null;
  return (
    <header className="app-header">
      <AppBrand />
      {hasResult ? <RunStatusPill hasErrors={validateHasErrors} errorCount={errorCount} /> : null}
      {hasResult ? (
        <DigestLinks
          rewrites={migrateSteps.length}
          presets={presetCount}
          effectiveKeys={effectiveKeys}
          problems={errorCount + warningCount}
          onJump={onJumpToTab}
          onShowRewrites={onShowRewrites}
        />
      ) : null}
      {/* Roadmap 066: the GitHub session lives in the corner every user looks
          in for an account control, and 037 already called it "about this
          session". Untouched by the shell — it just stops being the only thing
          in the row. */}
      <AppHeaderTools
        renovateVersion={result?.renovateVersion}
        onShare={onShare}
        oauthConfigured={oauthConfigured}
        signedIn={signedIn}
        authUser={authUser}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onShowShortcuts={onShowShortcuts}
      />
    </header>
  );
}
