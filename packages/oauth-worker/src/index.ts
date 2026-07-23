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
 */

export interface Env {
  /** GitHub App client id (public). Provided via `vars`. */
  GITHUB_CLIENT_ID: string;
  /** GitHub App client secret. Provided via `wrangler secret put`. */
  GITHUB_CLIENT_SECRET: string;
  /** Comma-separated list of exact origins allowed to call this Worker. */
  ALLOWED_ORIGINS: string;
}

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

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
  headers.set("access-control-max-age", "86400");
  return headers;
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  const headers = origin ? corsHeaders(origin) : new Headers();
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Forwards a completed grant to GitHub and passes its JSON back verbatim.
 * GitHub replies 200 even for `{ error: ... }` on this endpoint, so an error
 * body is downgraded to 400. No body or token is ever logged.
 */
async function forwardToGitHub(params: URLSearchParams, origin: string): Promise<Response> {
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

  const isError =
    typeof payload === "object" &&
    payload !== null &&
    "error" in (payload as Record<string, unknown>);
  const status = isError ? 400 : ghRes.ok ? 200 : ghRes.status;
  return jsonResponse(payload, status, origin);
}

async function handleExchange(req: Request, env: Env, origin: string): Promise<Response> {
  let body: ExchangeBody;
  try {
    body = (await req.json()) as ExchangeBody;
  } catch {
    return jsonResponse(
      { error: "invalid_request", error_description: "body must be JSON" },
      400,
      origin,
    );
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
  return forwardToGitHub(params, origin);
}

async function handleRefresh(req: Request, env: Env, origin: string): Promise<Response> {
  let body: RefreshBody;
  try {
    body = (await req.json()) as RefreshBody;
  } catch {
    return jsonResponse(
      { error: "invalid_request", error_description: "body must be JSON" },
      400,
      origin,
    );
  }
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
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
  return forwardToGitHub(params, origin);
}

/**
 * Pure request handler. Answers only same-listed-origin POSTs to /exchange and
 * /refresh; a preflight from an allowed origin gets the CORS headers; anything
 * from a non-listed origin is refused (403) before GitHub is ever contacted.
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

  const { pathname } = new URL(req.url);
  if (req.method === "POST" && pathname === "/exchange") {
    return handleExchange(req, env, origin);
  }
  if (req.method === "POST" && pathname === "/refresh") {
    return handleRefresh(req, env, origin);
  }
  return jsonResponse({ error: "not_found" }, 404, origin);
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env);
  },
};
