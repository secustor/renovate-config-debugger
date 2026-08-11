import { expect, test } from "vitest";
import { truncate } from "./truncate";

/** Moved here from `description-ledger.test.ts` when the ledger's private copy
 *  became the app's one truncation (069 PR 3): the surrogate case is a property
 *  of the helper, not of the cell that happens to call it. */

test("leaves a string that fits untouched, ellipsis included", () => {
  expect(truncate("short", 10)).toBe("short");
  expect(truncate("exactly-10", 10)).toBe("exactly-10");
  expect(truncate("eleven chars", 10)).toBe("eleven cha…");
});

test("cuts on a code point, never through one", () => {
  // The cut lands between the halves of the pair: dropped whole rather than
  // halved, because half a surrogate renders as U+FFFD.
  const split = `${"a".repeat(9)}😀tail`;
  expect(truncate(split, 10)).toBe(`${"a".repeat(9)}…`);
  expect(/[\uD800-\uDFFF]/.test(truncate(split, 10))).toBe(false);

  // …and kept whole when both halves fit, so the back-off never eats a full
  // character it had room for.
  const whole = `${"a".repeat(8)}😀tail`;
  expect(truncate(whole, 10)).toBe(`${"a".repeat(8)}😀…`);
});

test("a trailing LOW surrogate is not an orphan and is kept", () => {
  // Only a HIGH surrogate can be left dangling: if the last kept unit is the
  // LOW half, its partner is inside the slice too.
  expect(truncate("😀abcdefghij", 2)).toBe("😀…");
});
