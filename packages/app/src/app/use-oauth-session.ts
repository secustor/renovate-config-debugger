import { useCallback, useEffect, useState } from "react";
import type { AuthState } from "@/components/GithubAuthHint";
import {
  getOAuthConfig,
  getStoredUser,
  isSignedIn,
  onSessionBroadcast,
  signOut,
  type StoredUser,
} from "@/platform/oauth";

/**
 * Roadmap 009's sign-in session as one hook: who is signed in, whether signing
 * in is even possible, and the two verbs.
 *
 * It was App.tsx's smallest unnamed cluster and its most scattered — two
 * `useState`s near the top, the `AuthState` derivation 1,000 lines down, the
 * two handlers below that, and `Boolean(OAUTH_CONFIG)` spelled out at six more
 * call sites. Every one of those is the same question, and `oauthConfigured`
 * is now the one place it is asked.
 *
 * `onSignIn` deliberately does NOT live here, and the reason is structural
 * rather than stylistic. Starting a sign-in has to decide what the user comes
 * back TO, which reads App's `result` and the share hook's
 * `buildSignInReturnHash` — and the share hook takes this hook's setters (it is
 * what handles the OAuth callback). Moving the verb in would mean this hook
 * reading bindings declared after it, which is a real ordering cycle, not a
 * cosmetic one: `react/immutability` rejects it, and it would be reading
 * half-initialized state if it did not. So the session state lives here and the
 * sign-in policy stays where its inputs are.
 */

/** OAuth sign-in (009). Configured only when both build-time vars are present
 *  (or the deployment's runtime `__RCD_OAUTH__` supplies them); otherwise the
 *  whole feature stays hidden and the PAT fallback remains. Module scope for
 *  the same reason `oauth.ts` resolves `INSTALL_URL` at module scope: neither
 *  input can change after the page loads, so there is nothing for a render to
 *  re-read. */
const OAUTH_CONFIG = getOAuthConfig();

export interface OAuthSession {
  /** Whether the feature exists at all in this deployment. The one spelling —
   *  it used to be `Boolean(OAUTH_CONFIG)` at six call sites. */
  oauthConfigured: boolean;
  signedIn: boolean;
  authUser: StoredUser | null;
  /** The three-way state the hint components take, derived from the two above
   *  so no caller has to re-derive it (and none can derive it differently). */
  authState: AuthState;
  onSignOut: () => void;
  /** The OAuth CALLBACK's way in: after the redirect, the share path learns
   *  the new session and reports it here. Exposed as the raw setters because
   *  that path sets them independently. */
  setSignedIn: (value: boolean) => void;
  setAuthUser: (user: StoredUser | null) => void;
}

export function useOAuthSession(): OAuthSession {
  const [signedIn, setSignedIn] = useState(() => (OAUTH_CONFIG ? isSignedIn() : false));
  const [authUser, setAuthUser] = useState<StoredUser | null>(() =>
    OAUTH_CONFIG ? getStoredUser() : null,
  );

  const authState: AuthState = !OAUTH_CONFIG
    ? "unconfigured"
    : signedIn
      ? "signed-in"
      : "signed-out";

  const onSignOut = useCallback(() => {
    signOut();
    setSignedIn(false);
    setAuthUser(null);
  }, []);

  // A sibling tab's broadcast changes the session outside any React event —
  // its refresh signs this tab in, its sign-out tears this tab down — so the
  // chip re-reads the module state when one lands.
  useEffect(() => {
    if (!OAUTH_CONFIG) {
      return;
    }
    return onSessionBroadcast(() => {
      setSignedIn(isSignedIn());
      setAuthUser(getStoredUser());
    });
  }, []);

  return {
    oauthConfigured: Boolean(OAUTH_CONFIG),
    signedIn,
    authUser,
    authState,
    onSignOut,
    setSignedIn,
    setAuthUser,
  };
}

/** The raw config, for the one caller that needs the object rather than the
 *  question — `useShareLink` takes it to decide whether to carry a sign-in
 *  return hash at all. */
export { OAUTH_CONFIG };
