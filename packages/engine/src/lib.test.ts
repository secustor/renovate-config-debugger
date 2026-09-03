import { describe, expect, it } from "vitest";
import { deepEqual, snapshot } from "./lib";
import { diffKeys } from "./simulate-package-rules";

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

  /** The consumer half of the `jsonEqual` order-sensitivity pin in
   *  `json.test.ts`. */
  it("reports a key whose object value was only REORDERED as changed", () => {
    expect(diffKeys({ constraints: { a: 1, b: 2 } }, { constraints: { b: 2, a: 1 } })).toEqual([
      { key: "constraints", before: { a: 1, b: 2 }, after: { b: 2, a: 1 } },
    ]);
  });
});

describe("deepEqual", () => {
  /** The counterpart half of `json.test.ts`'s order-sensitivity tripwire: the
   *  same literal pair `jsonEqual` reports as unequal. */
  it("is order-INSENSITIVE over object keys", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("recurses into arrays by element, and compares length", () => {
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);
    expect(deepEqual([{ a: 1 }], [{ a: 2 }])).toBe(false);
  });

  // The only input that tells the `hasOwnProperty` guard apart from its
  // absence: without it both sides reach `deepEqual(undefined, undefined)`.
  it("does not treat an explicitly-undefined key as matching a missing one", () => {
    expect(deepEqual({ x: undefined }, { y: 1 })).toBe(false);
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
    // Named rather than bare: the point of this test is the FALLBACK, so it
    // matters that the throw is the un-cloneable-value one (a `DataCloneError`
    // DOMException, "… could not be cloned") and not some unrelated failure
    // that would make the fallback look exercised when it was not.
    expect(() => structuredClone(withFunction)).toThrow(/could not be cloned/);
    expect(snapshot(withFunction)).toEqual({ keep: 1 });
  });
});
