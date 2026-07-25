/**
 * Shimmed-project tests for fetchRepoConfig (roadmap 007 "Load from repo"),
 * with fetch stubbed — no live network. Covers the probe order, 404
 * fall-through, package.json `renovate` key handling, CORS abort and the
 * exhausted-search error.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRepoConfig, RepoConfigNotFoundError, setPresetAuth } from "../src/index";

const CONFIG_BODY = JSON.stringify({ extends: ["config:recommended"] });

function ok(body: string): Response {
  return new Response(body, { status: 200 });
}
function notFound(): Response {
  return new Response("not found", { status: 404 });
}
function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

afterEach(() => {
  vi.unstubAllGlobals();
  setPresetAuth({});
});

describe("fetchRepoConfig — github", () => {
  it("returns the first existing file (first-hit-wins order)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRepoConfig({ platform: "github", repo: "org/repo" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/org/repo/contents/renovate.json",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/vnd.github.raw+json" }),
      }),
    );
    expect(result.fileName).toBe("renovate.json");
    expect(result.content).toBe(CONFIG_BODY);
    expect(result.probed).toEqual(["renovate.json"]);
  });

  it("falls through 404s to a later candidate", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/contents/.github/renovate.json5")) {
        return Promise.resolve(ok(CONFIG_BODY));
      }
      return Promise.resolve(notFound());
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRepoConfig({ platform: "github", repo: "org/repo" });

    expect(result.fileName).toBe(".github/renovate.json5");
    expect(result.probed).toEqual([
      "renovate.json",
      "renovate.jsonc",
      "renovate.json5",
      ".github/renovate.json",
      ".github/renovate.jsonc",
      ".github/renovate.json5",
    ]);
  });

  it("treats an empty file as {}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok("")));
    const result = await fetchRepoConfig({ platform: "github", repo: "org/repo" });
    expect(result.content).toBe("{}");
  });

  it("passes an explicit ref through as ?ref=", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    await fetchRepoConfig({ platform: "github", repo: "org/repo", ref: "v2" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/org/repo/contents/renovate.json?ref=v2",
      expect.anything(),
    );
  });

  it("sends the github token as a bearer header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    setPresetAuth({ githubToken: "gh-token" });
    await fetchRepoConfig({ platform: "github", repo: "org/repo" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer gh-token" }),
      }),
    );
  });
});

describe("fetchRepoConfig — package.json renovate key", () => {
  function pkgOnly(body: string) {
    return vi.fn((url: string) => {
      if (url.endsWith("/contents/package.json")) {
        return Promise.resolve(ok(body));
      }
      return Promise.resolve(notFound());
    });
  }

  it("extracts an object value pretty-printed", async () => {
    const pkg = JSON.stringify({ name: "x", renovate: { extends: ["config:base"] } });
    vi.stubGlobal("fetch", pkgOnly(pkg));
    const result = await fetchRepoConfig({ platform: "github", repo: "org/repo" });
    expect(result.fileName).toBe("package.json");
    expect(result.content).toBe(JSON.stringify({ extends: ["config:base"] }, null, 2));
  });

  it("wraps a string value as { extends: [value] }", async () => {
    const pkg = JSON.stringify({ renovate: "github>org/shared" });
    vi.stubGlobal("fetch", pkgOnly(pkg));
    const result = await fetchRepoConfig({ platform: "github", repo: "org/repo" });
    expect(result.content).toBe(JSON.stringify({ extends: ["github>org/shared"] }, null, 2));
  });

  it("throws not-found when package.json has no renovate key", async () => {
    const pkg = JSON.stringify({ name: "x", version: "1.0.0" });
    vi.stubGlobal("fetch", pkgOnly(pkg));
    await expect(fetchRepoConfig({ platform: "github", repo: "org/repo" })).rejects.toBeInstanceOf(
      RepoConfigNotFoundError,
    );
  });
});

describe("fetchRepoConfig — errors", () => {
  it("aborts immediately on a CORS/network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    // ExternalHostError wraps the detail in `.err`.
    await expect(fetchRepoConfig({ platform: "github", repo: "org/repo" })).rejects.toMatchObject({
      err: { message: expect.stringMatching(/Could not reach/) },
    });
    // aborted after the very first probe rather than walking all 14
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts on a rate-limit / auth rejection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchRepoConfig({ platform: "github", repo: "org/repo" })).rejects.toMatchObject({
      err: { message: expect.stringMatching(/rate limit or missing token/) },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws RepoConfigNotFoundError listing every probed location", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFound()));
    await expect(fetchRepoConfig({ platform: "github", repo: "org/repo" })).rejects.toMatchObject({
      name: "RepoConfigNotFoundError",
      probed: expect.arrayContaining(["renovate.json", "package.json"]),
    });
  });
});

describe("fetchRepoConfig — gitlab", () => {
  it("resolves the default branch once, then probes raw files with that ref", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/projects/org%2Frepo")) {
        return Promise.resolve(ok(JSON.stringify({ default_branch: "main" })));
      }
      if (url.includes("/files/renovate.json/raw")) {
        return Promise.resolve(ok(CONFIG_BODY));
      }
      return Promise.resolve(notFound());
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRepoConfig({ platform: "gitlab", repo: "org/repo" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gitlab.com/api/v4/projects/org%2Frepo/repository/files/renovate.json/raw?ref=main",
      expect.objectContaining({ headers: expect.objectContaining({ accept: "application/json" }) }),
    );
    expect(result.fileName).toBe("renovate.json");
    expect(result.content).toBe(CONFIG_BODY);
  });
});

describe("fetchRepoConfig — gitea/forgejo", () => {
  it("decodes base64 contents from the gitea API", async () => {
    const body = JSON.stringify({ type: "file", encoding: "base64", content: base64(CONFIG_BODY) });
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/contents/renovate.json")) {
        return Promise.resolve(ok(body));
      }
      return Promise.resolve(notFound());
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRepoConfig({ platform: "gitea", repo: "org/repo" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gitea.com/api/v1/repos/org/repo/contents/renovate.json",
      expect.anything(),
    );
    expect(result.content).toBe(CONFIG_BODY);
  });
});

/**
 * Security 2026-07-25 — repo/path segments are percent-encoded before they
 * compose the request URL. The GitHub and Gitea/Forgejo transports used to
 * interpolate `repo` raw, so a `?`/`#` inside it could bolt a query string
 * onto the request and a `..` could climb out of the intended path (the URL
 * parser inside `fetch` resolves traversal segments). Well-formed slugs must
 * come out byte-for-byte unchanged — the suites above are the proof.
 */
describe("fetchRepoConfig — URL encoding of repo paths", () => {
  it("keeps a nested (subgroup-style) repo path readable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    await fetchRepoConfig({ platform: "github", repo: "org/sub/repo" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/org/sub/repo/contents/renovate.json",
      expect.anything(),
    );
  });

  it("encodes a query/fragment smuggled into a github repo path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    await fetchRepoConfig({ platform: "github", repo: "org/repo?ref=evil#x" });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe(
      "https://api.github.com/repos/org/repo%3Fref%3Devil%23x/contents/renovate.json",
    );
    // The whole thing really is one path segment: no query, no fragment.
    expect(new URL(url).search).toBe("");
    expect(new URL(url).hash).toBe("");
  });

  it("refuses a traversal segment rather than letting the URL parser resolve it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    // Encoding cannot help here: the URL parser treats "%2E" as a dot segment
    // too, so `…/repos/org/%2E%2E/%2E%2E/admin` would still collapse.
    await expect(fetchRepoConfig({ platform: "github", repo: "org/../../admin" })).rejects.toThrow(
      /traversal/i,
    );
    await expect(fetchRepoConfig({ platform: "gitea", repo: "org/../../admin" })).rejects.toThrow(
      /traversal/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
