import { describe, expect, it } from "vitest";
import { isPlainObject, jsonEqual, snapshot } from "./lib";
import { diffKeys } from "./simulate-package-rules";

describe("isPlainObject", () => {
  it("accepts a plain object and rejects null and arrays", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

describe("jsonEqual", () => {
  it("compares JSON-shaped values structurally when key order matches", () => {
    expect(jsonEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual(undefined, undefined)).toBe(true);
  });

  /**
   * Pinned deliberately, NOT endorsed: the second cleanup pass flagged that
   * `diffKeys` inherits this and could therefore report a key as changed when
   * a merge only reordered it. Nothing in the current pipeline reorders keys
   * (`mergeChildConfig` writes child keys onto a clone of the parent, keeping
   * insertion order), so the ORDER-SENSITIVE behavior is what ships. This test
   * is the tripwire: swapping in a structural `deepEqual` must fail here
   * first, so the swap arrives as a considered behavior change rather than a
   * silent one.
   */
  it("is order-sensitive: the same object with swapped key order compares unequal", () => {
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });
});

describe("diffKeys", () => {
  it("reports added, removed and changed keys with before/after", () => {
    expect(
      diffKeys({ kept: 1, dropped: 2, changed: 3 }, { kept: 1, changed: 4, added: 5 }),
    ).toEqual([
      { key: "dropped", before: 2 },
      { key: "changed", before: 3, after: 4 },
      { key: "added", after: 5 },
    ]);
  });

  /** The consumer half of the `jsonEqual` pin above. */
  it("reports a key whose object value was only REORDERED as changed", () => {
    expect(diffKeys({ constraints: { a: 1, b: 2 } }, { constraints: { b: 2, a: 1 } })).toEqual([
      { key: "constraints", before: { a: 1, b: 2 }, after: { b: 2, a: 1 } },
    ]);
  });
});

describe("snapshot", () => {
  it("returns a detached deep copy", () => {
    const source = { nested: { list: [1, 2] } };
    const copy = snapshot(source);
    expect(copy).toEqual(source);
    copy.nested.list.push(3);
    expect(source.nested.list).toEqual([1, 2]);
  });

  it("falls back to a JSON round-trip for values structuredClone refuses", () => {
    const withFunction = { keep: 1, drop: () => "unclonable" };
    expect(() => structuredClone(withFunction)).toThrow();
    expect(snapshot(withFunction)).toEqual({ keep: 1 });
  });
});
