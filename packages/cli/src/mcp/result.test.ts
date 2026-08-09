import { describe, expect, test } from "vitest";
import { RESULT_BUDGET_BYTES, serializeResult } from "./result";

/** The size budget, on its own — the tool-level assertions live in
 *  `server.test.ts`, where a real `config:recommended` run supplies the
 *  payloads this module was written for. */

describe("serializeResult", () => {
  test("small answers are indented, large ones are not", () => {
    expect(serializeResult({ a: 1 })).toContain("\n  ");
    const big = { items: Array.from({ length: 2_000 }, (_, i) => ({ i, pad: "x".repeat(20) })) };
    expect(serializeResult(big)).not.toContain("\n");
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
      rules: { truncated: boolean; shown: number; omitted: number; items: unknown[] };
    };
    expect(parsed.truncated).toBe(true);
    expect(parsed.hint).toBe("pass `key` to narrow it");
    // The rest of the document survives intact.
    expect(parsed.keep).toBe("small");
    expect(parsed.rules.truncated).toBe(true);
    expect(parsed.rules.shown + parsed.rules.omitted).toBe(5_000);
    expect(parsed.rules.items).toHaveLength(parsed.rules.shown);
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
});
