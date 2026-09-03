import type {
  ClauseEvaluation,
  MergedKey,
  ProvenanceLayer,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { jsonEqual } from "@renovate-config-debugger/engine/json";
import type { MergeStop } from "./merge-stops";

/**
 * Roadmap 054 (variant A): the causal thread behind every setting the rules
 * changed. The engine already records everything a thread needs — each
 * `mergeSteps[i].merged` names the keys that merge set/changed WITH their
 * before/after, the steps are contiguous snapshots in merge order, and
 * `RuleEvaluation.clauses` holds the per-rule predicate evidence — so this is
 * pure derivation over the last RUN, no engine change and no UI knowledge.
 *
 * Later merges win, so per key the LAST stop naming it is the winner and every
 * earlier one is an override it beat. `VerdictThreads.tsx` renders the
 * collapsed head and the disclosed body from this one model, so they can never
 * disagree about who wrote what.
 */

/** The stop that had the last word on a key. */
export interface ThreadWinner {
  kind: "rule" | "flatten";
  /** `kind: "rule"` only — the rule's position in `packageRules`. */
  ruleIndex?: number;
  /** The layer that owns the winning rule (never set for a flatten stop). */
  layer?: ProvenanceLayer;
  /** The winning rule's clause evidence; empty for a flatten stop, which has
   *  the 047 update-type story instead. */
  clauses: ClauseEvaluation[];
  /** Position in the merge replay, for the "step N of M →" jump. */
  stopIndex: number;
  stopLabel: string;
}

/** A writer the winner beat — its value never reached the final config. */
export interface ThreadOverride {
  kind: "writer";
  /** What this stop wrote (its `merged` entry's `after`) — the lost value. */
  value: unknown;
  ruleIndex?: number;
  layer?: ProvenanceLayer;
  stopIndex: number;
  stopLabel: string;
}

/**
 * The value the key held before any rule ran (the earliest writer's `merged`
 * entry's `before`), which terminates every cascade.
 *
 * There is deliberately no field distinguishing "the config's layers set this"
 * from "this is Renovate's own default": no engine surface carries the resolved
 * default config into the app today (047's `authoredBlocks` compares against
 * `getDefaultConfig()` INSIDE the engine and exports only the verdict, and
 * `getOptionIndex()`'s per-option `default` is documentation metadata behind
 * the lazily-loaded engine chunk), so every base value would answer the same
 * way. Add one when an engine surface can tell them apart.
 */
export interface ThreadBase {
  kind: "base";
  value: unknown;
  /** False when the key did not exist at all before the rules ran. */
  present: boolean;
}

/** The cascade under a thread: lost writers newest first, then the base. */
export type ThreadEntry = ThreadOverride | ThreadBase;

/**
 * How the winner wrote the key — the verb carries the merge semantics, so the
 * thread needs no explanatory aside. `appended` is Renovate's concat-merge of
 * array keys, detected as "before is a strict prefix of after".
 */
export type ThreadVerb = "set" | "appended" | "removed";

/** One changed setting, with its whole causal thread. */
export interface ThreadModel {
  key: string;
  /** The value in `finalDependencyConfig` (undefined when removed). */
  finalValue: unknown;
  present: boolean;
  verb: ThreadVerb;
  /** Absent only for a key no merge stop names (nothing to attribute). */
  winner?: ThreadWinner;
  overrides: ThreadEntry[];
  /** How many rule/flatten stops wrote this key — `1` means uncontested. */
  writerCount: number;
}

/** How one merge stop is named in prose — shared with `rule-evidence.ts`, so
 *  the popover and the thread cannot name the same stop differently. */
export interface StopLabel {
  ordinal?: number;
  label: string;
}

/** One writer of a key: the stop, where it sits, and what it wrote. */
interface Writer {
  stopIndex: number;
  stop: MergeStop;
  entry: MergedKey;
}

/**
 * Roadmap 046's stop naming, computed once per stop list instead of per key:
 * rule stops count among themselves ("step 2 of 5"), the flatten stop is named
 * rather than numbered.
 */
export function stopLabels(mergeStops: MergeStop[]): StopLabel[] {
  const nRuleStops = mergeStops.filter((s) => s.kind === "rule").length;
  let ordinal = 0;
  return mergeStops.map((stop) => {
    if (stop.kind === "rule") {
      ordinal += 1;
      return { ordinal, label: `step ${ordinal} of ${nRuleStops}` };
    }
    return { label: stop.kind === "flatten" ? "flatten step" : stop.kind };
  });
}

/**
 * Renovate concat-merges array options, so a rule that "appended" leaves the
 * previous value as a strict prefix of the new one. If this heuristic ever
 * misfires the fix is an engine-side `MergedKey.mode` tag, not more guesswork
 * here.
 */
function isAppend(entry: MergedKey): boolean {
  const { before, after } = entry;
  if (!Array.isArray(before) || !Array.isArray(after) || before.length >= after.length) {
    return false;
  }
  return before.every((item, i) => jsonEqual(item, after[i]));
}

function layerOf(
  stop: MergeStop,
  layerByIndex: Map<number, ProvenanceLayer>,
): ProvenanceLayer | undefined {
  if (stop.kind !== "rule" || stop.ruleIndex === undefined) {
    return undefined;
  }
  return layerByIndex.get(stop.ruleIndex);
}

function buildWinner(
  writer: Writer,
  labels: StopLabel[],
  layerByIndex: Map<number, ProvenanceLayer>,
  sim: SimulationResult | null,
): ThreadWinner {
  const { stop, stopIndex } = writer;
  const label = labels[stopIndex];
  const rule =
    stop.ruleIndex === undefined ? undefined : sim?.rules.find((r) => r.index === stop.ruleIndex);
  return {
    kind: stop.kind === "flatten" ? "flatten" : "rule",
    ruleIndex: stop.ruleIndex,
    layer: layerOf(stop, layerByIndex),
    clauses: stop.kind === "rule" ? (rule?.clauses ?? []) : [],
    stopIndex,
    stopLabel: label?.label ?? "merge step",
  };
}

function buildOverrides(
  writers: Writer[],
  labels: StopLabel[],
  layerByIndex: Map<number, ProvenanceLayer>,
): ThreadEntry[] {
  // Every writer except the winner, newest first — each showing the value it
  // wrote and lost.
  const entries: ThreadEntry[] = writers
    .slice(0, -1)
    .toReversed()
    .map(({ stop, stopIndex, entry }) => ({
      kind: "writer" as const,
      value: entry.after,
      ruleIndex: stop.ruleIndex,
      layer: layerOf(stop, layerByIndex),
      stopIndex,
      stopLabel: labels[stopIndex]?.label ?? "merge step",
    }));
  const first = writers[0];
  if (first) {
    // The steps are contiguous, so the EARLIEST writer's `before` is the value
    // the key held when the rules started.
    entries.push({
      kind: "base",
      value: first.entry.before,
      present: Object.hasOwn(first.entry, "before"),
    });
  }
  return entries;
}

/**
 * Roadmap 054: one thread per changed key. `changedKeys` is the caller's
 * base→final diff (a key can be changed without any stop naming it — e.g. one
 * the flatten pass merely dropped), so a thread may legitimately have no
 * winner and an empty cascade.
 */
export function buildVerdictThreads(
  changedKeys: string[],
  mergeStops: MergeStop[],
  layerByIndex: Map<number, ProvenanceLayer>,
  sim: SimulationResult | null,
): ThreadModel[] {
  const labels = stopLabels(mergeStops);
  return changedKeys.map((key) => {
    const writers: Writer[] = [];
    for (const [stopIndex, stop] of mergeStops.entries()) {
      const entry = stop.merged?.find((m) => m.key === key);
      if (entry) {
        writers.push({ stopIndex, stop, entry });
      }
    }
    const last = writers.at(-1);
    const present = sim ? key in sim.finalDependencyConfig : false;
    // Mutually exclusive in practice: a winner that appended left an array
    // behind, so the key is present.
    let verb: ThreadVerb = "set";
    if (!present) {
      verb = "removed";
    } else if (last && isAppend(last.entry)) {
      verb = "appended";
    }
    return {
      key,
      finalValue: sim?.finalDependencyConfig[key],
      present,
      verb,
      winner: last ? buildWinner(last, labels, layerByIndex, sim) : undefined,
      overrides: buildOverrides(writers, labels, layerByIndex),
      writerCount: writers.length,
    };
  });
}
