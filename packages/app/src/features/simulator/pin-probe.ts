import type {
  ClauseEvaluation,
  ProvenanceLayer,
  RuleAttribution,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { layerLabel } from "@/components/provenance-layer";
import { crossRuleIndex } from "@/lib/rule-cross-index";
import { fullValue } from "./rule-format";
import type { RuleDescriptionNote } from "./rule-descriptions";

/**
 * The funnel's probe (Proposal F / "Skip Reason Funnel"): "why didn't a rule
 * apply to this test?" answered by search rather than by scrolling — a
 * substring match across everything a reader might know a rule by: its index,
 * the preset that contributed it, its matcher keys and values, the options it
 * writes, and its author's description.
 *
 * Deliberately a plain lowercase substring scan, not a ranking: the corpus is
 * one run's rules, the reader types something they SAW ("angular", "203",
 * "automerge"), and the honest answer is every rule that mentions it, in rule
 * order. Probing pins nothing and simulates nothing — it reads the pin's own
 * finished simulation.
 *
 * Pure and DOM-free.
 */

export interface ProbeHit {
  index: number;
  matched: boolean;
  layer?: ProvenanceLayer;
  repoIndex?: number;
  /** Where the query was found — `index`, `preset`, `description`, `writes`,
   *  or the matcher key itself. */
  foundIn: string;
  /** The found value, split around the match for highlighting. Both context
   *  sides are pre-clipped — the full value never needs to reach the DOM. */
  pre: string;
  hit: string;
  post: string;
  /** The rule's matcher checklist, for the expandable evidence. */
  clauses: ClauseEvaluation[];
}

export interface ProbeResults {
  total: number;
  hits: ProbeHit[];
}

/** How many hits the result list renders. */
export const MAX_PROBE_HITS = 8;

/** Context kept around a highlighted match. */
const WINDOW = 26;

function clip(pre: string, hit: string, post: string): Pick<ProbeHit, "pre" | "hit" | "post"> {
  const left = pre.length > WINDOW ? `…${pre.slice(-WINDOW)}` : pre;
  const right = post.length > WINDOW ? `${post.slice(0, WINDOW)}…` : post;
  return { pre: left, hit, post: right };
}

/**
 * What the rule WRITES, from its own body in the merged `packageRules` array
 * — the non-matcher keys with their values. The body rather than the merge
 * steps, because a rule that did not match still has writes a reader searches
 * by ("which rule sets automerge?"), and only matched rules have a step.
 */
function bodyWrites(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const entries = Object.entries(body).filter(
    ([key]) => !key.startsWith("match") && !key.startsWith("exclude") && key !== "description",
  );
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map(([key, value]) => `${key}: ${fullValue(value)}`).join(", ");
}

/** The searchable fields of one rule, in the order a hit is attributed. */
function ruleFields(
  ruleIndex: number,
  clauses: ClauseEvaluation[],
  layer: ProvenanceLayer | undefined,
  description: RuleDescriptionNote | undefined,
  body: unknown,
): [string, string][] {
  const fields: [string, string][] = [["index", `packageRules[${ruleIndex}]`]];
  if (layer) {
    fields.push(["preset", layerLabel(layer)]);
  }
  for (const clause of clauses) {
    fields.push([clause.key, `${clause.key}: ${fullValue(clause.value)}`]);
  }
  const writes = bodyWrites(body);
  if (writes !== undefined) {
    fields.push(["writes", writes]);
  }
  if (description) {
    fields.push(["description", description.values.join(" ")]);
  }
  return fields;
}

export function probeRules({
  sim,
  layerByIndex,
  attribution,
  descriptions,
  ruleBodies,
  query,
}: {
  sim: SimulationResult;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  descriptions: Map<number, RuleDescriptionNote>;
  /** `finalConfig.packageRules` — the merged rule bodies, indexed exactly the
   *  way `RuleEvaluation.index` counts. Optional: without them the writes
   *  field simply isn't searchable. */
  ruleBodies?: readonly unknown[];
  query: string;
}): ProbeResults {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return { total: 0, hits: [] };
  }
  let total = 0;
  const hits: ProbeHit[] = [];
  for (const rule of sim.rules) {
    const layer = layerByIndex.get(rule.index);
    const fields = ruleFields(
      rule.index,
      rule.clauses,
      layer,
      descriptions.get(rule.index),
      ruleBodies?.[rule.index],
    );
    const found = fields
      .map(([key, value]) => ({ key, value, at: value.toLowerCase().indexOf(q) }))
      .find((f) => f.at >= 0);
    if (!found) {
      continue;
    }
    total += 1;
    if (hits.length === MAX_PROBE_HITS) {
      continue;
    }
    const repoIndex = crossRuleIndex("merged", rule.index, attribution);
    hits.push({
      index: rule.index,
      matched: rule.verdict === "matched",
      foundIn: found.key,
      ...clip(
        found.value.slice(0, found.at),
        found.value.slice(found.at, found.at + q.length),
        found.value.slice(found.at + q.length),
      ),
      clauses: rule.clauses,
      ...(layer ? { layer } : {}),
      ...(repoIndex === undefined ? {} : { repoIndex }),
    });
  }
  return { total, hits };
}

/**
 * The idle state's example chips — drawn from the run itself so every
 * suggestion is guaranteed to hit: the biggest preset name among the skipped
 * rules, a written option, and a concrete rule index.
 */
export function probeSuggestions(
  sim: SimulationResult,
  layerByIndex: Map<number, ProvenanceLayer>,
): string[] {
  const suggestions: string[] = [];
  const presetNames = new Map<string, number>();
  for (const rule of sim.rules) {
    const layer = layerByIndex.get(rule.index);
    if (rule.verdict !== "matched" && layer?.kind === "preset") {
      presetNames.set(layer.name, (presetNames.get(layer.name) ?? 0) + 1);
    }
  }
  const [biggest] = [...presetNames.entries()].toSorted((a, b) => b[1] - a[1]);
  if (biggest) {
    suggestions.push(biggest[0]);
  }
  const written = sim.mergeSteps.find((s) => s.merged.length > 0)?.merged[0]?.key;
  if (written !== undefined && !suggestions.includes(written)) {
    suggestions.push(written);
  }
  const firstSkipped = sim.rules.find((rule) => rule.verdict !== "matched");
  if (firstSkipped) {
    suggestions.push(`packageRules[${firstSkipped.index}]`);
  }
  return suggestions;
}
