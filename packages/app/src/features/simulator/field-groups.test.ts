import { describe, expect, test } from "vitest";
import { countSet, GROUP_KEYS } from "./field-groups";
import { EMPTY_FORM, type FormState } from "./form";

/**
 * The groups and the sentence line between them have to cover `FormState`
 * exactly: a field in neither is a field the form renders nowhere, and a field
 * in two places is one the reader can edit twice with two different counts.
 */

/** What `SentenceLine.tsx` owns — its four blanks and the updateType chip. */
const SENTENCE_KEYS: readonly (keyof FormState)[] = [
  "packageName",
  "currentValue",
  "newValue",
  "datasource",
  "updateType",
];

describe("the three field groups", () => {
  test("partition every field the sentence line does not own", () => {
    const grouped = [...GROUP_KEYS.repo, ...GROUP_KEYS.source, ...GROUP_KEYS.versioning];
    // No field is in two groups.
    expect(new Set(grouped).size).toBe(grouped.length);

    const expected = Object.keys(EMPTY_FORM).filter(
      (key) => !SENTENCE_KEYS.includes(key as keyof FormState),
    );
    expect(grouped.toSorted()).toEqual(expected.toSorted());
  });
});

describe("countSet", () => {
  test("counts only the fields of the group it is asked about, blanks aside", () => {
    const form: FormState = {
      ...EMPTY_FORM,
      manager: "npm",
      depType: "   ",
      sourceUrl: "https://github.com/lodash/lodash",
      packageName: "lodash",
    };
    expect(countSet(form, GROUP_KEYS.repo)).toBe(1);
    expect(countSet(form, GROUP_KEYS.source)).toBe(1);
    expect(countSet(form, GROUP_KEYS.versioning)).toBe(0);
  });
});
