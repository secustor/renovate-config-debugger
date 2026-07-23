import { describe, expect, it } from "vitest";
import { applyFixToText } from "../src/error-fix-text";
import type { ErrorFixResult } from "../src/error-translations";

function valueFix(overrides: Partial<ErrorFixResult>): ErrorFixResult {
  return {
    path: [],
    before: undefined,
    after: undefined,
    summary: "test fix",
    fixedConfig: {},
    ...overrides,
  };
}

describe("applyFixToText — value replace (pattern 1: redundant */**)", () => {
  it("replaces a nested packageRules array in place, leaving the rest of the document untouched", () => {
    const text = [
      "{",
      '  "extends": ["config:recommended"],',
      '  "packageRules": [',
      '    { "matchDepTypes": ["devDependencies"] },',
      '    { "matchPackageNames": ["*", "!gradle"] }',
      "  ]",
      "}",
      "",
    ].join("\n");
    const fix = valueFix({
      path: ["packageRules", 1, "matchPackageNames"],
      value: ["!gradle"],
      fixedConfig: {},
    });
    const result = applyFixToText(text, fix);
    expect(result?.surgical).toBe(true);
    expect(result?.text).toContain('"matchPackageNames": ["!gradle"]');
    // untouched surroundings
    expect(result?.text).toContain('"extends": ["config:recommended"]');
    expect(result?.text).toContain('"matchDepTypes": ["devDependencies"]');
    expect(JSON.parse(result!.text)).toEqual({
      extends: ["config:recommended"],
      packageRules: [{ matchDepTypes: ["devDependencies"] }, { matchPackageNames: ["!gradle"] }],
    });
  });

  it("replaces a root-level array", () => {
    const text = '{\n  "matchPackageNames": ["**", "!gradle"]\n}\n';
    const fix = valueFix({
      path: ["matchPackageNames"],
      value: ["!gradle"],
      fixedConfig: {},
    });
    const result = applyFixToText(text, fix);
    expect(result?.surgical).toBe(true);
    expect(JSON.parse(result!.text)).toEqual({ matchPackageNames: ["!gradle"] });
  });

  it("tolerates // and /* */ comments (json5) while locating the path", () => {
    const text = [
      "{",
      "  // top comment",
      '  "packageRules": [',
      "    /* rule 0 */",
      '    { "matchPackageNames": ["*", "!gradle"] } // trailing',
      "  ]",
      "}",
    ].join("\n");
    const fix = valueFix({
      path: ["packageRules", 0, "matchPackageNames"],
      value: ["!gradle"],
      fixedConfig: {},
    });
    const result = applyFixToText(text, fix);
    expect(result?.surgical).toBe(true);
    expect(result?.text).toContain('"matchPackageNames": ["!gradle"]');
    expect(result?.text).toContain("// top comment");
  });
});

describe("applyFixToText — rename (pattern 2: deprecated option)", () => {
  it("renames only the key token, keeping the value and formatting", () => {
    const text = '{\n  "versionScheme": "semver",\n  "rangeStrategy": "auto"\n}\n';
    const fix = valueFix({
      path: ["versionScheme"],
      renameTo: "versioning",
      fixedConfig: {},
    });
    const result = applyFixToText(text, fix);
    expect(result?.surgical).toBe(true);
    expect(JSON.parse(result!.text)).toEqual({ versioning: "semver", rangeStrategy: "auto" });
  });
});

describe("applyFixToText — remove (pattern 3: global-only option)", () => {
  it("removes the sole property in an object", () => {
    const text = '{\n  "token": "abc"\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = applyFixToText(text, fix);
    expect(result?.surgical).toBe(true);
    expect(JSON.parse(result!.text)).toEqual({});
  });

  it("removes the first of several properties, keeping the rest valid", () => {
    const text = '{\n  "token": "abc",\n  "extends": ["config:recommended"]\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = applyFixToText(text, fix);
    expect(JSON.parse(result!.text)).toEqual({ extends: ["config:recommended"] });
  });

  it("removes the last of several properties without leaving a dangling comma", () => {
    const text = '{\n  "extends": ["config:recommended"],\n  "token": "abc"\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = applyFixToText(text, fix);
    expect(JSON.parse(result!.text)).toEqual({ extends: ["config:recommended"] });
  });

  it("removes a middle property", () => {
    const text = '{\n  "a": 1,\n  "token": "abc",\n  "b": 2\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = applyFixToText(text, fix);
    expect(JSON.parse(result!.text)).toEqual({ a: 1, b: 2 });
  });

  it("removes a compact single-line object member", () => {
    const text = '{ "a": 1, "token": "abc", "b": 2 }';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = applyFixToText(text, fix);
    expect(JSON.parse(result!.text)).toEqual({ a: 1, b: 2 });
  });
});

describe("applyFixToText — fallback when the path can't be located", () => {
  it("falls back to re-serializing fixedConfig when the key uses an unsupported style (single-quoted)", () => {
    const text = "{ 'token': 'abc' }"; // valid JSON5, not the supported double-quoted-key convention
    const fix = valueFix({
      path: ["token"],
      remove: true,
      fixedConfig: { other: true },
    });
    const result = applyFixToText(text, fix);
    expect(result?.surgical).toBe(false);
    expect(JSON.parse(result!.text)).toEqual({ other: true });
  });

  it("falls back when the path segment doesn't exist in this text at all", () => {
    const text = '{\n  "extends": ["config:recommended"]\n}\n';
    const fix = valueFix({
      path: ["packageRules", 0, "matchPackageNames"],
      value: ["!gradle"],
      fixedConfig: { extends: ["config:recommended"] },
    });
    const result = applyFixToText(text, fix);
    expect(result?.surgical).toBe(false);
    expect(JSON.parse(result!.text)).toEqual({ extends: ["config:recommended"] });
  });
});
