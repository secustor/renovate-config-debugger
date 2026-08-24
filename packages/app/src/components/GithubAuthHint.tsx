/**
 * Roadmap 009 — the error-path UX (the "core UX" of the sign-in feature). A
 * small hint shown next to a failed GitHub preset/repo fetch that turns the
 * failure into the likely next action: sign in (private preset / rate limit) or
 * check the app installation (signed in but still failing).
 *
 * Callers pass the current auth state and an onSignIn callback as plain props,
 * so nothing about the sign-in MACHINERY leaks in here. The install URL is not
 * state, though: it is deployment config fixed before first render, so this
 * component reads `INSTALL_URL` itself rather than having it threaded down five
 * hops of props from `App`.
 */
import { INSTALL_URL } from "@/platform/oauth";

/** Whether sign-in is configured, and if so whether the user is signed in. */
export type AuthState = "unconfigured" | "signed-out" | "signed-in";

export function GithubAuthHint({
  authState,
  rateLimited = false,
  onSignIn,
}: {
  authState: AuthState;
  /** A rate-limit (vs not-found/auth) failure — tunes the signed-out copy. */
  rateLimited?: boolean;
  onSignIn: () => void;
}) {
  if (authState === "unconfigured") {
    return null;
  }
  if (authState === "signed-out") {
    return (
      <p className="gh-auth-hint">
        {rateLimited ? "Hit GitHub's unauthenticated rate limit (60 req/h). " : "Private preset? "}
        <button type="button" className="gh-inline-signin" onClick={onSignIn}>
          Sign in with GitHub
        </button>{" "}
        {rateLimited ? "to raise the limit to 5,000 req/h." : "to access it."}
      </p>
    );
  }
  return (
    <p className="gh-auth-hint">
      Signed in, still failing? The app may not be installed on this repository.{" "}
      <a href={INSTALL_URL} target="_blank" rel="noreferrer">
        Manage repository access
      </a>
      .
    </p>
  );
}
