import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The cross-tab half of oauth.ts: in cookie mode every tab shares one grant,
 * and GitHub revokes the old access token whenever that grant is refreshed —
 * so a sibling tab's refresh kills this tab's token hours before its recorded
 * expiry. These tests cover the three mechanisms that close the gap: the
 * recovery entry point a 401 triggers (`recoverRejectedToken`), the
 * BroadcastChannel that hands a refreshed token to sibling tabs, and the
 * refresh-lock recheck that keeps a woken tab from posting the cookie a
 * sibling already rotated.
 *
 * Node's own BroadcastChannel delivers between instances in-process, so a
 * plain second channel plays the sibling tab. Same re-import idiom as
 * oauth.session.test.ts: module state (token, single-flights, channel) must
 * not leak between tests.
 */

const COOKIE_SESSION_KEY = "rcd.oauth.cookieSession";
const TOKEN_KEY = "rcd.oauth.token";
const TOKEN_EXPIRES_KEY = "rcd.oauth.tokenExpiresAt";
const WORKER_URL = "https://worker.example";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const g = globalThis as { localStorage?: StorageLike; sessionStorage?: StorageLike };
let local = memoryStorage();
let session = memoryStorage();

let refreshResponse: () => Response = () => jsonResponse({});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function baseFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url === `${WORKER_URL}/refresh`) {
    return Promise.resolve(refreshResponse());
  }
  if (url === `${WORKER_URL}/logout`) {
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (url === "https://api.github.com/user") {
    return Promise.resolve(jsonResponse({ login: "octocat", avatar_url: "https://ex.test/a.png" }));
  }
  return Promise.reject(new Error(`unexpected fetch: ${url} ${String(init?.method)}`));
}

const fetchMock = vi.fn(baseFetch);

function fetchCalls(path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === path);
}

async function freshOAuth() {
  vi.resetModules();
  return import("./oauth");
}

/** The signed-in state a cookie-mode tab holds: an access token in its own
 *  sessionStorage, no in-JS refresh token, the shared marker in localStorage. */
function seedCookieTab(token: string, expiresAt: number): void {
  session.map.set(TOKEN_KEY, token);
  session.map.set(TOKEN_EXPIRES_KEY, String(expiresAt));
  local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 3_600_000));
}

/** A second channel on the module's name — the sibling tab. Collected and
 *  closed per test so a leaked instance can't hear a later test's traffic. */
const siblings: BroadcastChannel[] = [];

function siblingChannel(): BroadcastChannel {
  const ch = new BroadcastChannel("rcd.oauth");
  siblings.push(ch);
  return ch;
}

function siblingPosts(message: unknown): void {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no targetOrigin parameter
  siblingChannel().postMessage(message);
}

beforeEach(() => {
  local = memoryStorage();
  g.localStorage = local;
  session = memoryStorage();
  g.sessionStorage = session;
  vi.stubEnv("VITE_GITHUB_CLIENT_ID", "client");
  vi.stubEnv("VITE_OAUTH_WORKER_URL", WORKER_URL);
  vi.stubEnv("VITE_GITHUB_APP_SLUG", undefined);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(baseFetch);
  refreshResponse = () => jsonResponse({});
});

afterEach(() => {
  for (const ch of siblings.splice(0)) {
    ch.close();
  }
  delete g.localStorage;
  delete g.sessionStorage;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("recoverRejectedToken", () => {
  test("signed out: nothing to recover, no round trip", async () => {
    const { recoverRejectedToken } = await freshOAuth();
    expect(await recoverRejectedToken("ghu_notmine")).toEqual({ recovered: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a token a sibling already replaced answers the replacement without a refresh", async () => {
    seedCookieTab("ghu_fresh", Date.now() + 7_200_000);
    const { recoverRejectedToken } = await freshOAuth();
    expect(await recoverRejectedToken("ghu_dead")).toEqual({ recovered: true, token: "ghu_fresh" });
    expect(fetchCalls(`${WORKER_URL}/refresh`)).toHaveLength(0);
  });

  test("the current token 401ing forces a refresh despite a future recorded expiry", async () => {
    // The whole bug: the local clock says 7 h left, but the host revoked it.
    seedCookieTab("ghu_dead", Date.now() + 25_200_000);
    refreshResponse = () =>
      jsonResponse({ access_token: "ghu_renewed", expires_in: 28_800, refresh_token_cookie: true });
    const { recoverRejectedToken, isSignedIn } = await freshOAuth();

    expect(await recoverRejectedToken("ghu_dead")).toEqual({
      recovered: true,
      token: "ghu_renewed",
    });
    expect(isSignedIn()).toBe(true);
    expect(fetchCalls(`${WORKER_URL}/refresh`)).toHaveLength(1);
  });

  test("with no refresh path left the session ends and the run may go anonymous", async () => {
    session.map.set(TOKEN_KEY, "ghu_dead");
    session.map.set(TOKEN_EXPIRES_KEY, String(Date.now() + 7_200_000));
    // no cookie marker, no in-JS refresh token: nothing can renew this
    const { recoverRejectedToken, isSignedIn } = await freshOAuth();

    expect(await recoverRejectedToken("ghu_dead")).toEqual({ recovered: true, token: null });
    expect(isSignedIn()).toBe(false);
    expect(fetchCalls(`${WORKER_URL}/logout`)).toHaveLength(1);
  });
});

describe("token broadcast", () => {
  test("a cookie-mode refresh hands the replacement to sibling tabs", async () => {
    seedCookieTab("ghu_dead", 0);
    refreshResponse = () =>
      jsonResponse({ access_token: "ghu_renewed", expires_in: 28_800, refresh_token_cookie: true });
    const heard: unknown[] = [];
    siblingChannel().addEventListener("message", (event) => {
      heard.push((event as MessageEvent<unknown>).data);
    });
    const { getValidToken } = await freshOAuth();

    expect(await getValidToken()).toBe("ghu_renewed");
    await vi.waitFor(() => {
      expect(heard).toContainEqual(
        expect.objectContaining({ type: "token", token: "ghu_renewed" }),
      );
    });
  });

  test("a tab on the shared grant adopts a sibling's token", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 3_600_000));
    const { isSignedIn, getValidToken } = await freshOAuth();
    expect(isSignedIn()).toBe(false);

    siblingPosts({
      type: "token",
      token: "ghu_shared",
      tokenExpiresAt: Date.now() + 28_800_000,
    });
    await vi.waitFor(() => {
      expect(isSignedIn()).toBe(true);
    });
    expect(await getValidToken()).toBe("ghu_shared");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a tab with no session and no marker stays signed out", async () => {
    const { isSignedIn } = await freshOAuth();
    siblingPosts({
      type: "token",
      token: "ghu_shared",
      tokenExpiresAt: Date.now() + 28_800_000,
    });
    // deliver: the sibling's message has landed when its own echo would have
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(isSignedIn()).toBe(false);
  });

  test("a malformed broadcast token is refused (roadmap 030)", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 3_600_000));
    const { isSignedIn } = await freshOAuth();
    siblingPosts({
      type: "token",
      token: "bad\ntoken",
      tokenExpiresAt: Date.now() + 28_800_000,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(isSignedIn()).toBe(false);
  });

  test("a sibling's sign-out clears this tab without a second /logout", async () => {
    seedCookieTab("ghu_live", Date.now() + 7_200_000);
    const { isSignedIn } = await freshOAuth();
    expect(isSignedIn()).toBe(true);

    siblingPosts({ type: "signout" });
    await vi.waitFor(() => {
      expect(isSignedIn()).toBe(false);
    });
    expect(fetchCalls(`${WORKER_URL}/logout`)).toHaveLength(0);
  });
});

describe("refresh lock", () => {
  test("a tab that waited on the lock uses the sibling's token instead of the burned cookie", async () => {
    seedCookieTab("ghu_stale", 0);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A minimal LockManager: the sibling "holds" the lock until release().
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, task: () => Promise<unknown>) => {
          await gate;
          return task();
        },
      },
    });
    const { getValidToken } = await freshOAuth();

    const pending = getValidToken();
    // While this tab waits, the sibling finishes its refresh and broadcasts.
    siblingPosts({
      type: "token",
      token: "ghu_from_sibling",
      tokenExpiresAt: Date.now() + 28_800_000,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    release?.();

    expect(await pending).toBe("ghu_from_sibling");
    // The whole point: no second /refresh with the already-rotated cookie.
    expect(fetchCalls(`${WORKER_URL}/refresh`)).toHaveLength(0);
  });
});
