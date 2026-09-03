/**
 * Shimmed-project tests for fetchRepoConfig (roadmap 007 "Load from repo") and
 * fetchRepoFile (roadmap 045, the inherited-config probe's single-file fetch),
 * with fetch stubbed — no live network. Covers the probe order, 404
 * fall-through, package.json `renovate` key handling, CORS abort, the
 * exhausted-search error, and the single-file variant's absent/refused split.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractPackageJsonConfig,
  fetchRepoConfig,
  fetchRepoFile,
  RepoConfigNotFoundError,
  setPresetAuth,
} from "../src/index";

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
    // Encoding cannot help: the parser treats "%2E" as a dot segment too.
    expect(new URL("https://h/repos/org/%2E%2E/%2E%2E/admin").pathname).toBe("/admin");
    await expect(fetchRepoConfig({ platform: "github", repo: "org/../../admin" })).rejects.toThrow(
      /traversal/i,
    );
    await expect(fetchRepoConfig({ platform: "gitea", repo: "org/../../admin" })).rejects.toThrow(
      /traversal/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Roadmap 045 — the single-file fetch the inherited-config probe rides on. One
 * request, no candidate chain, null for an absent file; the transport, auth and
 * URL-hardening behavior is the config probe's, unchanged.
 */
describe("fetchRepoFile", () => {
  it("fetches exactly one file and returns its text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const raw = await fetchRepoFile({
      platform: "github",
      repo: "org/renovate-config",
      path: "org-inherited-config.json",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/org/renovate-config/contents/org-inherited-config.json",
      expect.anything(),
    );
    expect(raw).toBe(CONFIG_BODY);
  });

  it("returns null for an absent file instead of throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFound());
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchRepoFile({ platform: "github", repo: "org/renovate-config", path: "missing.json" }),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still throws for a refused request — that is not an absent file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 403 })));
    // ExternalHostError wraps the detail in `.err`, as above.
    await expect(
      fetchRepoFile({ platform: "github", repo: "org/renovate-config", path: "cfg.json" }),
    ).rejects.toMatchObject({
      err: { message: expect.stringMatching(/rate limit or missing token/) },
    });
  });

  it("carries the host token, like the config probe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    setPresetAuth({ githubToken: "gh-token" });
    await fetchRepoFile({ platform: "github", repo: "org/renovate-config", path: "cfg.json" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer gh-token" }),
      }),
    );
  });

  it("resolves GitLab's default branch for its raw endpoint", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/projects/org%2Frenovate-config")) {
        return Promise.resolve(ok(JSON.stringify({ default_branch: "main" })));
      }
      return Promise.resolve(ok(CONFIG_BODY));
    });
    vi.stubGlobal("fetch", fetchMock);

    const raw = await fetchRepoFile({
      platform: "gitlab",
      repo: "org/renovate-config",
      path: "org-inherited-config.json",
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://gitlab.com/api/v4/projects/org%2Frenovate-config/repository/files/org-inherited-config.json/raw?ref=main",
      expect.anything(),
    );
    expect(raw).toBe(CONFIG_BODY);
  });

  it("percent-encodes the repo AND the file path it is handed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    await fetchRepoFile({
      platform: "github",
      repo: "org/cfg?x=1",
      path: "dir/cfg.json?ref=evil#f",
    });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe(
      "https://api.github.com/repos/org/cfg%3Fx%3D1/contents/dir/cfg.json%3Fref%3Devil%23f",
    );
    expect(new URL(url).search).toBe("");
    expect(new URL(url).hash).toBe("");
  });

  it("refuses a traversal segment in the file path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(CONFIG_BODY));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchRepoFile({ platform: "github", repo: "org/cfg", path: "../../etc/passwd" }),
    ).rejects.toThrow(/traversal/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * `extractPackageJsonConfig` directly: `fetchRepoConfig` above exercises it
 * through the probe, but the app reaches it as a function of its own (a pasted
 * `…/blob/main/package.json` reference is one file, not a discovery walk), so
 * the value-shape rules are pinned here rather than only via the transport.
 */
describe("extractPackageJsonConfig", () => {
  it("pretty-prints an object value", () => {
    expect(extractPackageJsonConfig('{"renovate":{"automerge":true}}')).toBe(
      JSON.stringify({ automerge: true }, null, 2),
    );
  });

  it("expands a string value into Renovate's extends shorthand", () => {
    expect(extractPackageJsonConfig('{"renovate":"config:recommended"}')).toBe(
      JSON.stringify({ extends: ["config:recommended"] }, null, 2),
    );
  });

  // The array branch is deliberate (see repo-config.ts): an array `renovate`
  // key is invalid config, but re-serializing it is how the caller's validator
  // gets to say so — and how the repo-picker badge still reads "has a config".
  it("re-serializes an array value instead of dropping it", () => {
    expect(extractPackageJsonConfig('{"renovate":["config:recommended"]}')).toBe(
      JSON.stringify(["config:recommended"], null, 2),
    );
  });

  it("returns null for a missing key, a scalar value, or unparseable JSON", () => {
    expect(extractPackageJsonConfig('{"name":"x"}')).toBeNull();
    expect(extractPackageJsonConfig('{"renovate":5}')).toBeNull();
    expect(extractPackageJsonConfig("not json")).toBeNull();
  });
});
