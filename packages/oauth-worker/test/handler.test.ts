import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest, type Env } from "../src/index";

const ALLOWED = "https://secustor.github.io";
const DEV = "http://localhost:5173";
const EVIL = "https://evil.example";

const env: Env = {
  GITHUB_CLIENT_ID: "Iv1.testclientid",
  GITHUB_CLIENT_SECRET: "super-secret-value",
  ALLOWED_ORIGINS: `${ALLOWED}, ${DEV}`,
};

/** Roadmap 065 — the same deployment with the opt-in cookie mode switched on. */
const cookieEnv: Env = { ...env, REFRESH_COOKIE: "true" };

const COOKIE_NAME = "__Secure-rcv-refresh";

const ACCESS_TOKEN = "ghu_thisisasecrettokenvalue";

/** A successful GitHub token response. */
function ghTokenResponse() {
  return new Response(
    JSON.stringify({
      access_token: ACCESS_TOKEN,
      expires_in: 28800,
      refresh_token: "ghr_refreshsecret",
      refresh_token_expires_in: 15897600,
      token_type: "bearer",
      scope: "",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function post(
  path: string,
  body: unknown,
  origin: string | null,
  cookie?: string,
  base = "https://worker.example",
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) {
    headers.origin = origin;
  }
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// Spy on every console method so we can assert nothing (least of all a token)
// is ever logged.
let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function assertNothingLogged() {
  for (const spy of consoleSpies) {
    expect(spy).not.toHaveBeenCalled();
  }
}

describe("CORS gate", () => {
  it("answers a preflight from an allowed origin with reflected CORS headers", async () => {
    const req = new Request("https://worker.example/exchange", {
      method: "OPTIONS",
      headers: { origin: ALLOWED },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("rejects a preflight from a disallowed origin with 403 and no CORS headers", async () => {
    const req = new Request("https://worker.example/exchange", {
      method: "OPTIONS",
      headers: { origin: EVIL },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a real request from a disallowed origin without touching GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(
      post("/exchange", { code: "x", code_verifier: "y" }, EVIL),
      env,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    assertNothingLogged();
  });

  it("refuses a request with no Origin header", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(
      post("/exchange", { code: "x", code_verifier: "y" }, null),
      env,
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /exchange", () => {
  it("appends client id + secret and forwards the PKCE verifier, then returns the token verbatim", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ghTokenResponse());
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleRequest(
      post(
        "/exchange",
        {
          code: "the-oauth-code",
          code_verifier: "the-pkce-verifier",
          redirect_uri: "https://secustor.github.io/renovate-config-visualizer/",
        },
        DEV,
      ),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(DEV);
    const json = (await res.json()) as { access_token?: string; refresh_token?: string };
    expect(json.access_token).toBe(ACCESS_TOKEN);
    expect(json.refresh_token).toBe("ghr_refreshsecret");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GITHUB_TOKEN_URL());
    const headers = init.headers as Record<string, string>;
    expect(headers.accept).toBe("application/json");
    const outgoing = String(init.body);
    expect(outgoing).toContain("client_id=Iv1.testclientid");
    expect(outgoing).toContain("client_secret=super-secret-value");
    expect(outgoing).toContain("code=the-oauth-code");
    expect(outgoing).toContain("code_verifier=the-pkce-verifier");
    expect(outgoing).toContain("grant_type=authorization_code");

    assertNothingLogged();
  });

  it("rejects a body missing code / code_verifier with 400 and no GitHub call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(post("/exchange", { code: "only-code" }, ALLOWED), env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /refresh", () => {
  it("performs a refresh_token grant and returns the new token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ghTokenResponse());
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleRequest(
      post("/refresh", { refresh_token: "ghr_oldrefresh" }, ALLOWED),
      env,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { access_token?: string };
    expect(json.access_token).toBe(ACCESS_TOKEN);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const outgoing = String(init.body);
    expect(outgoing).toContain("grant_type=refresh_token");
    expect(outgoing).toContain("refresh_token=ghr_oldrefresh");
    expect(outgoing).toContain("client_secret=super-secret-value");
    assertNothingLogged();
  });

  it("rejects a body missing refresh_token with 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(post("/refresh", {}, ALLOWED), env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GitHub error passthrough", () => {
  it("passes a GitHub {error} body back (downgraded to 400) and logs nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "bad_verification_code", error_description: "expired" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      env,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("bad_verification_code");
    assertNothingLogged();
  });

  it("returns 502 when GitHub is unreachable, exposing no token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      env,
    );
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(ACCESS_TOKEN);
    assertNothingLogged();
  });
});

describe("routing", () => {
  it("404s an unknown route", async () => {
    const res = await handleRequest(post("/nope", {}, ALLOWED), env);
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("not_found");
  });

  it("404s an unknown route under the /oauth mount too", async () => {
    const res = await handleRequest(post("/oauth/nope", {}, ALLOWED), cookieEnv);
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("serves the /oauth-prefixed path from a Workers route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ghTokenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(
      post("/oauth/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      env,
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---- Roadmap 065: refresh-token cookie mode -----------------------------

describe("allow-credentials", () => {
  it("is sent on a preflight, alongside an exact (never wildcard) origin", async () => {
    const req = new Request("https://worker.example/exchange", {
      method: "OPTIONS",
      headers: { origin: ALLOWED },
    });
    const res = await handleRequest(req, env);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("is sent on a real response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ghTokenResponse()));
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      env,
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("cookie mode off (the 009 protocol)", () => {
  it("never sets a cookie and leaves the refresh token in the body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ghTokenResponse()));
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      env,
    );
    expect(res.headers.get("set-cookie")).toBeNull();
    const json = (await res.json()) as { refresh_token?: string; refresh_token_cookie?: boolean };
    expect(json.refresh_token).toBe("ghr_refreshsecret");
    expect(json.refresh_token_cookie).toBeUndefined();
  });

  it("ignores a refresh cookie: an empty /refresh body is still a 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(
      post("/refresh", {}, ALLOWED, `${COOKIE_NAME}=ghr_fromcookie`),
      env,
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("answers /logout with 204 and no cookie header", async () => {
    const res = await handleRequest(post("/logout", {}, ALLOWED), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });
});

describe("cookie mode on", () => {
  it("moves the refresh token out of the body and into an HttpOnly cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ghTokenResponse()));
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      cookieEnv,
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE_NAME}=ghr_refreshsecret`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=15897600");
    // __Host- would force Path=/, which the shared hostname forbids.
    expect(setCookie).not.toContain("__Host-");

    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      refresh_token_cookie?: boolean;
      refresh_token_expires_in?: number;
    };
    expect(json.access_token).toBe(ACCESS_TOKEN);
    expect(json.refresh_token).toBeUndefined();
    expect(json.refresh_token_cookie).toBe(true);
    // Kept: it feeds the app's non-secret localStorage marker.
    expect(json.refresh_token_expires_in).toBe(15897600);
    assertNothingLogged();
  });

  it("pins the cookie Path to the /oauth mount it was reached through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ghTokenResponse()));
    const res = await handleRequest(
      post("/oauth/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      cookieEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Path=/oauth");
  });

  it("falls back to the fixed 180-day Max-Age when GitHub omits the expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: ACCESS_TOKEN, refresh_token: "ghr_x" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      cookieEnv,
    );
    expect(res.headers.get("set-cookie")).toContain("Max-Age=15552000");
  });

  it("leaves a refresh-token-less payload alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 28800 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      cookieEnv,
    );
    expect(res.headers.get("set-cookie")).toBeNull();
    const json = (await res.json()) as { refresh_token_cookie?: boolean };
    expect(json.refresh_token_cookie).toBeUndefined();
  });

  it("refreshes from the cookie on an empty body, and rotates the cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ghTokenResponse());
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleRequest(
      post("/refresh", {}, ALLOWED, `other=1; ${COOKIE_NAME}=ghr_fromcookie; another=2`),
      cookieEnv,
    );

    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain("refresh_token=ghr_fromcookie");
    // GitHub rotates the token, so the cookie must carry the NEW one.
    expect(res.headers.get("set-cookie")).toContain(`${COOKIE_NAME}=ghr_refreshsecret`);
    assertNothingLogged();
  });

  it("prefers an explicit body refresh_token over the cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ghTokenResponse());
    vi.stubGlobal("fetch", fetchMock);

    await handleRequest(
      post("/refresh", { refresh_token: "ghr_frombody" }, ALLOWED, `${COOKIE_NAME}=ghr_fromcookie`),
      cookieEnv,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain("refresh_token=ghr_frombody");
    expect(String(init.body)).not.toContain("ghr_fromcookie");
  });

  it("still 400s a /refresh with neither body token nor cookie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(post("/refresh", {}, ALLOWED), cookieEnv);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the cookie when GitHub rejects the grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "bad_refresh_token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const res = await handleRequest(
      post("/refresh", {}, ALLOWED, `${COOKIE_NAME}=ghr_dead`),
      cookieEnv,
    );
    expect(res.status).toBe(400);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
    assertNothingLogged();
  });

  it("keeps an existing session when an /exchange fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "bad_verification_code" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED),
      cookieEnv,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("clears the cookie on /logout and answers 204", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(post("/logout", {}, ALLOWED), cookieEnv);
    expect(res.status).toBe(204);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the /oauth-mounted cookie on a prefixed /logout", async () => {
    const res = await handleRequest(post("/oauth/logout", {}, ALLOWED), cookieEnv);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Path=/oauth");
  });

  it("refuses /logout from a disallowed origin", async () => {
    const res = await handleRequest(post("/logout", {}, EVIL), cookieEnv);
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("cookie mode never engages on a *.workers.dev host", () => {
  // The workers.dev URL stays live (and cross-site) until the DNS switch puts
  // the Worker on the app's own hostname. If cookie mode engaged there, the
  // refresh token would leave the body for a SameSite=Strict cookie the
  // browser drops — capping the session at one access token. The host
  // exclusion is what makes REFRESH_COOKIE=true safe to publish ahead of the
  // switch.
  const WORKERS_DEV = "https://rcv-oauth-worker.secustor.workers.dev";

  it("keeps the 009 protocol: refresh token in the body, no cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ghTokenResponse()));
    const res = await handleRequest(
      post("/exchange", { code: "c", code_verifier: "v" }, ALLOWED, undefined, WORKERS_DEV),
      cookieEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const json = (await res.json()) as { refresh_token?: string; refresh_token_cookie?: boolean };
    expect(json.refresh_token).toBe("ghr_refreshsecret");
    expect(json.refresh_token_cookie).toBeUndefined();
  });

  it("never reads a cookie on /refresh: an empty body is still a 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleRequest(
      post("/refresh", {}, ALLOWED, `${COOKIE_NAME}=ghr_fromcookie`, WORKERS_DEV),
      cookieEnv,
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("answers /logout without a clearing cookie header", async () => {
    const res = await handleRequest(
      post("/logout", {}, ALLOWED, undefined, WORKERS_DEV),
      cookieEnv,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

/** The GitHub token URL, duplicated here so the test pins the exact endpoint. */
function GITHUB_TOKEN_URL() {
  return "https://github.com/login/oauth/access_token";
}
