import type { FormState } from "./form";

/**
 * Roadmap 079: the three named field groups, and the fields each one holds.
 *
 * The list lives apart from the components because the count pill on a CLOSED
 * group is derived from it — the header has to be able to say how many of its
 * fields hold a value without the fields being mounted — and because a group's
 * membership is a fact about the descriptor, unit-testable without a DOM.
 *
 * Together with the sentence line's own five fields (`packageName`,
 * `currentValue`, `newValue`, `datasource` and the derived `updateType` chip)
 * these cover `FormState` exactly: a field in neither place would be a field
 * the form never shows.
 */
export const GROUP_KEYS = {
  repo: ["manager", "packageFile", "depType", "depName"],
  source: ["sourceUrl", "registryUrls", "repository", "baseBranch"],
  versioning: [
    "versioning",
    "currentVersion",
    "lockedVersion",
    "lockFiles",
    "categories",
    "currentVersionTimestamp",
  ],
} as const satisfies Record<string, readonly (keyof FormState)[]>;

/** How many of a group's fields carry a value — the closed group's count pill. */
export function countSet(form: FormState, keys: readonly (keyof FormState)[]): number {
  return keys.filter((key) => form[key].trim() !== "").length;
}
