import type {
  DroppedDescription,
  DroppedDescriptionReason,
} from "@renovate-config-debugger/engine";

/**
 * Roadmap 069: one wording table for the three rules that delete a description
 * before it can merge (069 PR 1's `dropped`).
 *
 * One surface answers "where did my preset's description go" today: the
 * Effective config's blame ledger footer (PR 3), which lists every drop with
 * its reason. The wording lives here rather than in that component because it
 * is a fact about Renovate, not about the footer — the same argument
 * `description-approx.ts` makes for the `≈`, and the reason a second surface
 * that grows this question inherits the wording instead of restating it.
 *
 * The table is split into a LABEL and a WHY rather than one sentence: the label
 * is the compact half ("muted by `group:recommended`", all a node marker would
 * have room for), the why is the whole rule, and {@link dropReasonText} is the
 * two joined — which is what the ledger renders.
 *
 * Pure and DOM-free (`lib/`), and exhaustive by construction: a new
 * `DroppedDescriptionReason` in the engine fails to typecheck here rather than
 * rendering as `undefined` in a footnote nobody reads.
 */

interface DropReasonWording {
  /**
   * The rule, as short as it goes. Takes the drop because one of the three
   * names the config that caused it — which is the only actionable half of
   * that sentence, since it is the config the reader can edit.
   */
  label: (drop: DroppedDescription) => string;
  /** What Renovate did, following the label after an em dash. */
  why: string;
}

/** Backtick-marked (the `CodeText` convention), so option and preset names stay
 *  mono wherever the wording is rendered. */
export const DROP_REASONS: Record<DroppedDescriptionReason, DropReasonWording> = {
  // The first two are `getPreset` deletions, so they are facts about the
  // preset's SHAPE — worth saying, because the two headline presets are the
  // shape.
  "wrapper-preset": {
    label: () => "wrapper preset",
    why: "Renovate drops the description of a preset whose body is only `description` + `extends`",
  },
  "package-list-preset": {
    label: () => "package-name list",
    why: "Renovate drops the description of a preset that only lists `matchPackageNames`",
  },
  "ignore-deps-quirk": {
    label: (drop) =>
      `muted by ${drop.droppedBy ? `\`${drop.droppedBy.name}\`` : "the extending config"}`,
    why: "its empty `ignoreDeps` deletes every description it extends",
  },
};

/**
 * The full form: the rule and what it did.
 *
 * An `approximate` drop came out of a subtree that had already degraded to its
 * enclosing node (069 PR 1), so the preset the row credits is a guess while the
 * rule itself is not — the hedge is appended rather than allowed to soften the
 * rule, and the row carries the shared `≈` beside the chip it qualifies.
 */
export function dropReasonText(drop: DroppedDescription): string {
  const wording = DROP_REASONS[drop.reason];
  const text = `${wording.label(drop)} — ${wording.why}`;
  return drop.approximate ? `${text}; exact preset unknown` : text;
}
