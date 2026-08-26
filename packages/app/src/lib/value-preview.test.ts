import { describe, expect, it } from "vitest";
import { fixChangesValue, fixSnippet, valuePreview } from "./value-preview";

describe("valuePreview", () => {
  it("counts containers instead of dumping them", () => {
    expect(valuePreview([1, 2, 3])).toBe("[ 3 items ]");
    expect(valuePreview([])).toBe("[]");
    expect(valuePreview({ a: 1 })).toBe("{ 1 key }");
    expect(valuePreview({})).toBe("{}");
  });

  it("prints scalars as JSON", () => {
    expect(valuePreview(null)).toBe("null");
    expect(valuePreview("x")).toBe('"x"');
    expect(valuePreview(7)).toBe("7");
  });
});

describe("fixSnippet", () => {
  it("dumps container shape, unlike valuePreview", () => {
    // The diff exists to show the shape, so this one does NOT count.
    expect(fixSnippet([1, 2])).toBe("[1,2]");
  });

  it("leaves anything within the budget untouched", () => {
    const short = { enabled: true };
    expect(fixSnippet(short)).toBe('{"enabled":true}');
  });

  it("never splits a surrogate pair", () => {
    // 140 is the budget; the JSON of this string is `"` + 139 chars of padding
    // + the emoji, so a naive `slice(0, 140)` lands between the emoji's two
    // UTF-16 halves and orphans one — the bug this helper was hoisted to fix.
    const value = `${"a".repeat(138)}😀`;
    const snippet = fixSnippet(value);
    expect(snippet).not.toContain("�");
    // No orphan high surrogate is left at the cut.
    const lastKept = snippet.charCodeAt(snippet.length - 2);
    expect(lastKept >= 0xd800 && lastKept <= 0xdbff).toBe(false);
  });

  it("survives an undefined value rather than throwing", () => {
    // `JSON.stringify(undefined)` is `undefined`, not a string — the two
    // hand-rolled copies read `.length` off it and crashed.
    expect(fixSnippet(undefined)).toBe("undefined");
  });
});

describe("fixChangesValue", () => {
  it("compares by shape, not by reference", () => {
    expect(fixChangesValue({ a: 1 }, { a: 1 })).toBe(false);
    expect(fixChangesValue({ a: 1 }, { a: 2 })).toBe(true);
  });

  it("treats a removal as a change", () => {
    expect(fixChangesValue({ a: 1 }, undefined)).toBe(true);
  });
});
