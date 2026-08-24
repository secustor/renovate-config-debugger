/**
 * Roadmap 009 (auth-failure surfacing) — the run-level half of the error-path
 * UX. {@link GithubAuthHint} already turns ONE failed node into its likely next
 * action, but only inside the detail panel of a preset the user has to go
 * looking for: a run whose private preset never loaded otherwise reads as a
 * quietly incomplete result. This says it once, where the run's outcome is
 * read, and carries the same hint plus the one action that closes the loop
 * without a redirect — "Run again", for the case where access was granted in
 * another tab (the signed-in "the app isn't installed on this repo" path).
 *
 * Deliberately as decoupled as the hint it wraps: the failures are found by
 * `collectGithubAuthFailures` (pure, in the presets feature) and arrive here as
 * plain names + flavors — roadmap 048 keeps a shared component off a feature
 * module, and a banner that only prints a sentence never needed the tree nodes
 * anyway.
 */
import { type AuthState, GithubAuthHint } from "@/components/GithubAuthHint";

/** One failing preset, already deduped and named by the caller. */
export interface AuthFailureSummary {
  /** Display form, e.g. `github>secustor/private-presets`. */
  name: string;
  /** This particular failure was a rate limit rather than a not-found. */
  rateLimited: boolean;
}

/**
 * The failure sentence. Named from the FIRST failure's own flavor (that is the
 * one the sentence is about), while the hint below it takes the aggregate — a
 * run that hit the rate limit anywhere is a run where signing in raises it.
 * Only the first repo is named: the list is already deduped by repo, and a
 * banner that enumerates ten of them stops being one sentence to act on.
 */
function failureLine(failures: readonly AuthFailureSummary[]): string | null {
  const first = failures[0];
  if (!first) {
    return null;
  }
  const rest = failures.length - 1;
  const name = rest > 0 ? `${first.name} and ${rest} more` : first.name;
  return first.rateLimited
    ? `Rate limit exceeded while resolving ${name}.`
    : `Could not load preset ${name} — repo not found, or private and not accessible.`;
}

export function AuthFailureBanner({
  failures,
  rateLimited,
  authState,
  onSignIn,
  onRunAgain,
}: {
  failures: readonly AuthFailureSummary[];
  /** ANY failure in the run was a rate limit — tunes the hint's copy. */
  rateLimited: boolean;
  authState: AuthState;
  onSignIn: () => void;
  /** Re-runs the pipeline with the inputs that are on screen right now. */
  onRunAgain: () => void;
}) {
  const line = failureLine(failures);
  // Mirrors GithubAuthHint's own guard: with sign-in unconfigured there is no
  // action to offer, and a banner that only restates the tree's error badges
  // is noise. The failed nodes still say what happened where they happened.
  if (line === null || authState === "unconfigured") {
    return null;
  }
  return (
    <div className="auth-failure-banner" role="alert">
      <p className="auth-failure-banner-line">{line}</p>
      <GithubAuthHint authState={authState} rateLimited={rateLimited} onSignIn={onSignIn} />
      {/* The signed-in path sends the user to GitHub to install the app on the
          repo — they come back to a page whose result predates that grant, so
          the loop only closes if re-running is one click away and right here. */}
      <button type="button" className="btn-secondary auth-failure-rerun" onClick={onRunAgain}>
        Run again
      </button>
    </div>
  );
}
