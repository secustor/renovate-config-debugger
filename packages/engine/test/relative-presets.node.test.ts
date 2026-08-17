/**
 * Golden project: relative preset references against the REAL renovate
 * modules. Every expectation lives in relative-presets.cases.ts, which the
 * shimmed project asserts against too — so this file is the reference and
 * `relative-presets.shimmed.test.ts` is the proof the browser module graph
 * reproduces it.
 *
 * No network: canonicalization is a pure rewrite that happens BEFORE any
 * preset is fetched, and a relative reference with no parent is refused
 * before the first request.
 */
import { describe, expect, it } from "vitest";
import { canonicalizeRelativePresets } from "renovate/dist/config/presets/relative.js";
import { parsePreset, resolveConfigPresets } from "../src/renovate-adapter";
import { must } from "./helpers";
import {
  CANONICALIZATION_CASES,
  CONTAINER_EXPECTED,
  CONTAINER_INPUT,
  PARENT,
  RELATIVE_NO_PARENT_TEXT,
} from "./relative-presets.cases";

/** Runs one entry through upstream's in-place rewrite and hands it back. */
function canonicalize(input: string, parent = PARENT): string {
  const value: { extends: string[] } = { extends: [input] };
  canonicalizeRelativePresets(value, parent);
  const [rewritten] = value.extends;
  return rewritten ?? "";
}

describe("relative preset canonicalization (real renovate)", () => {
  for (const { input, expected, why, parent } of CANONICALIZATION_CASES) {
    it(`${input} → ${expected} (${why})`, () => {
      expect(canonicalize(input, parent ?? PARENT)).toBe(expected);
    });
  }

  it("rewrites ignorePresets and nested packageRules extends, nothing else", () => {
    const value = structuredClone(CONTAINER_INPUT);
    canonicalizeRelativePresets(value, PARENT);
    expect(value).toEqual(CONTAINER_EXPECTED);
  });

  it("mutates the value in place rather than returning a copy", () => {
    // presets/index.js relies on this — it discards the return value.
    const value = { extends: ["./sibling"] };
    expect(canonicalizeRelativePresets(value, PARENT)).toBeUndefined();
    expect(value.extends).toEqual(["github>acme/presets//base/sibling"]);
  });
});

describe("what parsePreset makes of a relative reference", () => {
  it("reports the `relative` source with the path left in presetName", () => {
    expect(parsePreset("./sibling")).toEqual({
      presetSource: "relative",
      repo: "",
      presetName: "./sibling",
    });
  });

  it("splits params off a relative reference like any other preset", () => {
    expect(parsePreset("./tpl(weekly)")).toEqual({
      presetSource: "relative",
      repo: "",
      presetName: "./tpl",
      params: ["weekly"],
      rawParams: "weekly",
    });
  });

  it("round-trips the canonical tag+params form it produces", () => {
    // guards the odd `#tag(params)` ordering the rewrite emits
    expect(parsePreset("github>acme/presets//base/tpl#v2.0.0(weekly)")).toEqual({
      presetSource: "github",
      repo: "acme/presets",
      presetPath: "base",
      presetName: "tpl",
      tag: "v2.0.0",
      params: ["weekly"],
      rawParams: "weekly",
    });
  });
});

describe("a relative reference with no parent preset", () => {
  it("is refused before anything is fetched", async () => {
    // A repo config is not a preset, so `./x` has nothing to resolve against.
    await expect(resolveConfigPresets({ extends: ["./some/preset"] })).rejects.toThrow(
      "config-validation",
    );
  });

  it("explains why, naming the offending reference", async () => {
    const err = await resolveConfigPresets({ extends: ["./some/preset"] }).then(
      () => undefined,
      (thrown: unknown) => thrown as { validationError?: string },
    );
    const { validationError } = must(err, "a rejection");
    expect(validationError).toContain(RELATIVE_NO_PARENT_TEXT);
    expect(validationError).toContain("./some/preset");
  });
});
