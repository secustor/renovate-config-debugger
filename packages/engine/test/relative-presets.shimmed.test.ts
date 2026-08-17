/**
 * Shimmed project: relative preset references through the exact module graph
 * the browser bundle uses, with fetch stubbed — no live network.
 *
 * Two things are proved here. First, that the canonicalization table in
 * relative-presets.cases.ts — derived from the real renovate modules by
 * relative-presets.node.test.ts — reproduces byte-for-byte once
 * `config/presets/relative.js` has been through the shim plugin. Second, that
 * the rewritten identities survive the rest of the run: the browser preset
 * transports fetch them, the trace records them, and they merge.
 *
 * The shim plugin deliberately does NOT shim `config/presets/index.js` (where
 * the rewrite is invoked) or `relative.js` itself; only the transports below
 * it are swapped. These tests are what keeps that true across renovate bumps.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalizeRelativePresets } from "renovate/dist/config/presets/relative.js";
import { runPipeline } from "../src/index";
import { must } from "./helpers";
import {
  CANONICALIZATION_CASES,
  CONTAINER_EXPECTED,
  CONTAINER_INPUT,
  PARENT,
  RELATIVE_NO_PARENT_MESSAGE,
  RELATIVE_NO_PARENT_TEXT,
} from "./relative-presets.cases";

/**
 * `acme/presets`, a repo whose presets reference each other relatively.
 * Keyed by the path the github contents API is asked for.
 */
const FILES: Record<string, unknown> = {
  "base/main.json": {
    extends: ["./sibling", "../top", "/rooted/thing", "./deeper/leaf"],
    labels: ["from-main"],
  },
  "base/sibling.json": { prHourlyLimit: 3 },
  "top.json": { rangeStrategy: "bump" },
  "rooted/thing.json": { timezone: "Europe/Vienna" },
  "base/deeper/leaf.json": { automerge: true },
  "base/params.json": { extends: ["./tpl(weekly)"] },
  "base/tpl.json": { schedule: ["{{arg0}}"] },
  "base/escaping.json": { extends: ["../../elsewhere"] },
};

/** Serves FILES over the github contents API shape; 404s everything else. */
function stubGithubRepo(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((rawUrl: string) => {
    const url = new URL(rawUrl);
    const path = url.pathname.replace("/repos/acme/presets/contents/", "");
    const body = FILES[path];
    return Promise.resolve(
      body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("not found", { status: 404 }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Every path the run asked the contents API for, in order. */
function requestedPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) =>
    new URL(call[0] as string).pathname.replace("/repos/acme/presets/contents/", ""),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canonicalization survives the shim plugin", () => {
  for (const { input, expected, why, parent } of CANONICALIZATION_CASES) {
    it(`${input} → ${expected} (${why})`, () => {
      const value: { extends: string[] } = { extends: [input] };
      canonicalizeRelativePresets(value, parent ?? PARENT);
      expect(value.extends[0]).toBe(expected);
    });
  }

  it("rewrites ignorePresets and nested packageRules extends, nothing else", () => {
    const value = structuredClone(CONTAINER_INPUT);
    canonicalizeRelativePresets(value, PARENT);
    expect(value).toEqual(CONTAINER_EXPECTED);
  });
});

describe("relative references resolve end to end", () => {
  it("fetches ./, ../ and / siblings and merges them all", async () => {
    const fetchMock = stubGithubRepo();

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>acme/presets//base/main"] }',
    });

    expect(result.stageStatus.preset).toBe("ok");
    // each relative form became a real request against the parent's repo
    expect(requestedPaths(fetchMock)).toEqual([
      "base/main.json",
      "base/sibling.json",
      "top.json",
      "rooted/thing.json",
      "base/deeper/leaf.json",
    ]);
    // …and every one of them contributed its option to the merged config
    expect(result.finalConfig?.prHourlyLimit).toBe(3);
    expect(result.finalConfig?.rangeStrategy).toBe("bump");
    expect(result.finalConfig?.timezone).toBe("Europe/Vienna");
    expect(result.finalConfig?.automerge).toBe(true);
    expect(result.finalConfig?.labels).toEqual(["from-main"]);
  });

  it("records the canonical identities in the preset tree", async () => {
    stubGithubRepo();

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>acme/presets//base/main"] }',
    });

    const parent = must(must(result.presetTree, "preset tree").children[0], "parent preset node");
    expect(parent.name).toBe("github>acme/presets//base/main");
    expect(parent.children.map((child) => child.name)).toEqual([
      "github>acme/presets//base/sibling",
      "github>acme/presets//top",
      "github>acme/presets//rooted/thing",
      "github>acme/presets//base/deeper/leaf",
    ]);
    // the rewrite is invisible to the transports: each child parses as an
    // ordinary github preset, path and all
    const sibling = must(parent.children[0], "sibling node");
    expect(sibling.source?.presetSource).toBe("github");
    expect(sibling.source?.repo).toBe("acme/presets");
    expect(sibling.source?.presetPath).toBe("base");
    expect(sibling.source?.presetName).toBe("sibling");
  });

  it("shows the body as authored, with the relative strings intact", async () => {
    stubGithubRepo();

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>acme/presets//base/main"] }',
    });

    // The trace must not lie about what the repo actually contains — the
    // canonical form is what the CHILDREN are named, not what the parent said.
    const parent = must(must(result.presetTree, "preset tree").children[0], "parent preset node");
    expect(parent.fetched).toMatchObject({
      extends: ["./sibling", "../top", "/rooted/thing", "./deeper/leaf"],
    });
  });

  it("carries preset parameters through the rewrite", async () => {
    stubGithubRepo();

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>acme/presets//base/params"] }',
    });

    expect(result.stageStatus.preset).toBe("ok");
    expect(result.finalConfig?.schedule).toEqual(["weekly"]);
  });

  it("inherits the parent's tag, fetching children at the same ref", async () => {
    const fetchMock = stubGithubRepo();

    await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>acme/presets//base/main#v2.0.0"] }',
    });

    const refs = fetchMock.mock.calls.map((call) => new URL(call[0] as string).search);
    expect(refs).toEqual(Array.from({ length: 5 }, () => "?ref=v2.0.0"));
  });
});

describe("relative references that cannot be resolved", () => {
  it("refuses one that would escape the repository, without fetching outside", async () => {
    const fetchMock = stubGithubRepo();

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["github>acme/presets//base/escaping"] }',
    });

    // upstream warns and keeps `../../elsewhere` as authored; it then has no
    // parent to resolve against and is refused — crucially WITHOUT any request
    // for a path outside the parent's repo
    expect(result.stageStatus.preset).toBe("error");
    expect(requestedPaths(fetchMock)).toEqual(["base/escaping.json"]);
    const presetError = must(
      result.events.find((event) => event.kind === "preset-error"),
      "preset-error event",
    );
    expect(presetError.title).toContain(RELATIVE_NO_PARENT_MESSAGE);
    expect(presetError.title).toContain("../../elsewhere");
    // contained like any other preset failure — the run still finishes
    expect(result.stageStatus.merge).toBe("ok");
    expect(result.finalConfig).toBeDefined();
  });

  it("refuses a relative reference written in the repo config itself", async () => {
    const fetchMock = stubGithubRepo();

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["./some/preset"] }',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.stageStatus.preset).toBe("error");
    expect(result.stageStatus.merge).toBe("ok");
    const presetError = must(
      result.events.find((event) => event.kind === "preset-error"),
      "preset-error event",
    );
    expect(presetError.title).toContain(RELATIVE_NO_PARENT_MESSAGE);
  });

  it("surfaces renovate's own explanation of the rules to the user", async () => {
    stubGithubRepo();

    const result = await runPipeline({
      fileName: "renovate.json",
      content: '{ "extends": ["./some/preset"] }',
    });

    // the short Error.message is for the trace; THIS is the sentence the app
    // puts in front of the user, and it names the offending reference
    const error = must(result.errors[0], "validation error");
    expect(error.topic).toContain(RELATIVE_NO_PARENT_TEXT);
    expect(error.topic).toContain("./some/preset");
    expect(error.topic).toContain("must stay inside their repository");
  });
});
