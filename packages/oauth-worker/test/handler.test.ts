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

function post(path: string, body: unknown, origin: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) {
    headers.origin = origin;
  }
  return new Request(`https://worker.example${path}`, {
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
});

/** The GitHub token URL, duplicated here so the test pins the exact endpoint. */
function GITHUB_TOKEN_URL() {
  return "https://github.com/login/oauth/access_token";
}
