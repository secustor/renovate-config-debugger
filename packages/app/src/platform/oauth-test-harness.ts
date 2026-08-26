/**
 * The shared half of the oauth.ts test harnesses: the in-memory storage
 * doubles, the Worker/GitHub fetch surface, and the constants both suites
 * address. oauth.session.test.ts and oauth.crosstab.test.ts stub the same
 * module the same way — one copy here keeps their mocks from drifting apart
 * when the Worker surface changes.
 */

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
export function makeWorkerFetch(refresh: () => Response) {
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
