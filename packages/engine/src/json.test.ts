import { describe, expect, it } from "vitest";
import { jsonDocument, jsonEqual, jsonFile, jsonLiteral, jsonText } from "./json";

/** The three values `JSON.stringify` returns `undefined` for while claiming
 *  `string` — the whole reason this module exists. */
const UNSTRINGIFIABLE = (): string => "x";
const NO_JSON_FORM: unknown[] = [undefined, UNSTRINGIFIABLE, Symbol("x")];

describe("jsonText", () => {
  it("produces compact JSON", () => {
    expect(jsonText({ a: 1, b: [2, 3] })).toBe('{"a":1,"b":[2,3]}');
    expect(jsonText("x")).toBe('"x"');
    expect(jsonText(null)).toBe("null");
  });

  it("reads a value with no JSON form as the literal `undefined`", () => {
    for (const value of NO_JSON_FORM) {
      expect(jsonText(value)).toBe("undefined");
    }
  });
});

describe("jsonLiteral", () => {
  it("produces compact JSON that parses back", () => {
    expect(jsonLiteral({ a: 1 })).toBe('{"a":1}');
    expect(JSON.parse(jsonLiteral([1, "x"]))).toEqual([1, "x"]);
  });

  it("falls back to `null` so the text still parses", () => {
    for (const value of NO_JSON_FORM) {
      expect(jsonLiteral(value)).toBe("null");
      expect(JSON.parse(jsonLiteral(value))).toBe(null);
    }
  });
});

describe("jsonDocument", () => {
  it("produces 2-space document text with no trailing newline", () => {
    expect(jsonDocument({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  /** Sweep finding 9: `cli/src/output.ts` printed a header and a blank line
   *  for a run with no tree, because the fallback was missing here. */
  it("falls back to `null` rather than the empty string", () => {
    for (const value of NO_JSON_FORM) {
      expect(jsonDocument(value)).toBe("null");
    }
  });
});

describe("jsonFile", () => {
  it("is jsonDocument plus a trailing newline", () => {
    expect(jsonFile({ a: 1 })).toBe('{\n  "a": 1\n}\n');
    expect(jsonFile(undefined)).toBe("null\n");
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
   * silent one. `lib.test.ts` pins the other half: `deepEqual` on this same
   * pair is `true`.
   */
  it("is order-sensitive: the same object with swapped key order compares unequal", () => {
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });

  /** The `a === b` fast path can only turn `false` into `true` for the same
   *  reference, which is what lets it replace the hand-written
   *  `JSON.stringify(a) === JSON.stringify(b)` pairs unchanged. */
  it("agrees with the raw stringify pair on values that have no JSON form", () => {
    expect(jsonEqual(UNSTRINGIFIABLE, UNSTRINGIFIABLE)).toBe(true);
    // Both sides stringify to `undefined`, exactly as the pair it replaces did.
    expect(jsonEqual(UNSTRINGIFIABLE, undefined)).toBe(true);
  });
});
