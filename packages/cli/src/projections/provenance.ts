import {
  computeProvenance,
  type KeyProvenance,
  type ProvenanceLayer,
  type ProvenanceStep,
  type TraceResult,
  UPDATE_TYPE_KEYS,
} from "@renovate-config-debugger/engine";
import { jsonEqual } from "@renovate-config-debugger/engine/json";
import {
  isOverridden,
  multiContribBadgeKind,
  plural,
} from "@renovate-config-debugger/app/headless";
import { CliError } from "../io";
import { preview } from "../output";

/** A provenance value states what the cut hid; the chain is one call away. */
const WITH_LENGTH = { withLength: true } as const;

/**
 * Per-key provenance, projected — shared by `rcd provenance` and the MCP
 * server's `get_provenance`.
 *
 * The badge comes from `multiContribBadgeKind`, not from "more than one layer
 * touched it": roadmap 016 established that calling an appended array
 * "overridden" is misleading, and the CLI must not re-learn that lesson
 * separately from the app.
 */

/**
 * The display name of ONE layer: `defaults`, `global`, `inherited`, `repo`, or
 * `preset <name>`. Every answer that names where a value came from prints this
 * — the override chain, the `packageRules` ranges, a matched rule's `origin`,
 * a dropped update-type block — so a layer reads the same on every surface.
 *
 * There is a SECOND layer vocabulary on this CLI, and the two are deliberately
 * not the same one. `--source` / the MCP `source` parameter takes
 * `repo | presets | all`: that is a CLASS of layer, not a layer — `presets` is
 * plural because it scopes to every preset at once, and it has no label
 * because no answer ever prints it as the writer of anything. Unifying them
 * would mean either inventing a `presets` layer that never wrote a value, or
 * making the facet name each preset (which is the drill-down `--rule` and
 * get_preset_node already are). `repo` is the one word both use, and it means
 * the same thing in both. Anything the facet does not cover — `defaults`,
 * `global`, `inherited` — is reachable only by reading the chain, which is why
 * the facet is documented as a scope over CONTRIBUTIONS rather than a filter
 * over layers. Ledgered rather than churned: the strings below are asserted by
 * the CLI suites, the MCP payload tests and the app's own ledger.
 */
export function layerLabel(layer: ProvenanceLayer): string {
  return layer.kind === "preset" ? `preset ${layer.name}` : layer.kind;
}

interface ChainStepBase {
  layer: string;
  action: ProvenanceStep["action"];
  /** The nested preset whose own body wrote the value, when the engine
   *  verified one — the layer is then only the direct extend it arrived
   *  through. */
  writtenBy?: string;
  expandedNested?: true;
}

/** A layer that replaced, merged into, or established the value: both sides. */
export interface SnapshotStep extends ChainStepBase {
  before: unknown;
  after: unknown;
}

/**
 * A layer that APPENDED to an array: what it added, not another copy of the
 * whole array.
 *
 * Roadmap 071. For a concatenating key every step's `before`/`after` is a
 * cumulative snapshot, so a chain over `packageRules` restated the merged array
 * once per layer — 733 kB on a `config:best-practices` run, of which the
 * transport's elider kept the first rule and the last. The slice is the
 * contribution; the totals say where it sits.
 */
export interface ConcatStep extends ChainStepBase {
  addedCount: number;
  added: unknown[];
  /** Length of the array after this step — the slice starts at
   *  `totalCount - addedCount`. */
  totalCount: number;
}

export type ProvenanceChainStep = SnapshotStep | ConcatStep;

export interface ProvenanceView {
  key: string;
  finalValue: unknown;
  isDefaultOnly: boolean;
  winner: string | null;
  badge: string | null;
  chain: ProvenanceChainStep[];
}

/** Whether `after` is `before` with elements appended — the property a concat
 *  step normally has, and the one an `expandedNested` rewrite can break. */
function appendsTo(before: unknown, after: unknown): before is unknown[] {
  if (!Array.isArray(before) || !Array.isArray(after) || after.length < before.length) {
    return false;
  }
  return jsonEqual(after.slice(0, before.length), before);
}

function stepView(step: KeyProvenance["chain"][number]): ProvenanceChainStep {
  const base: ChainStepBase = {
    layer: layerLabel(step.layer),
    action: step.action,
    ...(step.writtenBy ? { writtenBy: `preset ${step.writtenBy.name}` } : {}),
    ...(step.expandedNested ? { expandedNested: true as const } : {}),
  };
  if (step.action === "concat" && appendsTo(step.before, step.after) && Array.isArray(step.after)) {
    const added = step.after.slice(step.before.length);
    return { ...base, addedCount: added.length, added, totalCount: step.after.length };
  }
  // The prefix property failed (a nested-`extends` pass can rewrite `after`
  // wholesale) — the snapshots are then the only honest report.
  return { ...base, before: step.before, after: step.after };
}

export function entryView(entry: KeyProvenance): ProvenanceView {
  const winner = entry.chain.findLast((s) => !s.noop) ?? entry.chain.at(-1);
  return {
    key: entry.key,
    finalValue: entry.finalValue,
    isDefaultOnly: entry.isDefaultOnly,
    winner: winner ? layerLabel(winner.layer) : null,
    badge: isOverridden(entry) ? multiContribBadgeKind(entry) : null,
    chain: entry.chain.filter((step) => !step.noop).map(stepView),
  };
}

/** One chain step, as pretty output prints it — an appending layer states what
 *  it appended, everything else the value it left behind. */
export function chainStepText(step: ProvenanceChainStep, max = 80): string {
  return "added" in step
    ? `+${step.addedCount} → ${step.totalCount} total ${preview(step.added, max, WITH_LENGTH)}`
    : preview(step.after, max, WITH_LENGTH);
}

export interface ProvenanceIndexEntry {
  key: string;
  winner: string | null;
  badge: string | null;
  /** Layers that actually changed the value — the chain's length, unexpanded. */
  contributors: number;
  /** Enough of the final value to recognise it; the chain is one call away. */
  preview: string;
}

/**
 * The keyless answer: one line per key instead of every layer's before/after.
 *
 * A `config:recommended` run has ~200 keys with long override chains — the
 * full {@link entryView} of all of them is over half a megabyte, which is not
 * an answer, it is a haystack. This is the index; ask for a key to get its
 * chain.
 */
export function indexView(entry: KeyProvenance): ProvenanceIndexEntry {
  const view = entryView(entry);
  return {
    key: view.key,
    winner: view.winner,
    badge: view.badge,
    contributors: view.chain.length,
    preview: preview(entry.finalValue, 60, WITH_LENGTH),
  };
}

/**
 * Roadmap 068 (2026-07 persona study, 2 of 9 sessions, plus the review):
 * provenance answers "which LAYER set this option", and two personas read that
 * as "this is the value Renovate will use". For any key a packageRule can also
 * set, it is not: the layer chain produces the repository-wide value, and a
 * rule then overrides it for the dependencies it matches. Both personas
 * reported a static value as the effective one for an update it did not apply
 * to.
 *
 * Cheap and exact: the key appears inside a rule of the run's OWN final
 * `packageRules`, so the count is this config's, not Renovate's option
 * metadata. The clauses of those rules are the simulator's business, which is
 * what the note points at.
 *
 * A rule can also set the key INSIDE an update-type block (`minor:
 * {automerge: true}` is how `:automergeMinor` works) — replay-04's expert
 * read the note's absence on `automerge` as "no rule touches this", exactly
 * the misread the note exists to prevent, so nested writers count too and are
 * named as conditional.
 */
function setsNested(rule: Record<string, unknown>, key: string): boolean {
  return UPDATE_TYPE_KEYS.some((block) => {
    const nested = rule[block];
    return nested !== null && typeof nested === "object" && key in nested;
  });
}

export function perDependencyNote(
  key: string,
  finalConfig: Record<string, unknown> | undefined,
): string | undefined {
  if (key === "packageRules" || !Array.isArray(finalConfig?.packageRules)) {
    return undefined;
  }
  const rules = finalConfig.packageRules.filter(
    (rule): rule is Record<string, unknown> => rule !== null && typeof rule === "object",
  );
  const direct = rules.filter((rule) => key in rule).length;
  const nested = rules.filter((rule) => !(key in rule) && setsNested(rule, key)).length;
  const setters = direct + nested;
  if (setters === 0) {
    return undefined;
  }
  const which =
    nested === setters ? (setters === 1 ? "only" : "all of them only") : `${nested} of them only`;
  const nestedClause =
    nested === 0
      ? ""
      : ` (${which} inside an update-type block ` +
        "such as `minor: {…}`, which applies only when the update's type matches)";
  return (
    `${plural(setters, "packageRule")} can set \`${key}\` per-dependency` +
    `${nestedClause} — this ` +
    "chain is the repository-wide value. Simulate a dependency to see the value an actual " +
    "update would get."
  );
}

/** The run's provenance map, or a legible error explaining why there is none. */
export function provenanceOf(result: TraceResult): Map<string, KeyProvenance> {
  const provenance = computeProvenance(result);
  if (!provenance) {
    throw new CliError(
      "provenance needs a completed preset resolution — validate the config to see why it stopped",
    );
  }
  return provenance;
}
