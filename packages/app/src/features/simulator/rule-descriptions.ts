import type {
  DescriptionProvenance,
  RuleDescriptionAttribution,
} from "@renovate-config-debugger/engine";
import { layerLabel } from "@/lib/provenance-layer";

/**
 * Roadmap 069 (PR 5): the author's own words on a matched `packageRules` entry.
 *
 * Every serious preset rule carries a `description` its author wrote —
 * "Wait until the npm package is three days old before raising the update…" —
 * and Renovate keeps it on the rule body (nested descriptions are never hoisted
 * to the top level, 069 PR 1). The simulator already says WHICH rule fired and
 * WHAT it set; this is the missing half: why it exists at all. "Why is my
 * update delayed 14 days" stops being a merge trace and becomes a sentence.
 *
 * The attribution comes from the engine's `ruleDescriptions`, which joins
 * `computeRuleProvenance` (which layer contributed each merged rule, and that
 * layer's own index for it) with the rule body's own description. Its
 * granularity is the LAYER, not the exact preset node — which is all this
 * wording needs, because the row already wears the layer's chip: the quote only
 * has to say whose voice it is, and for the reader's own rules, which of their
 * rules it was.
 *
 * Pure and DOM-free, so the wording is unit-testable and the components only
 * decide where the quote sits.
 */

/** One matched rule's description, ready to render. */
export interface RuleDescriptionNote {
  /** Index into the final merged `packageRules` array — the row's own id. */
  ruleIndex: number;
  /** The rule's description strings, in order. Multi-string descriptions are
   *  common (`["accounts monorepo", "Group packages from accounts monorepo
   *  together."]`) and each is its own line: they are separate sentences, not
   *  one sentence split. */
  values: string[];
  /** The muted line under the quote — who is talking. */
  attribution: string;
}

/**
 * The attribution line. A preset rule's author is a stranger whose name the
 * row's chip already prints, so the line says only whose words these are; the
 * reader's OWN rule gets the index it has in their config (`sourceIndex`, not
 * the merged index — `packageRules[312]` is not a number they can find in their
 * editor, and `packageRules[0]` is).
 */
export function ruleDescriptionAttribution(entry: RuleDescriptionAttribution): string {
  if (entry.layer.kind === "repo") {
    return `your description, packageRules[${entry.sourceIndex}] in your repo config`;
  }
  if (entry.layer.kind === "preset") {
    return "author's description of this rule";
  }
  // defaults / global / inherited: no author to name, so the level is the
  // answer — and it is the same label the chip beside it carries.
  return `description from the ${layerLabel(entry.layer)}`;
}

/**
 * Indexes a run's rule descriptions by merged rule index, or an empty map when
 * the run has no attribution (no completed preset resolution) — in which case
 * every row renders exactly as it did before.
 */
export function buildRuleDescriptions(
  provenance: DescriptionProvenance | null | undefined,
): Map<number, RuleDescriptionNote> {
  const byIndex = new Map<number, RuleDescriptionNote>();
  for (const entry of provenance?.ruleDescriptions ?? []) {
    if (entry.values.length === 0) {
      continue;
    }
    byIndex.set(entry.ruleIndex, {
      ruleIndex: entry.ruleIndex,
      values: entry.values,
      attribution: ruleDescriptionAttribution(entry),
    });
  }
  return byIndex;
}
