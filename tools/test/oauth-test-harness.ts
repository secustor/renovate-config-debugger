/**
 * The oauth.ts test harness: the in-memory storage doubles, the Worker/GitHub
 * fetch surface, the constants both suites address, and — through
 * `installOAuthHarness` — the module wiring itself. oauth.session.test.ts and
 * oauth.crosstab.test.ts stub the same module the same way, so one copy here
 * keeps their mocks from drifting apart when the Worker surface changes. It
 * lives under tools/test rather than in the app's src/ so test scaffolding can
 * never ride into the production build.
 */
import { afterEach, beforeEach, vi } from "vitest";

export const COOKIE_SESSION_KEY = "rcd.oauth.cookieSession";
export const WORKER_URL = "https://worker.example";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function memoryStorage(): StorageLike & { map: Map<string, string> } {
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

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The Worker + GitHub responses the oauth paths reach for. `refresh` (read
 *  per call, so a test may swap it mid-flight) decides what `POST /refresh`
 *  answers; everything else is fixed. */
function makeWorkerFetch(refresh: () => Response) {
  return function baseFetch(input: unknown, init?: RequestInit): Promise<Response> {
    const url = String(input);
    if (url === `${WORKER_URL}/refresh`) {
      return Promise.resolve(refresh());
    }
    if (url === `${WORKER_URL}/logout`) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url === "https://api.github.com/user") {
      return Promise.resolve(
        jsonResponse({ login: "octocat", avatar_url: "https://ex.test/a.png" }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${url} ${String(init?.method)}`));
  };
}

/**
 * Installs the whole module-level wiring both oauth suites need, and the
 * before/after hooks that keep it honest: fresh storages, the three env vars a
 * deployment with sign-in configured has (stubbed explicitly — vitest would
 * otherwise leak a developer's gitignored `.env`, as oauth.config.test.ts
 * documents), `fetch` stubbed to the Worker surface, and a `refreshResponse`
 * back at its default.
 *
 * Call it once at module scope; the returned handles stay valid across tests
 * (the storages are cleared, not replaced).
 */
export function installOAuthHarness() {
  const local = memoryStorage();
  const session = memoryStorage();
  const g = globalThis as { localStorage?: StorageLike; sessionStorage?: StorageLike };

  const defaultRefresh = () => jsonResponse({});
  let refresh: () => Response = defaultRefresh;
  const baseFetch = makeWorkerFetch(() => refresh());
  const fetchMock = vi.fn(baseFetch);

  beforeEach(() => {
    local.map.clear();
    session.map.clear();
    g.localStorage = local;
    g.sessionStorage = session;
    refresh = defaultRefresh;
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

  return {
    /** The tab's own two storages — cleared, never replaced, between tests. */
    local,
    session,
    fetchMock,
    /** The unstubbed Worker/GitHub surface, for a test that swaps in its own
     *  `fetch` for one path and wants the rest to keep answering. */
    baseFetch,
    /** What `POST /refresh` answers; the rest of the surface is fixed. */
    refreshResponse: () => refresh(),
    /** Swaps that answer for the remainder of the current test. */
    setRefreshResponse: (next: () => Response) => {
      refresh = next;
    },
    fetchCalls: (path: string) => fetchMock.mock.calls.filter(([input]) => String(input) === path),
    /**
     * A fresh module instance. Every test re-imports, because the restore, the
     * token, the single-flights and the channel are module-level state — a
     * session restored in one test must not read as "already signed in" in the
     * next.
     *
     * Arrow properties throughout, so a suite can destructure the harness
     * without tripping `typescript/unbound-method`.
     */
    freshOAuth: async () => {
      vi.resetModules();
      return import("@/platform/oauth");
    },
  };
}
