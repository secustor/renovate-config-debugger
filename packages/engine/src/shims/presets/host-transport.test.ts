import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuthRefreshHandler, setPresetAuth } from "../../auth";
import {
  authHeadersFor,
  defaultEndpointFor,
  decodeBase64,
  giteaContentUrl,
  githubContentUrl,
  gitlabFileUrl,
  gitlabProjectUrl,
  hostFetch,
  PLATFORM_ENDPOINTS,
} from "./host-transport";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  setPresetAuth({});
  setAuthRefreshHandler(null);
  vi.restoreAllMocks();
});

function stubFetch(
  impl: (url?: unknown, init?: { headers?: Record<string, string> }) => Promise<Response>,
) {
  const mock = vi.fn(impl);
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

async function messageOf(request: Parameters<typeof hostFetch>[0]): Promise<string> {
  try {
    await hostFetch(request);
  } catch (err) {
    // ExternalHostError wraps the real detail in `.err`.
    return (err as { err: Error }).err.message;
  }
  throw new Error("expected hostFetch to throw");
}

/**
 * The two tails themselves live in `../../contracts` and cannot drift; what is
 * pinned here is the sentence the shim assembles around them — label, HTTP
 * status, shown endpoint, and where the tail sits in it.
 */
describe("hostFetch error messages (assembled shape)", () => {
  it("names the endpoint and the CORS cause when fetch() rejects", async () => {
    stubFetch(() => Promise.reject(new Error("Failed to fetch")));
    const message = await messageOf({
      platform: "github",
      url: "https://api.github.com/repos/a/b/contents/renovate.json",
      label: "GitHub",
      shownEndpoint: "https://api.github.com/",
      headers: {},
    });
    expect(message).toBe(
      "Could not reach the GitHub endpoint https://api.github.com/ from the browser — " +
        "likely missing CORS headers or a network block (Failed to fetch)",
    );
  });

  it("keeps the app's `rate limit or missing token` wording on 401/403/429", async () => {
    for (const status of [401, 403, 429]) {
      stubFetch(() => Promise.resolve(new Response("nope", { status })));
      const message = await messageOf({
        platform: "github",
        url: "https://api.github.com/x",
        label: "GitHub",
        shownEndpoint: "https://api.github.com/",
        headers: {},
      });
      expect(message).toBe(
        `GitHub API rejected the request (HTTP ${status}) — rate limit or missing token`,
      );
      // the fragment `packages/app/src/lib/github-failure.ts` matches on
      expect(/rate limit or missing token/i.test(message)).toBe(true);
    }
  });

  it("labels the repo-config probe's hosts by their bare platform id", async () => {
    stubFetch(() => Promise.resolve(new Response("nope", { status: 403 })));
    const message = await messageOf({
      platform: "gitea",
      url: "https://gitea.com/api/v1/repos/a/b/contents/renovate.json",
      label: "gitea",
      shownEndpoint: "https://gitea.com/",
      headers: {},
    });
    expect(message).toBe("gitea API rejected the request (HTTP 403) — rate limit or missing token");
  });

  it("carries the platform as the ExternalHostError's hostType", async () => {
    stubFetch(() => Promise.resolve(new Response("nope", { status: 429 })));
    await expect(
      hostFetch({
        platform: "gitlab",
        url: "https://gitlab.com/api/v4/x",
        label: "GitLab",
        shownEndpoint: "https://gitlab.com/api/v4/x",
        headers: {},
      }),
    ).rejects.toMatchObject({ hostType: "gitlab" });
  });

  it("returns any other response for the caller to classify", async () => {
    stubFetch(() => Promise.resolve(new Response("missing", { status: 404 })));
    const res = await hostFetch({
      platform: "github",
      url: "https://api.github.com/x",
      label: "GitHub",
      shownEndpoint: "https://api.github.com/",
      headers: {},
    });
    expect(res.status).toBe(404);
  });
});

/** A revoked-before-expiry token (another tab refreshed the shared grant):
 *  one recovery attempt through the registered handler, one retry, no loop. */
describe("hostFetch 401 recovery", () => {
  // Credentials are stated per test: `headers` is deliberately absent so a bare
  // spread won't typecheck.
  const request = {
    platform: "github" as const,
    url: "https://api.github.com/repos/a/b/contents/renovate.json",
    label: "GitHub",
    shownEndpoint: "https://api.github.com/",
  };

  /** One 401, then a 200; returns the `authorization` each attempt sent. */
  function stub401ThenOk(): Array<string | undefined> {
    const seen: Array<string | undefined> = [];
    stubFetch((_url, init) => {
      seen.push(init?.headers?.authorization);
      return Promise.resolve(
        seen.length === 1
          ? new Response("nope", { status: 401 })
          : new Response("{}", { status: 200 }),
      );
    });
    return seen;
  }

  it("retries once with the handler's replacement token and returns the 200", async () => {
    setPresetAuth({ githubToken: "revoked" });
    const seen = stub401ThenOk();
    const handler = vi.fn((_h: string, _u: string, rejected: string) => {
      expect(rejected).toBe("revoked");
      setPresetAuth({ githubToken: "fresh" });
      return Promise.resolve(true);
    });
    setAuthRefreshHandler(handler);

    const res = await hostFetch({
      ...request,
      headers: authHeadersFor("github", request.url),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual(["Bearer revoked", "Bearer fresh"]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("hands the handler the token the attempt actually sent, not the current state", async () => {
    setPresetAuth({ githubToken: "stale" });
    const headers = authHeadersFor("github", request.url);
    // A parallel request's recovery already replaced the state: the handler
    // must still be told about "stale" (what THIS request sent), never
    // "fresh" — reporting the live token as rejected would rotate it for
    // nothing.
    setPresetAuth({ githubToken: "fresh" });
    const seen = stub401ThenOk();
    const handler = vi.fn((_h: string, _u: string, rejected: string) => {
      expect(rejected).toBe("stale");
      return Promise.resolve(true);
    });
    setAuthRefreshHandler(handler);

    const res = await hostFetch({ ...request, headers });
    expect(res.status).toBe(200);
    expect(seen).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  it("retries anonymously when the handler dropped the dead token", async () => {
    setPresetAuth({ githubToken: "revoked" });
    const seen = stub401ThenOk();
    setAuthRefreshHandler(() => {
      setPresetAuth({});
      return Promise.resolve(true);
    });

    const res = await hostFetch({ ...request, headers: authHeadersFor("github", request.url) });
    expect(res.status).toBe(200);
    expect(seen).toEqual(["Bearer revoked", undefined]);
  });

  it("throws the standard error when the handler declines, without a retry", async () => {
    setPresetAuth({ githubToken: "revoked" });
    const fetchMock = stubFetch(() => Promise.resolve(new Response("nope", { status: 401 })));
    setAuthRefreshHandler(() => Promise.resolve(false));

    const message = await messageOf({ ...request, headers: authHeadersFor("github", request.url) });
    expect(message).toBe(
      "GitHub API rejected the request (HTTP 401) — rate limit or missing token",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries at most once even when the host keeps answering 401", async () => {
    setPresetAuth({ githubToken: "revoked" });
    const fetchMock = stubFetch(() => Promise.resolve(new Response("nope", { status: 401 })));
    const handler = vi.fn(() => {
      setPresetAuth({ githubToken: "fresh" });
      return Promise.resolve(true);
    });
    setAuthRefreshHandler(handler);

    await expect(
      hostFetch({ ...request, headers: authHeadersFor("github", request.url) }),
    ).rejects.toMatchObject({ hostType: "github" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("never consults the handler for an anonymous 401 or a 403", async () => {
    const handler = vi.fn(() => Promise.resolve(true));
    setAuthRefreshHandler(handler);
    stubFetch(() => Promise.resolve(new Response("nope", { status: 401 })));
    await expect(hostFetch({ ...request, headers: {} })).rejects.toBeTruthy();
    setPresetAuth({ githubToken: "t" });
    stubFetch(() => Promise.resolve(new Response("nope", { status: 403 })));
    await expect(
      hostFetch({ ...request, headers: authHeadersFor("github", request.url) }),
    ).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("treats a throwing handler as a decline", async () => {
    setPresetAuth({ githubToken: "revoked" });
    stubFetch(() => Promise.resolve(new Response("nope", { status: 401 })));
    setAuthRefreshHandler(() => Promise.reject(new Error("worker down")));
    const message = await messageOf({ ...request, headers: authHeadersFor("github", request.url) });
    expect(message).toContain("rate limit or missing token");
  });
});

describe("authHeadersFor", () => {
  it("uses each host's own accept header when no credential applies", () => {
    expect(authHeadersFor("github", "https://api.github.com/x")).toEqual({
      accept: "application/vnd.github.raw+json",
    });
    expect(authHeadersFor("gitlab", "https://gitlab.com/api/v4/x")).toEqual({
      accept: "application/json",
    });
    expect(authHeadersFor("forgejo", "https://codeberg.org/x")).toEqual({
      accept: "application/json",
    });
  });
});

describe("endpoint table", () => {
  it("is the one table the fetchers, the probe and the pipeline read", () => {
    expect(PLATFORM_ENDPOINTS).toEqual({
      github: "https://api.github.com/",
      gitlab: "https://gitlab.com/api/v4/",
      gitea: "https://gitea.com/",
      forgejo: "https://codeberg.org/",
    });
    expect(defaultEndpointFor("gitea")).toBe("https://gitea.com/");
    expect(defaultEndpointFor("bitbucket")).toBeUndefined();
  });
});

describe("content URL builders", () => {
  it("encodes the repo per segment and the ref as a query component", () => {
    expect(githubContentUrl("https://api.github.com/", "o r/repo", ".github/x.json", "v1/2")).toBe(
      "https://api.github.com/repos/o%20r/repo/contents/.github/x.json?ref=v1%2F2",
    );
    expect(giteaContentUrl("https://gitea.com/", "o/r", "a%2Fb.json")).toBe(
      "https://gitea.com/api/v1/repos/o/r/contents/a%2Fb.json",
    );
    expect(gitlabFileUrl("https://gitlab.com/api/v4/", "o/r", "a%2Fb.json", "main")).toBe(
      "https://gitlab.com/api/v4/projects/o%2Fr/repository/files/a%2Fb.json/raw?ref=main",
    );
    expect(gitlabProjectUrl("https://gitlab.com/api/v4/", "o/r")).toBe(
      "https://gitlab.com/api/v4/projects/o%2Fr",
    );
  });
});

describe("decodeBase64", () => {
  it("decodes UTF-8 through the browser primitives, whitespace included", () => {
    expect(decodeBase64("eyJhIjog\nIsOkIn0=")).toBe('{"a": "ä"}');
  });
});
