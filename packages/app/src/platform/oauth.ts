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
 *
 * Roadmap 065 — a deployment may run the Worker in cookie mode, where the
 * refresh token never reaches JS at all: it lives in an `HttpOnly` cookie the
 * Worker sets, and the only thing this module persists across tabs is the
 * non-secret {@link K.cookieSession} marker ("a cookie session exists until
 * \<epoch ms\>"). Access tokens are unchanged. Everything below therefore has
 * two shapes — with an in-JS refresh token (009, and any cookie-off
 * deployment) and without one — and the mode is read from the Worker's own
 * `refresh_token_cookie` flag, never assumed.
 */
import {
  isHttpUrl,
  isValidOAuthParam,
  isValidToken,
  sanitizeStoredUser,
} from "@/lib/input-schemas";
// Roadmap 033: storage access goes through the safe wrappers — a
// storage-disabled browser reads "signed out" (get → null) and writes are
// no-ops, instead of a throw taking down whatever called into this module.
import { localGet, localRemove, localSet, sessionGet, sessionRemove, sessionSet } from "./storage";

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

/** The `rcv.oauth.*` keys — sessionStorage, except {@link K.cookieSession}. */
const K = {
  pending: "rcv.oauth.pending",
  token: "rcv.oauth.token",
  tokenExpiresAt: "rcv.oauth.tokenExpiresAt",
  refreshToken: "rcv.oauth.refreshToken",
  refreshTokenExpiresAt: "rcv.oauth.refreshTokenExpiresAt",
  user: "rcv.oauth.user",
  /** Roadmap 065 — the ONE oauth key in localStorage, and the only oauth
   *  state that outlives the tab. It holds no secret: just the refresh
   *  horizon as epoch ms, so boot knows whether a silent cookie refresh is
   *  worth a round trip. The token it refers to is in the `HttpOnly` cookie,
   *  out of JS's reach entirely. */
  cookieSession: "rcv.oauth.cookieSession",
} as const;

/**
 * Roadmap 065 — the marker's horizon, or null when there is none. Validated
 * like every other stored value (roadmap 030): a hand-edited/non-numeric
 * value is dropped and read as absent, rather than poisoning every later
 * boot with a NaN comparison.
 */
function readCookieSession(): number | null {
  const raw = localGet(K.cookieSession);
  if (raw === null) {
    return null;
  }
  const horizon = Number(raw);
  if (!Number.isFinite(horizon)) {
    localRemove(K.cookieSession);
    return null;
  }
  return horizon;
}

/** True while the marker says the cookie's refresh token is still good — the
 *  only evidence in JS that a cookie session exists at all (the cookie itself
 *  is `HttpOnly` and unreadable). An expired marker reads as "no session":
 *  the refresh would fail anyway, and probing costs a round trip. */
function hasLiveCookieSession(): boolean {
  const horizon = readCookieSession();
  return horizon !== null && Date.now() < horizon;
}

/**
 * The one validity rule, shared by both config sources: a client id AND a
 * worker URL, both non-blank; the worker URL is joined with `${path}` below,
 * so its trailing slashes are stripped exactly once, here.
 */
function toOAuthConfig(
  clientId: string | undefined,
  workerUrl: string | undefined,
  appSlug: string | undefined,
): OAuthConfig | null {
  const id = clientId?.trim();
  const url = workerUrl?.trim();
  if (!id || !url) {
    return null;
  }
  return {
    clientId: id,
    workerUrl: url.replace(/\/+$/, ""),
    appSlug: appSlug?.trim() || undefined,
  };
}

/**
 * Roadmap 043 — the `globalThis.__RCV_OAUTH__` a deployment's `/rcv-config.js`
 * may define. It is a served file, not a build-time constant, so every field is
 * checked; anything malformed reads as "not configured" and the build-time vars
 * get their turn.
 */
function runtimeOAuthConfig(): OAuthConfig | null {
  const raw = globalThis.__RCV_OAUTH__;
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { clientId, workerUrl, appSlug } = raw as Record<string, unknown>;
  return toOAuthConfig(
    typeof clientId === "string" ? clientId : undefined,
    typeof workerUrl === "string" ? workerUrl : undefined,
    typeof appSlug === "string" ? appSlug : undefined,
  );
}

/**
 * Returns the OAuth config only when fully configured, else null (feature off).
 *
 * Runtime config wins over the build-time `VITE_*` vars so ONE published image
 * (roadmap 043) serves both an OAuth-off and an OAuth-on deployment; the Pages
 * build, which has no `/rcv-config.js` content, still reads its vars.
 */
export function getOAuthConfig(): OAuthConfig | null {
  return (
    runtimeOAuthConfig() ??
    toOAuthConfig(
      import.meta.env.VITE_GITHUB_CLIENT_ID,
      import.meta.env.VITE_OAUTH_WORKER_URL,
      import.meta.env.VITE_GITHUB_APP_SLUG,
    )
  );
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

/**
 * Security 2026-07-25: sessionStorage is input like any other — it can be
 * hand-edited, or drift across app versions — and these two values go
 * straight into an `Authorization: Bearer` header and into `setPresetAuth`
 * for every preset fetch. Both are validated (the header-injection rule)
 * before they are believed; a failure drops the WHOLE OAuth state rather
 * than limping on with half a session, because a token that cannot be sent
 * is indistinguishable from being signed out and every caller already handles
 * signed-out (public presets keep working).
 */
function loadTokenState(): TokenState | null {
  const token = sessionGet(K.token);
  if (!token) {
    return null;
  }
  const storedRefresh = sessionGet(K.refreshToken);
  if (!isValidToken(token) || (storedRefresh !== null && !isValidToken(storedRefresh))) {
    signOut();
    return null;
  }
  const expiresAt = Number(sessionGet(K.tokenExpiresAt) ?? "0");
  const refreshToken = storedRefresh ?? undefined;
  const refreshExp = sessionGet(K.refreshTokenExpiresAt);
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
  sessionSet(K.token, state.token);
  sessionSet(K.tokenExpiresAt, String(state.tokenExpiresAt));
  if (state.refreshToken) {
    sessionSet(K.refreshToken, state.refreshToken);
  } else {
    sessionRemove(K.refreshToken);
  }
  if (state.refreshTokenExpiresAt) {
    sessionSet(K.refreshTokenExpiresAt, String(state.refreshTokenExpiresAt));
  } else {
    sessionRemove(K.refreshTokenExpiresAt);
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
  /** Roadmap 065 — set by a cookie-mode Worker: the refresh token is NOT in
   *  this body, it is in the `HttpOnly` cookie the same response set. */
  refresh_token_cookie?: boolean;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * A failed Worker round trip. `transient` says the failure MAY be a blip —
 * a fetch rejection, a 5xx (the Worker itself couldn't reach GitHub), a
 * malformed body — rather than a definitive 4xx rejection of the credentials
 * that were sent. Callers must not destroy session state over a transient
 * failure: dropping the cookie-session marker (or worse, signing out, which
 * fires `/logout`) on a flaky boot would orphan — or actively burn — a
 * still-good refresh cookie, the exact session roadmap 065 exists to keep.
 */
class WorkerError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient: boolean) {
    super(message);
    this.transient = transient;
  }
}

async function postWorker(path: string, body: unknown): Promise<TokenResponse> {
  const cfg = getOAuthConfig();
  if (!cfg) {
    throw new WorkerError("Sign-in is not configured.", false);
  }
  let res: Response;
  try {
    res = await fetch(`${cfg.workerUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Roadmap 065: the refresh cookie must ride along on every Worker call
      // (it is what `/refresh` reads in cookie mode and what `/exchange` sets).
      // Harmless when no cookie exists or the deployment is cookie-off, and the
      // Worker always answers with `access-control-allow-credentials: true`.
      credentials: "include",
    });
  } catch {
    throw new WorkerError("Could not reach the sign-in service.", true);
  }
  const raw: unknown = await res.json().catch(() => ({}));
  // Roadmap 030: the Worker's response is network input — a structurally
  // invalid body (wrong types, or an access_token that couldn't safely go
  // into a header — the "header injection" rule) is treated as carrying no
  // token at all, so it fails the same "Token exchange failed" path below
  // rather than something malformed ever being stored. Roadmap 031: the
  // schema module (zod) loads here, on an already-network-bound async path.
  const { tokenResponseSchema } = await import("@/lib/input-schemas-zod");
  const parsed = tokenResponseSchema.safeParse(raw);
  const data: TokenResponse = parsed.success ? parsed.data : {};
  if (!res.ok || data.error || !data.access_token) {
    throw new WorkerError(
      data.error_description || data.error || `Token exchange failed (HTTP ${res.status}).`,
      // Only a 4xx is a definitive rejection of what was sent (the Worker
      // passes GitHub's bad-grant errors through as 400); a 5xx or an
      // OK-but-malformed body may well resolve on retry.
      !(res.status >= 400 && res.status < 500),
    );
  }
  return data;
}

function applyTokenResponse(data: TokenResponse): void {
  const now = Date.now();
  const tokenExpiresAt =
    typeof data.expires_in === "number" ? now + data.expires_in * 1000 : Number.MAX_SAFE_INTEGER;
  const refreshExpiresAt =
    typeof data.refresh_token_expires_in === "number"
      ? now + data.refresh_token_expires_in * 1000
      : undefined;
  storeTokenState({
    // access_token presence is guaranteed by postWorker.
    token: data.access_token as string,
    tokenExpiresAt,
    // Roadmap 065: in cookie mode there IS no refresh token to store — the
    // Worker kept it in the cookie, which is the whole point (XSS can use the
    // session while the page is open, but cannot exfiltrate the 6-month
    // token). GitHub rotates on every refresh, so the Worker re-sets the
    // cookie each time and the horizon below moves with it.
    refreshToken: data.refresh_token_cookie ? undefined : data.refresh_token,
    refreshTokenExpiresAt: refreshExpiresAt,
  });
  if (data.refresh_token_cookie) {
    localSet(K.cookieSession, String(refreshExpiresAt ?? Number.MAX_SAFE_INTEGER));
  } else {
    // Mode-switch hygiene: a deployment that turned cookie mode back off (or
    // a 009 Worker answering a browser that still carries a marker) must not
    // leave a marker behind promising a cookie session that nothing refreshes.
    localRemove(K.cookieSession);
  }
}

async function fetchUser(token: string): Promise<StoredUser> {
  const res = await fetch(USER_API, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`Could not load your GitHub profile (HTTP ${res.status}).`);
  }
  const { userApiResponseSchema } = await import("@/lib/input-schemas-zod");
  const parsed = userApiResponseSchema.safeParse(await res.json());
  const login = parsed.success ? (parsed.data.login ?? "") : "";
  const avatarUrl = parsed.success && parsed.data.avatar_url;
  // Roadmap 030: the avatar URL is rendered into an `<img src>` attribute —
  // must be http(s), never dropped from GitHub's response but silently
  // omitted here if it somehow weren't.
  const user: StoredUser = { login, avatarUrl: avatarUrl && isHttpUrl(avatarUrl) ? avatarUrl : "" };
  sessionSet(K.user, JSON.stringify(user));
  return user;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isSignedIn(): boolean {
  return currentToken() !== null;
}

/** Roadmap 030: a stored user that fails validation (corrupted JSON, a
 *  hand-edited `login`, a non-http(s) `avatarUrl`) is treated as absent and
 *  the bad value removed — same silent-fallback rule as every other stored
 *  value, not a reason to force a re-sign-in. */
export function getStoredUser(): StoredUser | null {
  const raw = sessionGet(K.user);
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sessionRemove(K.user);
    return null;
  }
  const sanitized = sanitizeStoredUser(parsed);
  if (!sanitized) {
    sessionRemove(K.user);
    return null;
  }
  return sanitized;
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
  sessionSet(K.pending, JSON.stringify({ state, verifier, returnHash }));

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

/**
 * OAuth callback params from a query string, or null when not a callback.
 * Roadmap 030: `code`/`state` are validated (bounded length, no control
 * characters) — they round-trip through this URL and then a Worker POST
 * body, so a malformed value is refused here rather than forwarded.
 */
export function readCallbackParams(search: string): { code: string; state: string } | null {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return null;
  }
  // Roadmap 031: the zod-free predicate, because this runs synchronously on
  // the boot path (before the lazy schema module could load). Same rule.
  return isValidOAuthParam(code) && isValidOAuthParam(state) ? { code, state } : null;
}

/**
 * Validates `state`, exchanges the code via the Worker and stores the token.
 * Resolves as soon as the token is stored (roadmap 031) — the profile fetch
 * that feeds the toolbar chip is purely cosmetic, so it rides along as a
 * promise the caller consumes whenever it lands instead of gating the
 * sign-in (and, downstream, a share link's decode and auto-run). Throws on
 * state mismatch or exchange failure (caller stays signed out).
 *
 * Single-flight per callback (like `getValidToken`'s refresh below): the
 * pending stash is consume-once and the `code` is single-use at GitHub, but
 * React's StrictMode mounts the completing effect twice in dev — the second
 * invocation of the SAME code+state must join the first's exchange, not find
 * an empty stash and paint "sign-in failed" over a sign-in that succeeded.
 * A genuinely new callback (fresh redirect, different code) starts fresh.
 */
let callbackInFlight: {
  key: string;
  promise: Promise<{ userPromise: Promise<StoredUser | null>; returnHash: string }>;
} | null = null;

export function completeCallback(
  code: string,
  state: string,
): Promise<{ userPromise: Promise<StoredUser | null>; returnHash: string }> {
  const key = `${state} ${code}`;
  if (callbackInFlight?.key !== key) {
    callbackInFlight = { key, promise: completeCallbackImpl(code, state) };
  }
  return callbackInFlight.promise;
}

async function completeCallbackImpl(
  code: string,
  state: string,
): Promise<{ userPromise: Promise<StoredUser | null>; returnHash: string }> {
  const pendingRaw = sessionGet(K.pending);
  sessionRemove(K.pending);
  if (!pendingRaw) {
    throw new Error("No pending sign-in to match this response.");
  }
  // Security 2026-07-25: the stash was JSON.parsed and type-ASSERTED, so a
  // corrupted/hand-edited value reached the CSRF `state` comparison and became
  // the PKCE `code_verifier` posted to the Worker. Schema-checked instead; a
  // failure takes the existing "corrupted" branch (the user stays signed out).
  let parsedPending: unknown;
  try {
    parsedPending = JSON.parse(pendingRaw);
  } catch {
    throw new Error("Sign-in state was corrupted.");
  }
  const { pendingSignInSchema } = await import("@/lib/input-schemas-zod");
  const pendingResult = pendingSignInSchema.safeParse(parsedPending);
  if (!pendingResult.success) {
    throw new Error("Sign-in state was corrupted.");
  }
  const pending = pendingResult.data;
  if (pending.state !== state) {
    throw new Error("Sign-in state mismatch; aborting for safety.");
  }
  const data = await postWorker("/exchange", {
    code,
    code_verifier: pending.verifier,
    redirect_uri: redirectUri(),
  });
  applyTokenResponse(data);
  // Never rejects (null = profile unavailable; the chip shows a plain
  // "signed in") so a caller that consumes it late needs no error path —
  // pre-031 a profile failure failed the WHOLE callback even though the
  // token was already stored, leaving a signed-in session behind a
  // "sign-in failed" notice.
  const userPromise: Promise<StoredUser | null> = fetchUser(data.access_token as string).catch(
    () => null,
  );
  return { userPromise, returnHash: pending.returnHash ?? "" };
}

/**
 * Roadmap 065 — the boot restore: turns a surviving `HttpOnly` refresh cookie
 * back into a signed-in session, or resolves null (signed out, the 009
 * fallback). Cheap when there is nothing to restore — an already-loaded token
 * (a plain reload inside the access token's lifetime) and a missing/expired
 * marker both answer without touching the network.
 *
 * The resolved user is the toolbar chip's, not the session: the profile fetch
 * is cosmetic and its failure yields null, so {@link isSignedIn} may be true
 * after this resolves even when the returned user is null — the same contract
 * `completeCallback`'s `userPromise` has (a nameless chip beats a session
 * thrown away over a cosmetic fetch).
 *
 * Single-flight, and this one MUST be: StrictMode double-mounts the effect
 * that calls it, and GitHub ROTATES refresh tokens — a second concurrent
 * `/refresh` would post the cookie the first one already burned and kill the
 * session it was restoring. Same idiom as `callbackInFlight`, minus the key:
 * there is only ever one session to restore, so every caller joins the one
 * promise. Clearing it on completion is safe (and keeps the module from
 * pinning a stale result forever): by then either a token is loaded, the
 * marker is gone (both no-network branches), or the failure was transient —
 * and a retry is exactly what a later caller should get then.
 */
let restoreInFlight: Promise<StoredUser | null> | null = null;

export function restoreSession(): Promise<StoredUser | null> {
  restoreInFlight ??= restoreSessionImpl().finally(() => {
    restoreInFlight = null;
  });
  return restoreInFlight;
}

async function restoreSessionImpl(): Promise<StoredUser | null> {
  if (currentToken()) {
    return getStoredUser();
  }
  if (!hasLiveCookieSession()) {
    return null;
  }
  let data: TokenResponse;
  try {
    // Empty body: the refresh token is the cookie `credentials: "include"`
    // sends, and the SPA has no copy of it to offer.
    data = await postWorker("/refresh", {});
  } catch (err) {
    // A definitive rejection (a 4xx: the cookie is gone, expired, or was
    // already rotated away) drops the marker so later boots stop probing. A
    // transient failure — an offline boot, a Worker/GitHub 5xx — keeps it:
    // the cookie may be perfectly fine, and the next boot retrying instead of
    // stranding it is the entire persistence promise of roadmap 065. Either
    // way this boot stays signed out.
    if (!(err instanceof WorkerError && err.transient)) {
      localRemove(K.cookieSession);
    }
    return null;
  }
  applyTokenResponse(data);
  return fetchUser(data.access_token as string).catch(() => null);
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
  // Roadmap 065: no in-JS refresh token is not the end of the session any
  // more — in cookie mode there never was one, and a live marker says the
  // `HttpOnly` cookie still carries a good token, so the refresh goes out
  // with an EMPTY body for the Worker to fill from the cookie. Without a
  // marker (009, or an expired horizon) this is the unchanged signOut path.
  const viaCookie = !state.refreshToken && hasLiveCookieSession();
  if ((!state.refreshToken && !viaCookie) || refreshExpired) {
    signOut();
    return null;
  }
  // Both paths share the ONE in-flight refresh: they are mutually exclusive
  // per session, and a second concurrent cookie refresh would post the
  // already-rotated (burned) cookie and kill the session it is renewing.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const data = await postWorker(
          "/refresh",
          viaCookie ? {} : { refresh_token: state.refreshToken },
        );
        applyTokenResponse(data);
        return currentToken()?.token ?? null;
      } catch (err) {
        // Same split as the boot restore: only a definitive 4xx ends the
        // session. A transient failure answers null for THIS call (the
        // caller acts unauthenticated once) but keeps the session so the
        // next call retries — signOut() here would fire /logout, and with a
        // reachable Worker behind an unreachable GitHub that would burn a
        // still-good refresh cookie over a blip.
        if (!(err instanceof WorkerError && err.transient)) {
          signOut();
        }
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
 *
 * Roadmap 065: the refresh cookie has to die with the session too, and only
 * the Worker can clear it — hence the fire-and-forget `POST /logout`. It is
 * best-effort by design: this function is synchronous (every caller, down to
 * `loadTokenState`'s corrupted-state path, relies on that) and must never
 * throw, so a failed or blocked request costs nothing but the cookie's
 * server-side lifetime, which the dropped marker already stops the app from
 * using. `postWorker` is deliberately NOT reused: it expects a token JSON
 * body and throws on anything that isn't one.
 */
export function signOut(): void {
  memToken = null;
  memLoaded = true;
  for (const key of Object.values(K)) {
    sessionRemove(key);
  }
  // The one localStorage key: the loop above is a no-op for it.
  localRemove(K.cookieSession);
  const cfg = getOAuthConfig();
  if (cfg) {
    void fetch(`${cfg.workerUrl}/logout`, { method: "POST", credentials: "include" }).catch(
      () => {},
    );
  }
}
