/**
 * Shimmed-project tests for the browser preset fetchers, with fetch stubbed —
 * no live network. Exercises the full runPipeline path so preset fetching,
 * recursion, and error containment are covered together.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPipeline, setPresetAuth } from "../src/index";

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

describe("unsupported sources", () => {
  it("reports gitlab presets as unsupported without killing the run", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["gitlab>some-org/renovate-config"] }',
    });

    expect(result.stageStatus.preset).toBe("error");
    expect(result.stageStatus.merge).toBe("ok");
    const presetError = result.events.find((e) => e.kind === "preset-error");
    expect(presetError?.title).toContain("not supported in the browser");
  });
});
