import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  COOKIE_SESSION_KEY,
  jsonResponse,
  makeWorkerFetch,
  memoryStorage,
  type StorageLike,
  WORKER_URL,
} from "./oauth-test-harness";

/**
 * Roadmap 065 — the cookie-session half of oauth.ts: the localStorage marker
 * (the ONE thing that outlives the tab, and no secret), the silent boot
 * restore built on it, and sign-out's cookie teardown. The refresh token
 * itself is in an `HttpOnly` cookie, so nothing here can (or tries to) see
 * it — the browser's cookie jar is stubbed out entirely and the assertions
 * are about WHAT is requested: an empty `/refresh` body, `credentials:
 * "include"`, and exactly one round trip no matter how many callers.
 *
 * Every test re-imports the module (`vi.resetModules`) because the restore is
 * single-flight through module-level state, and a session restored in one
 * test must not read as "already signed in" in the next.
 */

const g = globalThis as { localStorage?: StorageLike; sessionStorage?: StorageLike };
let local = memoryStorage();
let session = memoryStorage();

/** What `POST /refresh` answers; the rest of the Worker/GitHub surface is
 *  fixed in the shared harness. */
let refreshResponse: () => Response = () => jsonResponse({});
const baseFetch = makeWorkerFetch(() => refreshResponse());

const fetchMock = vi.fn(baseFetch);

function fetchCalls(path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === path);
}

/** A fresh module instance, with the same env in force as a deployment that
 *  has sign-in configured (all three vars stubbed — vitest would otherwise
 *  leak a developer's gitignored `.env`, exactly as oauth.config.test.ts
 *  documents). */
async function freshOAuth() {
  vi.resetModules();
  return import("./oauth");
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
});

afterEach(() => {
  delete g.localStorage;
  delete g.sessionStorage;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("restoreSession", () => {
  test("no marker: answers null without a round trip", async () => {
    const { restoreSession, isSignedIn } = await freshOAuth();
    expect(await restoreSession()).toBeNull();
    expect(isSignedIn()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a hand-edited marker is dropped and reads as absent (roadmap 030)", async () => {
    local.map.set(COOKIE_SESSION_KEY, "tomorrow");
    const { restoreSession } = await freshOAuth();
    expect(await restoreSession()).toBeNull();
    expect(local.map.has(COOKIE_SESSION_KEY)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an expired marker is not probed", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() - 1000));
    const { restoreSession } = await freshOAuth();
    expect(await restoreSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a live marker restores through the cookie: empty body, credentials, new horizon", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
    refreshResponse = () =>
      jsonResponse({
        access_token: "gho_restored",
        expires_in: 28_800,
        refresh_token_cookie: true,
        refresh_token_expires_in: 15_552_000,
      });
    const { restoreSession, isSignedIn } = await freshOAuth();
    const user = await restoreSession();

    expect(user).toEqual({ login: "octocat", avatarUrl: "https://ex.test/a.png" });
    expect(isSignedIn()).toBe(true);
    const [, init] = fetchCalls(`${WORKER_URL}/refresh`)[0] ?? [];
    // The SPA has no copy of the refresh token to offer — the cookie is it.
    expect(init?.body).toBe("{}");
    expect(init?.credentials).toBe("include");
    // The rotated cookie's horizon replaces the old one, and it is STILL the
    // only oauth key in localStorage — no token followed it there.
    expect(Number(local.map.get(COOKIE_SESSION_KEY))).toBeGreaterThan(Date.now() + 15_000_000_000);
    expect([...local.map.keys()]).toEqual([COOKIE_SESSION_KEY]);
  });

  test("concurrent restores share ONE /refresh (StrictMode + GitHub's rotation)", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
    refreshResponse = () =>
      jsonResponse({ access_token: "gho_restored", refresh_token_cookie: true });
    const { restoreSession } = await freshOAuth();
    // The second call is the StrictMode remount: it must JOIN the first, not
    // post a cookie the first one already burned.
    const [first, second] = await Promise.all([restoreSession(), restoreSession()]);

    expect(first).toEqual(second);
    expect(fetchCalls(`${WORKER_URL}/refresh`)).toHaveLength(1);
  });

  test("a rejected cookie drops the marker and stays signed out", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
    refreshResponse = () => jsonResponse({ error: "bad_refresh_token" }, 400);
    const { restoreSession, isSignedIn } = await freshOAuth();

    expect(await restoreSession()).toBeNull();
    expect(isSignedIn()).toBe(false);
    expect(local.map.has(COOKIE_SESSION_KEY)).toBe(false);
  });

  test("an unreachable Worker keeps the marker for the next boot", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
    fetchMock.mockImplementation((input: unknown) =>
      String(input) === `${WORKER_URL}/refresh`
        ? Promise.reject(new TypeError("network down"))
        : baseFetch(input),
    );
    const { restoreSession, isSignedIn } = await freshOAuth();

    // This boot stays signed out — but a flaky-wifi boot says nothing about
    // the cookie, so the marker survives and the NEXT boot retries instead of
    // stranding a still-good session.
    expect(await restoreSession()).toBeNull();
    expect(isSignedIn()).toBe(false);
    expect(local.map.has(COOKIE_SESSION_KEY)).toBe(true);
  });

  test("a Worker 5xx (GitHub unreachable) keeps the marker too", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
    refreshResponse = () => jsonResponse({ error: "github_unreachable" }, 502);
    const { restoreSession } = await freshOAuth();

    expect(await restoreSession()).toBeNull();
    expect(local.map.has(COOKIE_SESSION_KEY)).toBe(true);
  });

  test("a failed profile fetch still leaves the session signed in", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
    refreshResponse = () =>
      jsonResponse({ access_token: "gho_restored", refresh_token_cookie: true });
    const { restoreSession, isSignedIn } = await freshOAuth();
    // The token round trip succeeds, the cosmetic profile fetch does not.
    fetchMock.mockImplementation((input: unknown) =>
      String(input) === `${WORKER_URL}/refresh`
        ? Promise.resolve(refreshResponse())
        : Promise.reject(new Error("profile unavailable")),
    );
    // …the chip is nameless, the session is not thrown away (the same
    // contract completeCallback's userPromise has).
    expect(await restoreSession()).toBeNull();
    expect(isSignedIn()).toBe(true);
  });
});

describe("getValidToken (cookie-session refresh)", () => {
  /** A signed-in cookie-mode session whose access token has already expired,
   *  so the next getValidToken() must go through the cookie refresh. */
  function seedExpiredCookieSession() {
    session.map.set("rcd.oauth.token", "gho_expired");
    session.map.set("rcd.oauth.tokenExpiresAt", String(Date.now() - 1000));
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
  }

  test("a transient refresh failure answers null but keeps the session", async () => {
    seedExpiredCookieSession();
    refreshResponse = () => jsonResponse({ error: "github_unreachable" }, 502);
    const { getValidToken, isSignedIn } = await freshOAuth();

    expect(await getValidToken()).toBeNull();
    // Not signed out: the cookie may be fine, and the next call retries.
    // Crucially NO /logout went out — with a reachable Worker behind an
    // unreachable GitHub it would burn the still-good cookie.
    expect(isSignedIn()).toBe(true);
    expect(local.map.has(COOKIE_SESSION_KEY)).toBe(true);
    expect(fetchCalls(`${WORKER_URL}/logout`)).toHaveLength(0);
  });

  test("a definitive rejection signs out: marker dropped, /logout fired", async () => {
    seedExpiredCookieSession();
    refreshResponse = () => jsonResponse({ error: "bad_refresh_token" }, 400);
    const { getValidToken, isSignedIn } = await freshOAuth();

    expect(await getValidToken()).toBeNull();
    expect(isSignedIn()).toBe(false);
    expect(local.map.has(COOKIE_SESSION_KEY)).toBe(false);
    expect(fetchCalls(`${WORKER_URL}/logout`)).toHaveLength(1);
  });
});

describe("signOut", () => {
  test("drops the marker and asks the Worker to clear the cookie", async () => {
    local.map.set(COOKIE_SESSION_KEY, String(Date.now() + 60_000));
    const { signOut } = await freshOAuth();
    expect(() => signOut()).not.toThrow();

    expect(local.map.has(COOKIE_SESSION_KEY)).toBe(false);
    const [, init] = fetchCalls(`${WORKER_URL}/logout`)[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
  });

  test("a failing /logout never surfaces (sign-out is synchronous and total)", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    const { signOut, isSignedIn } = await freshOAuth();
    expect(() => signOut()).not.toThrow();
    expect(isSignedIn()).toBe(false);
  });
});
