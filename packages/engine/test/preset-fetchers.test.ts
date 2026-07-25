/**
 * Shimmed-project tests for the browser preset fetchers, with fetch stubbed —
 * no live network. Exercises the full runPipeline path so preset fetching,
 * recursion, and error containment are covered together.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { presetInjectionKey, runPipeline, setPresetAuth } from "../src/index";

const GITHUB_PRESET_BODY = JSON.stringify({
  labels: ["from-github-preset"],
  rangeStrategy: "bump",
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPresetAuth({});
});

describe("github preset fetcher", () => {
  it("resolves a github-hosted preset via the contents API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(GITHUB_PRESET_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/renovate-config"] }',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/example-org/renovate-config/contents/default.json",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/vnd.github.raw+json" }),
      }),
    );
    expect(result.stageStatus.preset).toBe("ok");
    expect(result.finalConfig?.labels).toEqual(["from-github-preset"]);
    expect(result.finalConfig?.rangeStrategy).toBe("bump");
    expect(result.visitedPresets.merged).toContain("github>example-org/renovate-config");
  });

  it("sends the configured token as a bearer header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(GITHUB_PRESET_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setPresetAuth({ githubToken: "test-token" });

    await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/renovate-config"] }',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-token" }),
      }),
    );
  });

  it("surfaces rate limiting as a contained preset error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 403 })),
    );

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/renovate-config"] }',
    });

    expect(result.stageStatus.preset).toBe("error");
    expect(result.stageStatus.merge).toBe("ok");
    expect(result.events.some((e) => e.kind === "preset-error")).toBe(true);
  });

  it("falls back from default.json to renovate.json like renovate does", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response(GITHUB_PRESET_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/renovate-config"] }',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/contents/renovate.json"),
      expect.anything(),
    );
    expect(result.finalConfig?.labels).toEqual(["from-github-preset"]);
  });
});

describe("migration steps during preset fetch", () => {
  it("emits preset-stage migration steps tagged with the preset name", async () => {
    // Renovate migrates every preset on fetch; a preset carrying a deprecated
    // option therefore produces migration-applied events during the preset
    // stage, tagged with the preset they belong to.
    const legacyPreset = JSON.stringify({ versionScheme: "semver", labels: ["x"] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(legacyPreset, { status: 200 })));

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/renovate-config"] }',
    });

    const presetSteps = result.events.filter(
      (e) => e.kind === "migration-applied" && e.stage === "preset",
    );
    expect(presetSteps.length).toBeGreaterThan(0);
    const rename = presetSteps.find((s) => s.migration?.key === "versionScheme");
    expect(rename?.migration?.newKey).toBe("versioning");
    expect(rename?.migration?.presetName).toBe("github>example-org/renovate-config");
    expect(rename?.delta?.length).toBeGreaterThan(0);
  });
});

describe("npm preset fetcher", () => {
  it("resolves renovate-config from the latest packument version", async () => {
    const packument = {
      "dist-tags": { latest: "2.0.0" },
      versions: {
        "2.0.0": { "renovate-config": { default: { labels: ["from-npm-preset"] } } },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(packument), { status: 200 })),
    );

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["npm>my-shared-config"] }',
    });

    expect(result.stageStatus.preset).toBe("ok");
    expect(result.finalConfig?.labels).toEqual(["from-npm-preset"]);
  });
});

const PRESET_BODY = JSON.stringify({ labels: ["from-preset"], rangeStrategy: "bump" });

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

describe("gitlab preset fetcher", () => {
  it("resolves the default branch then the raw file, sending PRIVATE-TOKEN", async () => {
    setPresetAuth({ gitlabToken: "gl-token" });
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/projects/example-org%2Frenovate-config")) {
        return Promise.resolve(
          new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(PRESET_BODY, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["gitlab>example-org/renovate-config"] }',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gitlab.com/api/v4/projects/example-org%2Frenovate-config/repository/files/default.json/raw?ref=main",
      expect.objectContaining({
        headers: expect.objectContaining({ "PRIVATE-TOKEN": "gl-token" }),
      }),
    );
    expect(result.stageStatus.preset).toBe("ok");
    expect(result.finalConfig?.labels).toEqual(["from-preset"]);
  });
});

describe("gitea/forgejo preset fetchers", () => {
  it("fetches from the gitea contents API and decodes base64", async () => {
    const body = JSON.stringify({ type: "file", encoding: "base64", content: base64(PRESET_BODY) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["gitea>example-org/renovate-config"] }',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gitea.com/api/v1/repos/example-org/renovate-config/contents/default.json",
      expect.objectContaining({ headers: expect.objectContaining({ accept: "application/json" }) }),
    );
    expect(result.stageStatus.preset).toBe("ok");
    expect(result.finalConfig?.labels).toEqual(["from-preset"]);
  });

  it("fetches forgejo presets from codeberg.org with a token header", async () => {
    setPresetAuth({ forgejoToken: "fj-token" });
    const body = JSON.stringify({ type: "file", encoding: "base64", content: base64(PRESET_BODY) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["forgejo>example-org/renovate-config"] }',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://codeberg.org/api/v1/repos/example-org/renovate-config/contents/default.json",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "token fj-token" }),
      }),
    );
    expect(result.finalConfig?.labels).toEqual(["from-preset"]);
  });
});

describe("local> dispatch via platform context", () => {
  it("resolves local> against the configured gitlab platform", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/projects/example-org%2Frepo") && !url.includes("/files/")) {
        return Promise.resolve(
          new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(PRESET_BODY, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["local>example-org/repo"] }',
      platform: "gitlab",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://gitlab.com/api/v4/projects/example-org%2Frepo/repository/files/default.json/raw",
      ),
      expect.anything(),
    );
    expect(result.stageStatus.preset).toBe("ok");
    expect(result.finalConfig?.labels).toEqual(["from-preset"]);
    // trace records which platform the local node resolved against
    const localNode = result.presetTree?.children[0];
    expect(localNode?.source?.platform).toBe("gitlab");
    expect(localNode?.source?.endpoint).toBe("https://gitlab.com/api/v4/");
  });

  it("gives an honest per-platform message for run-only platforms", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["local>example-org/repo"] }',
      platform: "bitbucket",
    });
    expect(result.stageStatus.preset).toBe("error");
    expect(result.stageStatus.merge).toBe("ok");
    const presetError = result.events.find((e) => e.kind === "preset-error");
    expect(presetError?.title).toContain("only reachable via a real Renovate run");
  });

  it("reports platforms that cannot serve local presets", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["local>example-org/repo"] }',
      platform: "codecommit",
    });
    expect(result.stageStatus.preset).toBe("error");
    const presetError = result.events.find((e) => e.kind === "preset-error");
    expect(presetError?.title).toContain("does not support local presets");
  });
});

describe("manual preset injection", () => {
  it("serves injected content without fetching and flags the used key", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network blocked"));
    vi.stubGlobal("fetch", fetchMock);
    const key = presetInjectionKey({ presetSource: "gitlab", repo: "some-org/repo" });

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["gitlab>some-org/repo"] }',
      injectedPresets: { [key]: { labels: ["from-injection"] } },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.stageStatus.preset).toBe("ok");
    expect(result.finalConfig?.labels).toEqual(["from-injection"]);
    expect(result.usedInjections).toContain(key);
  });
});

/**
 * Security 2026-07-25 — a preset's repo/path/tag come straight from the
 * config's `extends` string. Renovate's own preset grammar allows `.`, `/` and
 * `%` inside a repo (and `.`/`/` inside a tag), so the raw interpolation these
 * transports used could smuggle a path separator or a traversal segment into
 * the URL — with the user's token attached. Well-formed presets must be
 * byte-for-byte unchanged.
 */
describe("preset fetcher URL encoding", () => {
  it("keeps a well-formed repo and tag byte-for-byte in the github preset URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(GITHUB_PRESET_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/renovate-config#v1.2.3"] }',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/example-org/renovate-config/contents/default.json?ref=v1.2.3",
      expect.anything(),
    );
  });

  it("encodes a percent-escape smuggled into a github preset repo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(GITHUB_PRESET_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // `%2F` would otherwise reach the server as a path separator.
    await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/re%2Fpo"] }',
    });

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://api.github.com/repos/example-org/re%252Fpo/contents/default.json");
    expect(new URL(url).pathname).toBe("/repos/example-org/re%252Fpo/contents/default.json");
  });

  it("encodes a percent-escape smuggled into a gitea preset repo", async () => {
    const body = JSON.stringify({ type: "file", encoding: "base64", content: base64(PRESET_BODY) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["gitea>example-org/re%2Fpo"] }',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gitea.com/api/v1/repos/example-org/re%252Fpo/contents/default.json",
    );
  });

  it("refuses a traversal segment in a preset repo without ever fetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(GITHUB_PRESET_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>example-org/../../admin"] }',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    // Contained like any other preset failure — the run still finishes.
    expect(result.stageStatus.merge).toBe("ok");
    expect(result.finalConfig).toBeDefined();
  });
});
