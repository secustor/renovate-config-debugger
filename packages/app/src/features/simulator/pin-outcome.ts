import type {
  ProvenanceLayer,
  RuleAttribution,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { layerId, layerLabel } from "@/components/provenance-layer";
import { crossRuleIndex } from "@/lib/rule-cross-index";
import { hasEvaluationError, isNoInputNoMatch } from "@/lib/rule-verdict";
import { buildNoInputCaveat } from "@/lib/verdict-sentence";
import { ruleLabel } from "./rule-format";

/**
 * Roadmap 075 (iteration 6) — one pinned test's outcome, derived from the
 * simulation the pin produced.
 *
 * Everything here is a projection of data the simulator already renders, in the
 * wording it already uses: the chips read `finalDependencyConfig` exactly as
 * `buildVerdictSegments` does, a rule's one-line why is `ruleLabel`, the
 * honesty caveat is `buildNoInputCaveat`, and the buckets are cut with the
 * verdict vocabulary the rules drawer's filter facet is cut with
 * (`isNoInputNoMatch` / `hasEvaluationError`) and the provenance the chips wear
 * (`layerId` / `layerLabel`). A pin card is a smaller view of the verdict card,
 * never a second opinion about it.
 *
 * Pure and DOM-free.
 */

/** A header chip. The tones are the standard pill tones (075). */
export interface PinChip {
  tone: "accent" | "ok" | "muted" | "warn";
  label: string;
}

/** One rule the card names — the cross-link grammar the simulator's rows use:
 *  the merged index, the clause label, the layer (for a provenance chip), and
 *  the REPO index when the rule is one the reader wrote (what the editor jump
 *  needs). */
export interface PinRuleRef {
  index: number;
  label: string;
  layer?: ProvenanceLayer;
  repoIndex?: number;
}

/** A count-bucket of rules the card does not list one by one. */
export interface PinBucket {
  /** React key / test id — a layer id, or one of the two verdict buckets. */
  id: string;
  /** What this bucket is, as a noun phrase: "rules from X that didn’t match". */
  label: string;
  count: number;
  /** A few merged indexes, so the bucket can be opened for evidence. */
  samples: number[];
}

export interface PinOutcome {
  /** The updateType the simulation actually ran with. */
  updateType: string;
  chips: PinChip[];
  matched: PinRuleRef[];
  /** Rules the reader NAMED (their own repo config) that did not match. */
  failed: PinRuleRef[];
  buckets: PinBucket[];
  totalRules: number;
  /** Replay-02 R3's caveat, when this pin's own rules lost to an unset field —
   *  and what makes the card's dot amber rather than green. */
  caveat?: string;
}

/** At most four buckets — past that the collapse stops being a summary. */
const MAX_BUCKETS = 4;
/** How many rule references a bucket offers when opened. */
const MAX_SAMPLES = 4;

const NO_INPUT_BUCKET = "missing-input";
const ERROR_BUCKET = "not-evaluated";
const OTHER_BUCKET = "other-sources";

function ruleRef(
  rule: RuleEvaluation,
  layerByIndex: Map<number, ProvenanceLayer>,
  attribution: RuleAttribution[] | null | undefined,
): PinRuleRef {
  const layer = layerByIndex.get(rule.index);
  const repoIndex = crossRuleIndex("merged", rule.index, attribution);
  return {
    index: rule.index,
    label: ruleLabel(rule),
    ...(layer ? { layer } : {}),
    ...(repoIndex === undefined ? {} : { repoIndex }),
  };
}

/**
 * The header chips. The strongest signal first — an update Renovate would not
 * raise at all — then the two the design names (grouped, automerge), then the
 * honest fallback when the matched rules changed nothing worth a chip.
 */
function buildChips(sim: SimulationResult): PinChip[] {
  const config = sim.finalDependencyConfig;
  const chips: PinChip[] = [];
  const skipReason = typeof config.skipReason === "string" ? config.skipReason : undefined;
  if (config.enabled === false || skipReason !== undefined) {
    chips.push({ tone: "warn", label: skipReason ? `skipped: ${skipReason}` : "disabled" });
  }
  const groupName = typeof config.groupName === "string" ? config.groupName : "";
  if (groupName !== "") {
    chips.push({ tone: "accent", label: `grouped: ${groupName}` });
  }
  if (config.automerge === true) {
    chips.push({ tone: "ok", label: "automerge ✓" });
  }
  if (chips.length === 0) {
    chips.push({ tone: "muted", label: "default behavior" });
  }
  return chips;
}

/**
 * The buckets, cut in this order so the count always adds up and no rule is
 * counted twice:
 *
 *  1. the rules the tool could not evaluate (a matcher threw — roadmap 073),
 *  2. the rules that failed only because a field was unset (`no-input`),
 *  3. everything else, by the layer that contributed it — the same provenance
 *     the rule rows' chips wear, most-contributing first.
 *
 * Without provenance (a run with no completed preset resolution) step 3 has
 * nothing to group by, and the whole remainder is one honest bucket rather than
 * a classification the run does not support.
 */
function buildBuckets(
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
): PinBucket[] {
  const specials = new Map<string, PinBucket>();
  const byLayer = new Map<string, PinBucket>();
  const add = (map: Map<string, PinBucket>, id: string, label: string, index: number) => {
    const entry = map.get(id) ?? { id, label, count: 0, samples: [] };
    entry.count += 1;
    if (entry.samples.length < MAX_SAMPLES) {
      entry.samples.push(index);
    }
    map.set(id, entry);
  };
  for (const rule of rules) {
    if (hasEvaluationError(rule)) {
      add(specials, ERROR_BUCKET, "rules the tool could not evaluate", rule.index);
      continue;
    }
    if (isNoInputNoMatch(rule)) {
      add(specials, NO_INPUT_BUCKET, "rules missing an input", rule.index);
      continue;
    }
    const layer = layerByIndex.get(rule.index);
    if (!layer) {
      add(byLayer, OTHER_BUCKET, "preset rules that didn’t match", rule.index);
      continue;
    }
    add(byLayer, layerId(layer), `rules from ${layerLabel(layer)} that didn’t match`, rule.index);
  }
  // A fixed order for the two verdict buckets — "missing an input" first,
  // because it is the one a reader can act on — so the list a card renders does
  // not depend on which rule happened to come first in the run.
  const verdictBuckets = [specials.get(NO_INPUT_BUCKET), specials.get(ERROR_BUCKET)].filter(
    (bucket) => bucket !== undefined,
  );
  const layered = [...byLayer.values()].toSorted((a, b) => b.count - a.count);
  const room = MAX_BUCKETS - verdictBuckets.length;
  if (layered.length > room) {
    // The tail is rolled into one bucket rather than truncated — a count that
    // does not add up to the rule total is worse than a coarser label.
    const kept = layered.slice(0, Math.max(room - 1, 0));
    const rolled = layered.slice(kept.length);
    const rest: PinBucket = {
      id: OTHER_BUCKET,
      label: "rules from other sources that didn’t match",
      count: rolled.reduce((sum, bucket) => sum + bucket.count, 0),
      samples: rolled.flatMap((bucket) => bucket.samples).slice(0, MAX_SAMPLES),
    };
    return [...kept, rest, ...verdictBuckets];
  }
  return [...layered, ...verdictBuckets];
}

export function buildPinOutcome(
  sim: SimulationResult,
  layerByIndex: Map<number, ProvenanceLayer>,
  attribution: RuleAttribution[] | null | undefined,
): PinOutcome {
  const matched: PinRuleRef[] = [];
  const failed: PinRuleRef[] = [];
  const skipped: RuleEvaluation[] = [];
  for (const rule of sim.rules) {
    if (rule.verdict === "matched") {
      matched.push(ruleRef(rule, layerByIndex, attribution));
      continue;
    }
    // The reader's OWN rules are named one by one: "why didn't MY rule fire" is
    // the question a pin exists to answer, and a bucket cannot answer it.
    if (layerByIndex.get(rule.index)?.kind === "repo") {
      failed.push(ruleRef(rule, layerByIndex, attribution));
      continue;
    }
    skipped.push(rule);
  }
  const caveat = buildNoInputCaveat(sim, attribution);
  return {
    updateType: sim.flattened.updateType ?? "",
    chips: buildChips(sim),
    matched,
    failed,
    buckets: buildBuckets(skipped, layerByIndex),
    totalRules: sim.rules.length,
    ...(caveat === undefined ? {} : { caveat }),
  };
}
