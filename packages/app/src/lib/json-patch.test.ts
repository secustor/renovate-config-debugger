import { applyPatch } from "diff";
import { parseDiff } from "react-diff-view";
import { describe, expect, it } from "vitest";
import { buildJsonPatch } from "./json-patch";

/**
 * Deliberately a second copy of the formatter rather than an import of
 * `jsonFile`: the oracle has to be independent of the module under test, so a
 * change to how the builder pretty-prints shows up as a failure here.
 */
function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2) ?? "null"}\n`;
}

/** The contract: the patch, applied to the old text, reproduces the new one. */
function expectRoundTrip(before: unknown, after: unknown): string {
  const patch = buildJsonPatch("before", "after", before, after);
  expect(patch.startsWith("--- before\n+++ after\n")).toBe(true);
  expect(applyPatch(pretty(before), patch)).toBe(pretty(after));
  return patch;
}

interface ChangeCount {
  insert: number;
  delete: number;
  total: number;
}

/** The same scan `JsonDiff` runs for its `+N −N` stat, via the same parser. */
function changeCount(patch: string): ChangeCount {
  const count: ChangeCount = { insert: 0, delete: 0, total: 0 };
  for (const file of parseDiff(patch)) {
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        if (change.type === "insert") {
          count.insert++;
          count.total++;
        } else if (change.type === "delete") {
          count.delete++;
          count.total++;
        }
      }
    }
  }
  return count;
}

function rule(n: number): Record<string, unknown> {
  return {
    matchPackageNames: [`pkg-${n}`],
    matchUpdateTypes: ["minor", "patch"],
    groupName: `group-${n}`,
  };
}

function configWith(rules: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    extends: ["config:recommended"],
    labels: ["dependencies"],
    packageRules: rules,
  };
}

function rulesFrom(from: number, to: number): Record<string, unknown>[] {
  const rules: Record<string, unknown>[] = [];
  for (let n = from; n < to; n++) {
    rules.push(rule(n));
  }
  return rules;
}

describe("buildJsonPatch", () => {
  it("emits no hunks for identical values", () => {
    const value = configWith(rulesFrom(0, 5));
    const patch = buildJsonPatch("before", "after", value, structuredClone(value));
    expect(patch).toBe("--- before\n+++ after\n");
    expect(patch).not.toContain("@@");
    expect(changeCount(patch).total).toBe(0);
  });

  it("adds, removes and changes a top-level scalar key", () => {
    // Adding a key after `"a": 1` also rewrites that line to carry a comma,
    // which is why the added/removed cases are 3 lines and not 2.
    expect(changeCount(expectRoundTrip({ a: 1 }, { a: 1, b: 2 }))).toEqual({
      insert: 2,
      delete: 1,
      total: 3,
    });
    expect(changeCount(expectRoundTrip({ a: 1, b: 2 }, { a: 1 }))).toEqual({
      insert: 1,
      delete: 2,
      total: 3,
    });
    expect(changeCount(expectRoundTrip({ a: 1, b: 2 }, { a: 1, b: 3 }))).toEqual({
      insert: 1,
      delete: 1,
      total: 2,
    });
  });

  it("handles the presets stage shape — `$schema` dropped", () => {
    const before = {
      $schema: "https://docs.renovatebot.com/renovate-schema.json",
      extends: ["config:recommended"],
      labels: ["dependencies"],
    };
    const { $schema: _dropped, ...after } = before;
    const patch = expectRoundTrip(before, after);
    expect(patch).toContain('-  "$schema"');
    expect(changeCount(patch)).toEqual({ insert: 0, delete: 1, total: 1 });
  });

  it("anchors on unchanged elements when many are appended", () => {
    const before = configWith(rulesFrom(0, 2));
    const after = configWith(rulesFrom(0, 30));
    const patch = expectRoundTrip(before, after);
    // Each rule is 10 lines. The two surviving rules must not be re-emitted as
    // delete/insert pairs: the only removal is rule 1's last line gaining a
    // trailing comma, on top of the 28 appended rules.
    expect(patch).toContain('+      "groupName": "group-29"');
    expect(changeCount(patch)).toEqual({ insert: 28 * 10 + 1, delete: 1, total: 28 * 10 + 2 });
  });

  it("handles an element inserted in the middle and one modified in place", () => {
    const before = configWith(rulesFrom(0, 20));
    const middle = rulesFrom(0, 20);
    middle.splice(10, 0, rule(99));
    middle[5] = { ...rule(5), enabled: false };
    expectRoundTrip(before, configWith(middle));
  });

  it("handles reordered keys", () => {
    const before = { alpha: 1, beta: 2, gamma: 3, packageRules: rulesFrom(0, 12) };
    const after = { gamma: 3, packageRules: rulesFrom(0, 12), beta: 2, alpha: 1 };
    expectRoundTrip(before, after);
  });

  it("handles the trailing-comma boundary in arrays and objects", () => {
    const beforeArray = configWith(rulesFrom(0, 12));
    const afterArray = configWith([...rulesFrom(0, 12), rule(12)]);
    expectRoundTrip(beforeArray, afterArray);
    expectRoundTrip(afterArray, beforeArray);

    const beforeObject = { packageRules: rulesFrom(0, 12), last: 1 };
    const afterObject = { packageRules: rulesFrom(0, 12), last: 1, evenLater: 2 };
    expectRoundTrip(beforeObject, afterObject);
    expectRoundTrip(afterObject, beforeObject);
  });

  it("handles an empty object on one side", () => {
    expectRoundTrip({}, configWith(rulesFrom(0, 12)));
    expectRoundTrip(configWith(rulesFrom(0, 12)), {});
    expectRoundTrip({}, {});
  });

  it("handles root values that are not objects", () => {
    expectRoundTrip(rulesFrom(0, 12), rulesFrom(0, 14));
    expectRoundTrip("before", "after");
    expectRoundTrip(42, "forty-two");
    expectRoundTrip(configWith(rulesFrom(0, 12)), rulesFrom(0, 12));
    expectRoundTrip(rulesFrom(0, 12), configWith(rulesFrom(0, 12)));
  });

  it("handles an undefined side", () => {
    // `null`, not `""`: a diff of "no value" has to render a line the reader
    // can see, and `null` is the only JSON text for it that parses back.
    expect(pretty(undefined)).toBe("null\n");
    expectRoundTrip(undefined, configWith(rulesFrom(0, 12)));
    expectRoundTrip(configWith(rulesFrom(0, 12)), undefined);
    expectRoundTrip(undefined, undefined);
  });

  it("handles a change at the bottom of a deep nesting", () => {
    const deep = (leaf: unknown) => ({
      hostRules: [{ matchHost: "github.com" }],
      packageRules: rulesFrom(0, 12),
      customManagers: [{ nested: { deeper: { deepest: leaf } } }],
    });
    expectRoundTrip(deep("one"), deep("two"));
    expectRoundTrip(deep({ a: [1, 2, 3] }), deep({ a: [1, 4, 3] }));
  });

  it("holds the oracle on a large append-heavy config", () => {
    const before = configWith(rulesFrom(0, 50));
    const rules = rulesFrom(0, 50);
    rules[25] = { ...rule(25), groupName: "renamed", enabled: false };
    rules.splice(10, 1);
    const after = configWith([...rules, ...rulesFrom(50, 950)]);
    const patch = expectRoundTrip(before, after);
    expect(patch).toContain('+      "groupName": "group-949"');
    const count = changeCount(patch);
    expect(count.insert).toBeGreaterThan(900 * 10);
    // The anchoring claim, stated as a number: 510 old lines go in, and all
    // but a few dozen come back out as context rather than delete/insert.
    expect(count.delete).toBeLessThan(60);
  });
});
