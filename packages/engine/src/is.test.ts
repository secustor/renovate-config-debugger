import { describe, expect, it } from "vitest";
import {
  isBoolean,
  isNonEmptyString,
  isNullOrUndefined,
  isNumber,
  isPlainObject,
  isString,
  isStringArray,
  isTruthy,
} from "./is";

describe("isString", () => {
  it("accepts only primitive strings", () => {
    expect(isString("")).toBe(true);
    expect(isString("x")).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isString(undefined)).toBe(false);
    // A boxed String is `"object"` to `typeof`, so the guard rejects it.
    expect(isString(Object("x"))).toBe(false);
  });
});

describe("isNonEmptyString", () => {
  it("rejects the empty string but keeps whitespace", () => {
    expect(isNonEmptyString("x")).toBe(true);
    // NOT whitespace-aware, deliberately — see the note on the helper.
    expect(isNonEmptyString(" ")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
  });
});

describe("isNumber", () => {
  /** Pinned: this is the divergence from `@sindresorhus/is` that lets
   *  `rcd/prefer-is-helpers` rewrite `typeof x === "number"` without changing
   *  a single site's meaning. */
  it('is exactly `typeof value === "number"`, NaN and Infinity included', () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(true);
    expect(isNumber(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isNumber("1")).toBe(false);
    expect(isNumber(1n)).toBe(false);
  });
});

describe("isBoolean", () => {
  it("accepts both booleans and nothing else", () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean(null)).toBe(false);
  });

  /** `shims/renovate-deps.ts` re-exports this in place of its verbatim
   *  `value === true || value === false`; the two agree on a boxed Boolean,
   *  which is the only value that could tell them apart. */
  it("rejects a boxed Boolean, as the vendored predicate it replaces does", () => {
    expect(isBoolean(Object(true))).toBe(false);
  });
});

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

describe("isStringArray", () => {
  it("requires an array whose every member is a string", () => {
    expect(isStringArray([])).toBe(true);
    expect(isStringArray(["a", "b"])).toBe(true);
    expect(isStringArray(["a", 1])).toBe(false);
    expect(isStringArray("a")).toBe(false);
    expect(isStringArray(undefined)).toBe(false);
  });
});

describe("isNullOrUndefined", () => {
  it("accepts both nullish values and no falsy value beyond them", () => {
    expect(isNullOrUndefined(null)).toBe(true);
    expect(isNullOrUndefined(undefined)).toBe(true);
    expect(isNullOrUndefined(0)).toBe(false);
    expect(isNullOrUndefined("")).toBe(false);
    expect(isNullOrUndefined(false)).toBe(false);
  });
});

describe("isTruthy", () => {
  it("agrees with Boolean on every falsy value", () => {
    expect(isTruthy("x")).toBe(true);
    expect(isTruthy(0)).toBe(false);
    expect(isTruthy("")).toBe(false);
    expect(isTruthy(null)).toBe(false);
    expect(isTruthy(undefined)).toBe(false);
    expect(isTruthy(Number.NaN)).toBe(false);
  });

  /** The whole point of the helper over `.filter(Boolean)`: the result type. */
  it("narrows a filtered array, which `.filter(Boolean)` does not", () => {
    const mixed: (string | undefined)[] = ["a", undefined, "b"];
    const kept: string[] = mixed.filter(isTruthy);
    expect(kept).toEqual(["a", "b"]);
  });
});
