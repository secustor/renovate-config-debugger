import { afterEach, describe, expect, test, vi } from "vitest";
import {
  COOKIE_SESSION_KEY,
  installOAuthHarness,
  jsonResponse,
  WORKER_URL,
} from "@tools/test/oauth-test-harness";

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

const TOKEN_KEY = "rcd.oauth.token";
const TOKEN_EXPIRES_KEY = "rcd.oauth.tokenExpiresAt";
const REFRESH_TOKEN_KEY = "rcd.oauth.refreshToken";

const { local, session, fetchMock, fetchCalls, freshOAuth, setRefreshResponse } =
  installOAuthHarness();

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

afterEach(() => {
  for (const ch of siblings.splice(0)) {
    ch.close();
  }
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
    setRefreshResponse(() =>
      jsonResponse({ access_token: "ghu_renewed", expires_in: 28_800, refresh_token_cookie: true }),
    );
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
    setRefreshResponse(() =>
      jsonResponse({ access_token: "ghu_renewed", expires_in: 28_800, refresh_token_cookie: true }),
    );
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

  test("a sibling's sign-out leaves an independent in-JS (009) grant alone", async () => {
    // No cookie marker, an own refresh token: this tab's grant is nobody
    // else's to tear down.
    session.map.set(TOKEN_KEY, "ghu_mine");
    session.map.set(TOKEN_EXPIRES_KEY, String(Date.now() + 7_200_000));
    session.map.set(REFRESH_TOKEN_KEY, "ghr_mine");
    const { isSignedIn } = await freshOAuth();
    expect(isSignedIn()).toBe(true);

    siblingPosts({ type: "signout" });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(isSignedIn()).toBe(true);
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

  test("a lock manager that refuses does not wedge the refresh single-flight", async () => {
    seedCookieTab("ghu_stale", 0);
    setRefreshResponse(() =>
      jsonResponse({ access_token: "ghu_renewed", expires_in: 28_800, refresh_token_cookie: true }),
    );
    vi.stubGlobal("navigator", {
      locks: {
        request: () => Promise.reject(new Error("document is not fully active")),
      },
    });
    const { getValidToken } = await freshOAuth();

    // The refresh still runs (unserialized), and the in-flight slot clears.
    expect(await getValidToken()).toBe("ghu_renewed");
    expect(await getValidToken()).toBe("ghu_renewed");
    expect(fetchCalls(`${WORKER_URL}/refresh`)).toHaveLength(1);
  });
});
