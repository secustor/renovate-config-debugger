import { describe, expect, it } from "vitest";
import { applyFixToText } from "../src/error-fix-text";
import type { ErrorFixResult } from "../src/error-translations";
import { must } from "./helpers";

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
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    expect(result.text).toContain('"matchPackageNames": ["!gradle"]');
    // untouched surroundings
    expect(result.text).toContain('"extends": ["config:recommended"]');
    expect(result.text).toContain('"matchDepTypes": ["devDependencies"]');
    expect(JSON.parse(result.text)).toEqual({
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
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    expect(JSON.parse(result.text)).toEqual({ matchPackageNames: ["!gradle"] });
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
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    expect(JSON.parse(result.text)).toEqual({ versioning: "semver", rangeStrategy: "auto" });
  });
});

describe("applyFixToText — remove (pattern 3: global-only option)", () => {
  it("removes the sole property in an object", () => {
    const text = '{\n  "token": "abc"\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    expect(JSON.parse(result.text)).toEqual({});
  });

  it("removes the first of several properties, keeping the rest valid", () => {
    const text = '{\n  "token": "abc",\n  "extends": ["config:recommended"]\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(JSON.parse(result.text)).toEqual({ extends: ["config:recommended"] });
  });

  it("removes the last of several properties without leaving a dangling comma", () => {
    const text = '{\n  "extends": ["config:recommended"],\n  "token": "abc"\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(JSON.parse(result.text)).toEqual({ extends: ["config:recommended"] });
  });

  it("removes a middle property", () => {
    const text = '{\n  "a": 1,\n  "token": "abc",\n  "b": 2\n}\n';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(JSON.parse(result.text)).toEqual({ a: 1, b: 2 });
  });

  it("removes a compact single-line object member", () => {
    const text = '{ "a": 1, "token": "abc", "b": 2 }';
    const fix = valueFix({ path: ["token"], remove: true, fixedConfig: {} });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(JSON.parse(result.text)).toEqual({ a: 1, b: 2 });
  });
});

/**
 * The `group:`-preset fix (pattern 4) replaces a WHOLE `packageRules` entry,
 * so its path ends on an array index. That used to be the one shape the
 * locator refused, which sent every such fix through the whole-document
 * re-serialization — reflowing the siblings and dropping every comment to
 * change one rule. An index locates an element as well as a key locates a
 * member; the only thing an index cannot do is be renamed.
 */
describe("applyFixToText — array element (pattern 4: group: preset in a rule)", () => {
  const GROUPED_RULE = {
    extends: ["monorepo:jest"],
    groupName: "jest monorepo",
    automerge: true,
  };

  it("replaces one rule in place, leaving the siblings, the comments and the rest verbatim", () => {
    const text = [
      "{",
      "  // keep these presets",
      '  "extends": ["config:recommended"],',
      '  "packageRules": [',
      '    { "matchDepTypes": ["devDependencies"], "automerge": true },',
      '    { "extends": ["group:jestMonorepo"], "automerge": true } // the bad one',
      "  ]",
      "}",
      "",
    ].join("\n");
    const fix = valueFix({ path: ["packageRules", 1], value: GROUPED_RULE });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    expect(result.text).toContain(
      '{"extends":["monorepo:jest"],"groupName":"jest monorepo","automerge":true}',
    );
    // Everything the fix did not name survives byte for byte.
    expect(result.text).toContain("  // keep these presets");
    expect(result.text).toContain('  "extends": ["config:recommended"],');
    expect(result.text).toContain(
      '    { "matchDepTypes": ["devDependencies"], "automerge": true },',
    );
    expect(result.text).toContain("// the bad one");
    expect(result.text).not.toContain("group:jestMonorepo");
  });

  it("re-indents a pretty-printed replacement when the element it replaces spans lines", () => {
    const text = [
      "{",
      '  "packageRules": [',
      '    { "matchDepTypes": ["devDependencies"] },',
      "    {",
      '      "extends": ["group:jestMonorepo"],',
      '      "automerge": true',
      "    }",
      "  ]",
      "}",
      "",
    ].join("\n");
    const fix = valueFix({ path: ["packageRules", 1], value: GROUPED_RULE });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    // Every continuation line hangs off the element's own column, not column 0.
    expect(result.text).toContain('\n      "groupName": "jest monorepo",');
    expect(result.text).toContain("\n    }\n  ]");
    expect(result.text).not.toContain("\n}\n  ]");
    expect(JSON.parse(result.text)).toEqual({
      packageRules: [{ matchDepTypes: ["devDependencies"] }, GROUPED_RULE],
    });
  });

  it("removes an array element and its comma, keeping the siblings", () => {
    const text = [
      "{",
      '  "packageRules": [',
      '    { "matchDepTypes": ["devDependencies"] },',
      '    { "extends": ["group:jestMonorepo"] }',
      "  ]",
      "}",
      "",
    ].join("\n");
    const fix = valueFix({ path: ["packageRules", 1], remove: true });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    expect(JSON.parse(result.text)).toEqual({
      packageRules: [{ matchDepTypes: ["devDependencies"] }],
    });
  });

  it("removes the FIRST array element without leaving a leading comma", () => {
    const text = [
      "{",
      '  "packageRules": [',
      '    { "extends": ["group:jestMonorepo"] },',
      '    { "matchDepTypes": ["devDependencies"] }',
      "  ]",
      "}",
      "",
    ].join("\n");
    const fix = valueFix({ path: ["packageRules", 0], remove: true });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(true);
    expect(JSON.parse(result.text)).toEqual({
      packageRules: [{ matchDepTypes: ["devDependencies"] }],
    });
  });

  it("still falls back when the index is past the end of the array", () => {
    const text = '{\n  "packageRules": [\n    { "automerge": true }\n  ]\n}\n';
    const fix = valueFix({
      path: ["packageRules", 7],
      value: GROUPED_RULE,
      fixedConfig: { packageRules: [{ automerge: true }] },
    });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ packageRules: [{ automerge: true }] });
  });

  it("declines to rename an index — there is no key — and rewrites the document instead", () => {
    const text = '{\n  "packageRules": [\n    { "automerge": true }\n  ]\n}\n';
    const fix = valueFix({
      path: ["packageRules", 0],
      renameTo: "nonsense",
      fixedConfig: { packageRules: [{ automerge: true }] },
    });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ packageRules: [{ automerge: true }] });
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
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ other: true });
  });

  it("falls back when the path segment doesn't exist in this text at all", () => {
    const text = '{\n  "extends": ["config:recommended"]\n}\n';
    const fix = valueFix({
      path: ["packageRules", 0, "matchPackageNames"],
      value: ["!gradle"],
      fixedConfig: { extends: ["config:recommended"] },
    });
    const result = must(applyFixToText(text, fix), "an applied text fix");
    expect(result.surgical).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ extends: ["config:recommended"] });
  });
});
