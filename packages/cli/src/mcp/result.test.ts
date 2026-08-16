import { describe, expect, test } from "vitest";
import { fitsBudget, RESULT_BUDGET_BYTES, serializeResult } from "./result";

/** The size budget, on its own — the tool-level assertions live in
 *  `server.test.ts`, where a real `config:recommended` run supplies the
 *  payloads this module was written for. */

interface ElidedArray {
  truncated: boolean;
  shown: number;
  omitted: number;
  omittedFrom: number;
  items: unknown[];
}

describe("serializeResult", () => {
  test("small answers are indented, large ones are not", () => {
    expect(serializeResult({ a: 1 })).toContain("\n  ");
    const big = { items: Array.from({ length: 2_000 }, (_, i) => ({ i, pad: "x".repeat(20) })) };
    expect(serializeResult(big)).not.toContain("\n");
  });

  test("the budget stays under the host's own tool-output cap", () => {
    // ~25k tokens at ~3 bytes each. A budget above it would be truncated by
    // the HOST, mid-JSON — the one thing this module promises never happens.
    expect(RESULT_BUDGET_BYTES).toBeLessThanOrEqual(75_000);
    expect(RESULT_BUDGET_BYTES).toBeGreaterThan(50_000);
  });

  test("an over-budget payload is elided, never cut mid-JSON", () => {
    const payload = {
      keep: "small",
      rules: Array.from({ length: 5_000 }, (_, i) => ({ i, pad: "y".repeat(60) })),
    };
    const text = serializeResult(payload, "pass `key` to narrow it");
    expect(text.length).toBeLessThanOrEqual(RESULT_BUDGET_BYTES);
    const parsed = JSON.parse(text) as {
      truncated: boolean;
      hint: string;
      keep: string;
      rules: ElidedArray;
    };
    expect(parsed.truncated).toBe(true);
    expect(parsed.hint).toContain("pass `key` to narrow it");
    // The rest of the document survives intact.
    expect(parsed.keep).toBe("small");
    expect(parsed.rules.truncated).toBe(true);
    expect(parsed.rules.shown + parsed.rules.omitted).toBe(5_000);
    expect(parsed.rules.items).toHaveLength(parsed.rules.shown);
  });

  test("the hint names the shape an elided array takes", () => {
    const text = serializeResult({
      rules: Array.from({ length: 5_000 }, (_, i) => ({ i, pad: "y".repeat(60) })),
    });
    const parsed = JSON.parse(text) as { hint: string };
    expect(parsed.hint).toContain("omittedFrom");
    expect(parsed.hint).toContain("FIRST and the LAST");
  });

  test("without a hint it still says how to proceed", () => {
    const text = serializeResult({ rules: Array.from({ length: 5_000 }, () => "z".repeat(80)) });
    const parsed = JSON.parse(text) as { hint: string };
    expect(parsed.hint).toContain("narrower question");
  });

  test("a payload with no array to elide drops whole keys, and names them", () => {
    const huge = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${i}`, "q".repeat(5_000)]),
    );
    const parsed = JSON.parse(serializeResult(huge)) as {
      truncated: boolean;
      omittedKeys: string[];
    };
    expect(parsed.truncated).toBe(true);
    expect(parsed.omittedKeys.length).toBeGreaterThan(0);
  });

  /**
   * Relevance inversion (roadmap 068): a merged `packageRules` array is the
   * presets' rules first and the repo's OWN rules last, so a head-only
   * truncation drops exactly the rules the caller wrote — with no parameter
   * that could ask for them back.
   */
  test("the elision keeps a head AND a tail window, and says where the gap is", () => {
    const rules = Array.from({ length: 4_000 }, (_, i) => ({ i, pad: "y".repeat(60) }));
    const text = serializeResult({ rules });
    const parsed = JSON.parse(text) as { rules: ElidedArray };
    const items = parsed.rules.items as { i: number }[];
    expect(parsed.rules.omitted).toBeGreaterThan(0);
    // The array's own last element is still in the answer.
    expect(items.at(-1)?.i).toBe(3_999);
    expect(items[0]?.i).toBe(0);
    // The gap is where the wrapper says it is: head below it, tail above.
    const gap = parsed.rules.omittedFrom;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(items.length);
    expect(items[gap - 1]?.i).toBe(gap - 1);
    expect(items[gap]?.i).toBe(4_000 - (items.length - gap));
  });

  /**
   * The H1 mechanism: when the payload is over budget by more than the array
   * weighs, the allowance goes NEGATIVE. The array used to refuse to shrink
   * below two elements, report `removed === 0`, and hand the whole payload to
   * the blunt key-dropping — which is how a simulate answer came back with 2
   * of 713 rules and no merge trace, on a third of the budget.
   */
  test("an array that cannot afford one element still converges, without dropping keys", () => {
    const payload = {
      answer: { a: "b" },
      rules: Array.from({ length: 700 }, (_, i) => ({ i, pad: "r".repeat(400) })),
      trace: Array.from({ length: 700 }, (_, i) => ({ i, pad: "t".repeat(400) })),
    };
    const text = serializeResult(payload);
    expect(text.length).toBeLessThanOrEqual(RESULT_BUDGET_BYTES);
    const parsed = JSON.parse(text) as {
      omittedKeys?: string[];
      answer: unknown;
      rules: ElidedArray;
      trace: ElidedArray;
    };
    // Every key survives — the arrays gave the bytes back themselves.
    expect(parsed.omittedKeys).toBeUndefined();
    expect(parsed.answer).toEqual({ a: "b" });
    // The floor keeps BOTH ends — the exact promise ELIDED_ARRAY_SHAPE ships,
    // and the tail is where a merged packageRules array keeps the repo's own
    // rules. The gap marker must sit inside `items`, never past its end.
    for (const elided of [parsed.rules, parsed.trace]) {
      const items = elided.items as { i: number }[];
      expect(elided.shown).toBeGreaterThanOrEqual(2);
      expect(items[0]?.i).toBe(0);
      expect(items.at(-1)?.i).toBe(699);
      expect(elided.omittedFrom).toBeGreaterThan(0);
      expect(elided.omittedFrom).toBeLessThan(items.length);
    }
  });

  /**
   * The escape the head/tail windows must not break: a dozen small nodes next
   * to one enormous subtree. Truncating around the trunk would answer with the
   * leaves; the pass leaves the array alone and elides INSIDE the big element.
   */
  test("one enormous element is kept, and elided inside", () => {
    const payload = {
      children: [
        ...Array.from({ length: 12 }, (_, i) => ({ name: `leaf-${i}` })),
        {
          name: "trunk",
          body: Array.from({ length: 5_000 }, (_, i) => ({ i, pad: "p".repeat(60) })),
        },
      ],
    };
    const parsed = JSON.parse(serializeResult(payload)) as {
      children: { name: string; body?: ElidedArray }[];
    };
    const trunk = parsed.children.find((child) => child.name === "trunk");
    expect(trunk).toBeDefined();
    expect(trunk?.body?.truncated).toBe(true);
    expect(parsed.children).toHaveLength(13);
  });
});

/**
 * Roadmap 071: the measurement a projection takes BEFORE it answers, so it can
 * degrade semantically (shorter digest lines, complete attribution) instead of
 * being collapsed to first-and-last by the pass above.
 */
describe("fitsBudget", () => {
  /** `{"pad":"…"}` — the payload's bytes, minus the padding itself. */
  const WRAPPER = '{"pad":""}'.length;
  const padded = (bytes: number) => ({ pad: "x".repeat(bytes - WRAPPER) });

  test("true exactly up to the elision target, false past it", () => {
    // The target is the budget minus the room the elision wrapper needs, so
    // "fits" has to be strictly stricter than "under the hard cap".
    const target = RESULT_BUDGET_BYTES - 2_000;
    expect(fitsBudget(padded(target))).toBe(true);
    expect(fitsBudget(padded(target + 1))).toBe(false);
    expect(fitsBudget(padded(RESULT_BUDGET_BYTES))).toBe(false);
  });

  test("what fits comes back whole — same predicate, same threshold", () => {
    const payload = { rules: Array.from({ length: 200 }, (_, i) => ({ i, pad: "y".repeat(60) })) };
    expect(fitsBudget(payload)).toBe(true);
    expect(JSON.parse(serializeResult(payload))).toEqual(payload);
  });

  test("multi-byte characters count as bytes, not as characters", () => {
    const text = { pad: "é".repeat(RESULT_BUDGET_BYTES - 2_000) };
    expect(text.pad.length).toBeLessThan(RESULT_BUDGET_BYTES);
    expect(fitsBudget(text)).toBe(false);
  });
});
