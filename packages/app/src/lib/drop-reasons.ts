import type {
  DroppedDescription,
  DroppedDescriptionReason,
} from "@renovate-config-debugger/engine";

/**
 * Roadmap 069: one wording table for the three rules that delete a description
 * before it can merge (069 PR 1's `dropped`).
 *
 * Two surfaces answer "where did my preset's description go" and they must
 * answer it identically: the Effective config's blame ledger footer (PR 3),
 * which lists every drop with its reason, and the preset tree's per-node note
 * (PR 4), which says it on the node whose sentence went missing. A wording that
 * drifts in one copy is a wording that lies in the other — the same argument
 * `description-approx.ts` makes for the `≈`.
 *
 * The table is split into a LABEL and a WHY rather than one sentence, because
 * the two surfaces need different amounts of it: a node marker has room for
 * "muted by `group:recommended`" and nothing more, while the ledger's footer
 * cell can carry the whole rule. {@link dropReasonText} is the two joined.
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

/** The compact form: the rule alone, naming the muting config where there is
 *  one. For a marker beside the node whose description went missing. */
export function dropReasonLabel(drop: DroppedDescription): string {
  return DROP_REASONS[drop.reason].label(drop);
}

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
