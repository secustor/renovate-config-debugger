import type {
  ClauseEvaluation,
  ProvenanceLayer,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { overridingStopIndex } from "./merge-override";
import type { MergeStop } from "./merge-stops";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { stopLabels } from "./verdict-threads";

/**
 * Roadmap 054 (variant A), layer 3: everything the rule popover states about
 * ONE rule — its clause evidence, where it merged, and what each of its writes
 * was worth by the end of the run.
 *
 * The popover is opened from a thread's override line, i.e. from a write that
 * LOST; the whole point is that the reader can then see the rule's other writes
 * too, most of which usually survived. So a write is classified against the
 * stops that came after it: the first later stop naming the same key is the one
 * that took it away ("overridden in step M"), and a key no later stop names
 * reached the final config.
 *
 * Pure derivation over the last RUN — same discipline as `verdict-threads.ts`,
 * and it borrows that module's `stopLabels` so a stop is never named two ways.
 */

/** One key this rule merged, and what became of it. */
export interface RuleWrite {
  key: string;
  /** The value the key held going into this merge. */
  before: unknown;
  /** The engine omits `before` when the key did not exist yet — the difference
   *  between "changed x" and "added x", which the digest's mark states. */
  hadBefore: boolean;
  after: unknown;
  /** The engine omits `after` when the merge REMOVED the key. */
  hadAfter: boolean;
  /** True when no later stop wrote this key — i.e. this write is what the
   *  final per-dependency config carries. */
  survived: boolean;
  /** The prose name of the stop that took the key away, when one did
   *  ("step 3 of 4", "flatten step"). */
  overriddenAtLabel?: string;
}

/** The popover's whole model. `stopLabel` is absent for a rule that never
 *  merged anything (no stop of its own) — the card then states the clause
 *  evidence alone. */
export interface RuleEvidence {
  ruleIndex: number;
  verdict?: RuleEvaluation["verdict"];
  layer?: ProvenanceLayer;
  /** Roadmap 069 (PR 5): the rule author's own description, on a rule that
   *  matched and has one — the card's answer to "why does this rule exist". */
  description?: RuleDescriptionNote;
  clauses: ClauseEvaluation[];
  /** The prose name of the stop this rule merged at; absent when it never
   *  merged (see this interface's note). */
  stopLabel?: string;
  writes: RuleWrite[];
  /** How many of `writes` reached the final config. */
  survivedCount: number;
}

/** The first stop AFTER `stopIndex` that names `key` — the write's killer.
 *  Shared with `pin-outcome.ts`, which asks the same question about the same
 *  run and must not be able to answer it differently. */
const overriderOf = overridingStopIndex;

export function buildRuleEvidence(
  ruleIndex: number,
  mergeStops: MergeStop[],
  layerByIndex: Map<number, ProvenanceLayer>,
  sim: SimulationResult | null,
  /** Roadmap 069 (PR 5): the run's rule descriptions, by merged rule index. */
  descriptionByIndex?: ReadonlyMap<number, RuleDescriptionNote>,
): RuleEvidence {
  const labels = stopLabels(mergeStops);
  const stopIndex = mergeStops.findIndex((s) => s.kind === "rule" && s.ruleIndex === ruleIndex);
  const rule = sim?.rules.find((r) => r.index === ruleIndex);
  // Only a matched rule quotes its author: this card is reachable for a rule
  // that merged, but the wording ("why this rule exists") is a claim about a
  // rule that DID something.
  const description = rule?.verdict === "matched" ? descriptionByIndex?.get(ruleIndex) : undefined;
  const base: RuleEvidence = {
    ruleIndex,
    verdict: rule?.verdict,
    layer: layerByIndex.get(ruleIndex),
    ...(description ? { description } : {}),
    clauses: rule?.clauses ?? [],
    writes: [],
    survivedCount: 0,
  };
  if (stopIndex === -1) {
    return base;
  }
  const label = labels[stopIndex];
  const writes: RuleWrite[] = (mergeStops[stopIndex]?.merged ?? []).map((entry) => {
    const overriddenAt = overriderOf(mergeStops, stopIndex, entry.key);
    const overrider = overriddenAt === undefined ? undefined : labels[overriddenAt];
    return {
      key: entry.key,
      before: entry.before,
      hadBefore: Object.hasOwn(entry, "before"),
      after: entry.after,
      hadAfter: Object.hasOwn(entry, "after"),
      survived: overriddenAt === undefined,
      overriddenAtLabel: overrider?.label,
    };
  });
  return {
    ...base,
    stopLabel: label?.label,
    writes,
    survivedCount: writes.filter((w) => w.survived).length,
  };
}
