/**
 * Roadmap 009 — "Sign in with GitHub". Pure logic, no React.
 *
 * Authorization-code flow + PKCE + `state`, driven entirely by the SPA. The
 * only server piece is the token-exchange Worker (packages/oauth-worker): the
 * browser cannot call GitHub's token endpoint (no CORS, `client_secret`
 * required), so `code → token` and `refresh_token → token` go through it. Every
 * GitHub *content* fetch still goes browser → api.github.com directly.
 *
 * Tokens live in memory, mirrored to `sessionStorage` (never `localStorage`,
 * never a URL) so a reload inside the token lifetime does not force re-auth but
 * closing the tab clears them. GitHub Apps issue 8 h user tokens with a 6-month
 * refresh token; refreshing is a Worker round-trip.
 */

export interface OAuthConfig {
  clientId: string;
  workerUrl: string;
  /** Optional app slug for a direct install/manage link. */
  appSlug?: string;
}

export interface StoredUser {
  login: string;
  avatarUrl: string;
}

/** Where a signed-in user revokes this app's grant (cannot be done from JS). */
export const REVOKE_URL = "https://github.com/settings/apps/authorizations";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const USER_API = "https://api.github.com/user";

/** sessionStorage keys, all under the `rcv.oauth.*` prefix. */
const K = {
  pending: "rcv.oauth.pending",
  token: "rcv.oauth.token",
  tokenExpiresAt: "rcv.oauth.tokenExpiresAt",
  refreshToken: "rcv.oauth.refreshToken",
  refreshTokenExpiresAt: "rcv.oauth.refreshTokenExpiresAt",
  user: "rcv.oauth.user",
} as const;

/** Returns the OAuth config only when fully configured, else null (feature off). */
export function getOAuthConfig(): OAuthConfig | null {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID?.trim();
  const workerUrl = import.meta.env.VITE_OAUTH_WORKER_URL?.trim();
  if (!clientId || !workerUrl) {
    return null;
  }
  const appSlug = import.meta.env.VITE_GITHUB_APP_SLUG?.trim() || undefined;
  return { clientId, workerUrl: workerUrl.replace(/\/+$/, ""), appSlug };
}

/** Where the user manages / installs the app on repositories. */
export function installUrl(): string {
  const cfg = getOAuthConfig();
  if (cfg?.appSlug) {
    return `https://github.com/apps/${cfg.appSlug}/installations/new`;
  }
  return "https://github.com/settings/installations";
}

// ---------------------------------------------------------------------------
// PKCE / random helpers
// ---------------------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** redirect_uri that works for both the Pages base path and localhost. */
function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

// ---------------------------------------------------------------------------
// Token state (memory + sessionStorage mirror)
// ---------------------------------------------------------------------------

interface TokenState {
  token: string;
  /** epoch ms; Number.MAX_SAFE_INTEGER when the token does not expire. */
  tokenExpiresAt: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
}

let memToken: TokenState | null = null;
let memLoaded = false;

function loadTokenState(): TokenState | null {
  const token = sessionStorage.getItem(K.token);
  if (!token) {
    return null;
  }
  const expiresAt = Number(sessionStorage.getItem(K.tokenExpiresAt) ?? "0");
  const refreshToken = sessionStorage.getItem(K.refreshToken) ?? undefined;
  const refreshExp = sessionStorage.getItem(K.refreshTokenExpiresAt);
  return {
    token,
    tokenExpiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    refreshToken,
    refreshTokenExpiresAt: refreshExp ? Number(refreshExp) : undefined,
  };
}

function currentToken(): TokenState | null {
  if (!memLoaded) {
    memToken = loadTokenState();
    memLoaded = true;
  }
  return memToken;
}

function storeTokenState(state: TokenState): void {
  memToken = state;
  memLoaded = true;
  sessionStorage.setItem(K.token, state.token);
  sessionStorage.setItem(K.tokenExpiresAt, String(state.tokenExpiresAt));
  if (state.refreshToken) {
    sessionStorage.setItem(K.refreshToken, state.refreshToken);
  } else {
    sessionStorage.removeItem(K.refreshToken);
  }
  if (state.refreshTokenExpiresAt) {
    sessionStorage.setItem(K.refreshTokenExpiresAt, String(state.refreshTokenExpiresAt));
  } else {
    sessionStorage.removeItem(K.refreshTokenExpiresAt);
  }
}

// ---------------------------------------------------------------------------
// Worker exchange
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postWorker(path: string, body: unknown): Promise<TokenResponse> {
  const cfg = getOAuthConfig();
  if (!cfg) {
    throw new Error("Sign-in is not configured.");
  }
  const res = await fetch(`${cfg.workerUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `Token exchange failed (HTTP ${res.status}).`,
    );
  }
  return data;
}

function applyTokenResponse(data: TokenResponse): void {
  const now = Date.now();
  const tokenExpiresAt =
    typeof data.expires_in === "number" ? now + data.expires_in * 1000 : Number.MAX_SAFE_INTEGER;
  storeTokenState({
    // access_token presence is guaranteed by postWorker.
    token: data.access_token as string,
    tokenExpiresAt,
    refreshToken: data.refresh_token,
    refreshTokenExpiresAt:
      typeof data.refresh_token_expires_in === "number"
        ? now + data.refresh_token_expires_in * 1000
        : undefined,
  });
}

async function fetchUser(token: string): Promise<StoredUser> {
  const res = await fetch(USER_API, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`Could not load your GitHub profile (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as { login?: string; avatar_url?: string };
  const user: StoredUser = { login: body.login ?? "", avatarUrl: body.avatar_url ?? "" };
  sessionStorage.setItem(K.user, JSON.stringify(user));
  return user;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isSignedIn(): boolean {
  return currentToken() !== null;
}

export function getStoredUser(): StoredUser | null {
  const raw = sessionStorage.getItem(K.user);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredUser;
    return typeof parsed.login === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Stashes `{ state, verifier, returnHash }` in sessionStorage and redirects to
 * GitHub's authorize page. `returnHash` (the current fragment) is restored
 * after the callback so a share link survives a sign-in round-trip.
 */
export async function beginSignIn(returnHash: string): Promise<void> {
  const cfg = getOAuthConfig();
  if (!cfg) {
    return;
  }
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem(K.pending, JSON.stringify({ state, verifier, returnHash }));

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // GitHub Apps derive user-token permissions from the app itself, so no
  // `scope` parameter is sent.
  window.location.assign(url.toString());
}

/** OAuth callback params from a query string, or null when not a callback. */
export function readCallbackParams(search: string): { code: string; state: string } | null {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  return code && state ? { code, state } : null;
}

/**
 * Validates `state`, exchanges the code via the Worker, stores the token and
 * loads the user profile. Returns the user and the stashed return-hash. Throws
 * on state mismatch or exchange failure (caller stays signed out).
 */
export async function completeCallback(
  code: string,
  state: string,
): Promise<{ user: StoredUser; returnHash: string }> {
  const pendingRaw = sessionStorage.getItem(K.pending);
  sessionStorage.removeItem(K.pending);
  if (!pendingRaw) {
    throw new Error("No pending sign-in to match this response.");
  }
  let pending: { state?: string; verifier?: string; returnHash?: string };
  try {
    pending = JSON.parse(pendingRaw);
  } catch {
    throw new Error("Sign-in state was corrupted.");
  }
  if (!pending.state || pending.state !== state || !pending.verifier) {
    throw new Error("Sign-in state mismatch; aborting for safety.");
  }
  const data = await postWorker("/exchange", {
    code,
    code_verifier: pending.verifier,
    redirect_uri: redirectUri(),
  });
  applyTokenResponse(data);
  const user = await fetchUser(data.access_token as string);
  return { user, returnHash: pending.returnHash ?? "" };
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * A valid access token, silently refreshing when expired (single-flight). Null
 * when signed out or when a refresh is impossible/fails (falls back to signed
 * out — public presets keep working unauthenticated).
 */
export async function getValidToken(): Promise<string | null> {
  const state = currentToken();
  if (!state) {
    return null;
  }
  const skewMs = 60_000;
  if (Date.now() < state.tokenExpiresAt - skewMs) {
    return state.token;
  }
  const refreshExpired =
    typeof state.refreshTokenExpiresAt === "number" && Date.now() >= state.refreshTokenExpiresAt;
  if (!state.refreshToken || refreshExpired) {
    signOut();
    return null;
  }
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const data = await postWorker("/refresh", { refresh_token: state.refreshToken });
        applyTokenResponse(data);
        return currentToken()?.token ?? null;
      } catch {
        signOut();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Drops all `rcv.oauth.*` state. Revocation itself cannot be done from the
 * browser — the sign-out UI links to {@link REVOKE_URL} for true revocation.
 */
export function signOut(): void {
  memToken = null;
  memLoaded = true;
  for (const key of Object.values(K)) {
    sessionStorage.removeItem(key);
  }
}
