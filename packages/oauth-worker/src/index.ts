/**
 * GitHub OAuth token-exchange proxy (roadmap 009).
 *
 * A static SPA cannot complete GitHub's OAuth flow itself: the token endpoint
 * still requires the `client_secret` (even with PKCE) and does not serve CORS
 * on `github.com/login/*`. This Worker is the minimal "gatekeeper" that appends
 * the secret and forwards the code / refresh exchange — and NOTHING else.
 *
 * Hard boundary: the Worker never sees a config, a preset, or an API request.
 * It is stateless, persists nothing, and logs no request/response bodies or
 * tokens. The client secret only ever lives in the Worker secret store.
 *
 * The request handler is a pure function so it can be unit-tested without
 * wrangler (stub `globalThis.fetch`); the default export wires it to the
 * Workers runtime.
 *
 * Roadmap 065 — opt-in `REFRESH_COOKIE=true` moves the refresh token out of
 * the JSON body and into an `HttpOnly` cookie, so a tab close no longer signs
 * the user out while the long-lived token stays unreadable to JS. The Worker
 * remains stateless: the cookie IS the storage. With the var unset every
 * observable behavior is the 009 one.
 */

export interface Env {
  /** GitHub App client id (public). Provided via `vars`. */
  GITHUB_CLIENT_ID: string;
  /** GitHub App client secret. Provided via `wrangler secret put`. */
  GITHUB_CLIENT_SECRET: string;
  /** Comma-separated list of exact origins allowed to call this Worker. */
  ALLOWED_ORIGINS: string;
  /**
   * Roadmap 065 — `"true"` enables refresh-token-cookie mode. Anything else
   * (including unset) keeps the 009 protocol byte-for-byte, which is what the
   * stock Docker image and cross-site deployments need: a cross-site cookie
   * is dropped outright by Safari and by every browser running
   * third-party-cookie blocking. A `*.workers.dev` host keeps 009 even with
   * the var set ({@link cookieMode}) — that URL is the cross-site fallback by
   * definition.
   */
  REFRESH_COOKIE?: string;
}

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

/**
 * `__Secure-` and deliberately NOT `__Host-`: the `__Host-` prefix would force
 * `Path=/`, and on the shared `renovate.secustor.dev` hostname that would send
 * the refresh token along with every GitHub Pages asset request. The cookie
 * `Path` must stay pinned to the Worker's mount (roadmap 065).
 */
const REFRESH_COOKIE_NAME = "__Secure-rcd-refresh";

/** Fallback lifetime when GitHub omits `refresh_token_expires_in` (180 days). */
const REFRESH_COOKIE_MAX_AGE = 15_552_000;

/** The `/oauth/*` Workers route prefix; stripped once, never recursively. */
const MOUNT_PREFIX = "/oauth";

interface ExchangeBody {
  code?: unknown;
  code_verifier?: unknown;
  redirect_uri?: unknown;
}

interface RefreshBody {
  refresh_token?: unknown;
}

/** The configured allow-list, trimmed and de-blanked. */
function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/** The request's Origin if (and only if) it is on the allow-list, else null. */
function matchOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get("origin");
  if (!origin) {
    return null;
  }
  return allowedOrigins(env).includes(origin) ? origin : null;
}

/** CORS headers reflecting exactly the (already-validated) origin — never `*`. */
function corsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  // Roadmap 065: a `credentials: "include"` fetch requires this header AND an
  // exact origin (the browser rejects the pair with `*`) — which is what
  // `access-control-allow-origin` above already is. Sent unconditionally so
  // the app can use one fetch shape against both cookie and non-cookie
  // deployments; it grants nothing on its own, the allow-list still gates.
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-max-age", "86400");
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  setCookie?: string,
): Response {
  const headers = origin ? corsHeaders(origin) : new Headers();
  headers.set("content-type", "application/json");
  if (setCookie) {
    headers.set("set-cookie", setCookie);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * The request body as JSON, or the 400 to answer with. Both endpoints take a
 * JSON body and both refuse a malformed one identically, so the guard is
 * written once: a caller returns the {@link Response} it gets back untouched.
 *
 * Object-ness is validated (a bare `null`, array or scalar is as malformed as
 * unparseable, and gets the same 400); the fields stay `unknown` for the
 * handlers to type-check. A body that parses but says nothing useful falls
 * through to the endpoint's own "required" 400.
 */
async function parseJsonBody<T extends object>(
  req: Request,
  origin: string,
): Promise<T | Response> {
  const malformed = () =>
    jsonResponse({ error: "invalid_request", error_description: "body must be JSON" }, 400, origin);
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return malformed();
    }
    return parsed as T;
  } catch {
    return malformed();
  }
}

/**
 * True only for the exact opt-in string — an unset/typo'd var means 009 — and
 * never on a `*.workers.dev` host. That fallback URL is only ever reached
 * cross-site (the same-site deployment is the `/oauth` route on the app's own
 * hostname), and a cross-site `SameSite=Strict` cookie is stored nowhere and
 * sent never: engaging cookie mode there would trade the in-body refresh
 * token for a cookie the browser drops, silently capping the session at one
 * access token. Excluding the host structurally makes `REFRESH_COOKIE=true`
 * safe to publish while `workers.dev` is still the live entry point.
 */
function cookieMode(env: Env, hostname: string): boolean {
  return env.REFRESH_COOKIE === "true" && !hostname.endsWith(".workers.dev");
}

/**
 * The Worker answers both `/exchange` (workers.dev, the Node image) and
 * `/oauth/exchange` (the `renovate.secustor.dev/oauth/*` route). Exactly one
 * leading `/oauth` segment is stripped, and the mount it was stripped from
 * becomes the cookie `Path` — that is what keeps the refresh cookie off the
 * GitHub Pages requests sharing the hostname (roadmap 065).
 */
interface Route {
  /** Pathname with the mount removed: always a bare `/exchange` etc. */
  path: string;
  /** `/oauth` when the request arrived prefixed, `/` otherwise. */
  mount: string;
}

function routeOf(url: URL): Route {
  const { pathname } = url;
  if (pathname === MOUNT_PREFIX || pathname.startsWith(`${MOUNT_PREFIX}/`)) {
    return { path: pathname.slice(MOUNT_PREFIX.length) || "/", mount: MOUNT_PREFIX };
  }
  return { path: pathname, mount: "/" };
}

/**
 * The `Set-Cookie` value. `SameSite=Strict` is affordable because the intended
 * deployment is same-origin; `Max-Age=0` with an empty value is the clear.
 * The value is percent-encoded so no token can ever inject a cookie attribute.
 */
function refreshCookie(value: string, maxAge: number, mount: string): string {
  return [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Path=${mount}`,
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function clearRefreshCookie(mount: string): string {
  return refreshCookie("", 0, mount);
}

/** The refresh token from the request's cookie jar, or "" when absent. */
function readRefreshCookie(req: Request): string {
  const header = req.headers.get("cookie");
  if (!header) {
    return "";
  }
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0 || pair.slice(0, eq).trim() !== REFRESH_COOKIE_NAME) {
      continue;
    }
    const raw = pair.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      // A malformed escape means the cookie is not one we wrote — ignore it
      // rather than 500, the caller then falls through to the 400.
      return "";
    }
  }
  return "";
}

/**
 * Rewrites a successful GitHub payload for cookie mode: the `refresh_token`
 * leaves the body and becomes the `Set-Cookie`, `refresh_token_cookie: true`
 * tells the SPA which mode it is talking to, and `refresh_token_expires_in`
 * stays so the app can persist its non-secret "a session exists until" marker.
 * Returns null when there is nothing to move (no refresh token in the grant),
 * leaving the 009 passthrough untouched.
 */
function toCookieResponse(
  payload: Record<string, unknown>,
  mount: string,
): { body: Record<string, unknown>; setCookie: string } | null {
  const token = payload.refresh_token;
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  const expiresIn = payload.refresh_token_expires_in;
  const maxAge =
    typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
      ? Math.floor(expiresIn)
      : REFRESH_COOKIE_MAX_AGE;
  const body: Record<string, unknown> = { ...payload, refresh_token_cookie: true };
  delete body.refresh_token;
  return { body, setCookie: refreshCookie(token, maxAge, mount) };
}

/** How a response may touch the cookie — present only in cookie mode. */
interface CookieOptions {
  /** Cookie `Path` — the mount this request arrived on. */
  mount: string;
  /**
   * Clear the cookie when GitHub rejects the grant. True for /refresh only:
   * the cookie IS what was rejected, so clearing it stops the client probing a
   * dead grant. A failed /exchange says nothing about an existing session.
   */
  clearOnError: boolean;
}

/**
 * Forwards a completed grant to GitHub and passes its JSON back verbatim.
 * GitHub replies 200 even for `{ error: ... }` on this endpoint, so an error
 * body is downgraded to 400. No body or token is ever logged.
 *
 * `cookie` is non-null only in cookie mode (roadmap 065); it then rewrites a
 * successful body as above.
 */
async function forwardToGitHub(
  params: URLSearchParams,
  origin: string,
  cookie: CookieOptions | null,
): Promise<Response> {
  let ghRes: Response;
  try {
    ghRes = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch {
    return jsonResponse({ error: "github_unreachable" }, 502, origin);
  }

  let payload: unknown;
  try {
    payload = await ghRes.json();
  } catch {
    return jsonResponse({ error: "github_bad_response" }, 502, origin);
  }

  const record =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  const isError = record !== null && "error" in record;
  const status = isError ? 400 : ghRes.ok ? 200 : ghRes.status;

  if (cookie !== null && record !== null) {
    if (isError) {
      return cookie.clearOnError
        ? jsonResponse(payload, status, origin, clearRefreshCookie(cookie.mount))
        : jsonResponse(payload, status, origin);
    }
    const cookied = toCookieResponse(record, cookie.mount);
    if (cookied) {
      return jsonResponse(cookied.body, status, origin, cookied.setCookie);
    }
  }
  return jsonResponse(payload, status, origin);
}

async function handleExchange(
  req: Request,
  env: Env,
  origin: string,
  mount: string,
  cookies: boolean,
): Promise<Response> {
  const body = await parseJsonBody<ExchangeBody>(req, origin);
  if (body instanceof Response) {
    return body;
  }
  const code = typeof body.code === "string" ? body.code : "";
  const codeVerifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  if (!code || !codeVerifier) {
    return jsonResponse(
      { error: "invalid_request", error_description: "code and code_verifier are required" },
      400,
      origin,
    );
  }
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
  });
  if (redirectUri) {
    params.set("redirect_uri", redirectUri);
  }
  return forwardToGitHub(params, origin, cookies ? { mount, clearOnError: false } : null);
}

async function handleRefresh(
  req: Request,
  env: Env,
  origin: string,
  mount: string,
  cookies: boolean,
): Promise<Response> {
  const body = await parseJsonBody<RefreshBody>(req, origin);
  if (body instanceof Response) {
    return body;
  }
  // An explicit body token always wins: 009 clients and cookie-off deployments
  // send one, and a client that holds its own token must be able to use it
  // even where a (possibly stale) cookie also exists.
  const fromBody = typeof body.refresh_token === "string" ? body.refresh_token : "";
  const refreshToken = fromBody || (cookies ? readRefreshCookie(req) : "");
  if (!refreshToken) {
    return jsonResponse(
      { error: "invalid_request", error_description: "refresh_token is required" },
      400,
      origin,
    );
  }
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  // GitHub rotates the refresh token on every use, so cookie mode re-sets the
  // cookie on each success — an un-rotated cookie would be dead on next boot.
  return forwardToGitHub(params, origin, cookies ? { mount, clearOnError: true } : null);
}

/**
 * Roadmap 065 — ends the cookie session. Always 204 (the SPA fires it
 * best-effort on sign-out and must not care about the answer); the clearing
 * `Set-Cookie` only exists in cookie mode, where the cookie is the session.
 * Nothing server-side is touched — there is nothing server-side.
 */
function handleLogout(origin: string, mount: string, cookies: boolean): Response {
  const headers = corsHeaders(origin);
  if (cookies) {
    headers.set("set-cookie", clearRefreshCookie(mount));
  }
  return new Response(null, { status: 204, headers });
}

/**
 * Pure request handler. Answers only same-listed-origin POSTs to /exchange,
 * /refresh and /logout; a preflight from an allowed origin gets the CORS
 * headers; anything from a non-listed origin is refused (403) before GitHub is
 * ever contacted. Paths are matched after the optional `/oauth` mount is
 * stripped, so the same code serves the route and a bare deployment.
 */
export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const origin = matchOrigin(req, env);

  if (req.method === "OPTIONS") {
    if (!origin) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Every real request must come from an allow-listed browser origin.
  if (!origin) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, null);
  }

  const url = new URL(req.url);
  const { path, mount } = routeOf(url);
  // Resolved once per request: the env opt-in AND a host cookie mode is
  // actually correct on ({@link cookieMode}).
  const cookies = cookieMode(env, url.hostname);
  if (req.method === "POST" && path === "/exchange") {
    return handleExchange(req, env, origin, mount, cookies);
  }
  if (req.method === "POST" && path === "/refresh") {
    return handleRefresh(req, env, origin, mount, cookies);
  }
  if (req.method === "POST" && path === "/logout") {
    return handleLogout(origin, mount, cookies);
  }
  return jsonResponse({ error: "not_found" }, 404, origin);
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env);
  },
};
