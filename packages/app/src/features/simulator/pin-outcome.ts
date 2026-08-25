import type {
  ClauseEvaluation,
  MergeStep,
  ProvenanceLayer,
  RuleAttribution,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { nf, pluralWord } from "@/lib/format";
import { crossRuleIndex } from "@/lib/rule-cross-index";
import { hasEvaluationError, isNoInputNoMatch } from "@/lib/rule-verdict";
import { buildNoInputCaveat } from "@/lib/verdict-sentence";
import { overridingStopIndex } from "./merge-override";
import { clauseEvaluated, previewValue, ruleLabel } from "./rule-format";
import { ruleRef } from "@/lib/rule-ref";

/**
 * One pinned test's outcome, derived from the simulation the pin produced —
 * shaped as the design's skip-reason funnel (Proposal F / "Skip Reason
 * Funnel"): the matched rules with what each wrote and whether it survived,
 * the reader's own rules named one by one with their matcher checklists, and
 * the rest of the run collapsed into buckets BY REASON — the monorepo family
 * sweep, the replacement rules, and "a matcher on a different axis" — rather
 * than by contributing layer.
 *
 * Everything here is a projection of data the simulator already renders, in
 * the wording it already uses: a clause row is `clauseEvaluated`, a rule's
 * one-line why is `ruleLabel`, the honesty caveat is `buildNoInputCaveat`, and
 * the verdict specials are cut with the same vocabulary as the rules drawer's
 * filter facet (`isNoInputNoMatch` / `hasEvaluationError`). A pin card is a
 * smaller view of the verdict card, never a second opinion about it.
 *
 * Pure and DOM-free.
 */

/** A header chip. The tones are the standard pill tones (075). */
export interface PinChip {
  tone: "accent" | "ok" | "muted" | "warn";
  label: string;
}

/** One key a matched rule wrote, and what became of it downstream. */
export interface PinWrite {
  key: string;
  /** The value the rule left on the config, as display JSON. */
  valueText: string;
  survived: boolean;
  /** Who took the key away — `packageRules[M]`, or the flatten step. */
  overriddenBy?: string;
}

/** One rule the card names, in the simulator's cross-link grammar: the merged
 *  index, the clause label, the layer (for a provenance chip), and the REPO
 *  index when the rule is one the reader wrote (what the editor jump needs). */
export interface PinRuleRef {
  index: number;
  label: string;
  layer?: ProvenanceLayer;
  repoIndex?: number;
  /** The full matcher checklist, for the expandable evidence box. */
  clauses: ClauseEvaluation[];
}

export interface PinMatchedRule extends PinRuleRef {
  writes: PinWrite[];
  /** The right-hand summary — `groupName · wins`, `2 keys · 1 wins`, … */
  wroteSummary: string;
  /** The merge-order note under the writes — who this rule beat, or who beat
   *  it. Absent when nothing else touched its keys. */
  conflictNote?: string;
}

export interface PinFailedRule extends PinRuleRef {
  /** A one-edit fix when one exists: the single failing clause, and the value
   *  that would make it match. */
  closestMiss?: { clauseKey: string; suggestion: string };
}

/** One expandable line inside a bucket. */
export interface PinBucketRow {
  key: string;
  /** The mono label — a preset name, or `packageRules[N]`. */
  label: string;
  note: string;
  /** What the row hands the probe input. */
  probeQuery: string;
}

/** A count-bucket of rules the card does not list one by one — a REASON, not
 *  a layer: the design's funnel collapses by why the rules were skipped. */
export interface PinBucket {
  id: string;
  count: number;
  reason: string;
  /** The right-hand attribution — `monorepo:* presets`, … */
  source: string;
  rows: PinBucketRow[];
  /** The honest tail line when the rows are a sample, not the list. */
  more?: string;
}

export interface PinOutcome {
  /** The updateType the simulation actually ran with. */
  updateType: string;
  chips: PinChip[];
  /** The header's outcome phrase — the chips joined into one line. */
  headline: string;
  matched: PinMatchedRule[];
  /** Rules the reader NAMED (their own repo config) that did not match. */
  failed: PinFailedRule[];
  buckets: PinBucket[];
  totalRules: number;
  /** Everything that didn't match — the failed rules included, because they
   *  are named instead of bucketed, not excluded from the count. */
  skippedCount: number;
  /** Replay-02 R3's caveat, when this pin's own rules lost to an unset field —
   *  and what makes the card's dot amber rather than green. */
  caveat?: string;
}

/** How many rows a bucket shows before the honest tail line. */
const MAX_BUCKET_ROWS = 3;

/** The card's own cross-link record for a rule. Named `pinRuleRef` rather than
 *  `ruleRef` since the latter is now the shared `packageRules[N]` spelling —
 *  this one builds the {@link PinRuleRef} OBJECT, not the label. */
function pinRuleRef(
  rule: RuleEvaluation,
  layerByIndex: Map<number, ProvenanceLayer>,
  attribution: RuleAttribution[] | null | undefined,
): PinRuleRef {
  const layer = layerByIndex.get(rule.index);
  const repoIndex = crossRuleIndex("merged", rule.index, attribution);
  return {
    index: rule.index,
    label: ruleLabel(rule),
    clauses: rule.clauses,
    ...(layer ? { layer } : {}),
    ...(repoIndex === undefined ? {} : { repoIndex }),
  };
}

/**
 * The header chips. The strongest signal first — an update Renovate would not
 * raise at all — then the two the design names (grouped, automerge), then the
 * honest fallback when the matched rules changed nothing worth a chip.
 */
function buildChips(sim: SimulationResult, matchedCount: number): PinChip[] {
  const config = sim.finalDependencyConfig;
  const chips: PinChip[] = [];
  const skipReason = typeof config.skipReason === "string" ? config.skipReason : undefined;
  if (config.enabled === false || skipReason !== undefined) {
    chips.push({ tone: "warn", label: skipReason ? `skipped: ${skipReason}` : "disabled" });
  }
  const groupName = typeof config.groupName === "string" ? config.groupName : "";
  if (groupName !== "") {
    chips.push({ tone: "accent", label: `grouped as “${groupName}”` });
  }
  if (config.automerge === true) {
    chips.push({ tone: "ok", label: "automerge ✓" });
  }
  if (chips.length === 0) {
    chips.push(
      matchedCount === 0
        ? { tone: "warn", label: "0 matched — defaults apply" }
        : { tone: "muted", label: "default behavior" },
    );
  }
  return chips;
}

/** The step that will be blamed for overriding a write — a rule by its index,
 *  the flatten step by what it is. */
function stepName(step: MergeStep): string {
  // `ruleIndex` is optional on every `MergeStep` in the engine's types, so the
  // `kind` check alone does not narrow it. A rule step always carries one; the
  // fallback exists because the type says it might not, and "a later rule" is
  // the honest thing to blame when the index is unknown — the previous inline
  // template would have blamed `packageRules[undefined]`.
  if (step.kind !== "rule") {
    return "the update-type flatten step";
  }
  return step.ruleIndex === undefined ? "a later rule" : ruleRef(step.ruleIndex);
}

/**
 * What one matched rule wrote and what became of it: each merged key checked
 * against the LATER merge steps (the first later step naming the same key is
 * the one that took it away — the same walk `rule-evidence.ts` does for the
 * popover), summarized for the row's right edge, plus the merge-order note the
 * design's evidence box ends with.
 */
function buildWrites(
  ruleIndex: number,
  mergeSteps: MergeStep[],
): Pick<PinMatchedRule, "writes" | "wroteSummary" | "conflictNote"> {
  const stopIndex = mergeSteps.findIndex((s) => s.kind === "rule" && s.ruleIndex === ruleIndex);
  const step = stopIndex === -1 ? undefined : mergeSteps[stopIndex];
  if (!step || step.merged.length === 0) {
    return { writes: [], wroteSummary: "no writes" };
  }
  const writes: PinWrite[] = step.merged.map((entry) => {
    // The same walk `rule-evidence.ts` does, and now literally the same code:
    // the popover and this card must agree on which step won a key.
    const overriderAt = overridingStopIndex(mergeSteps, stopIndex, entry.key);
    const overrider = overriderAt === undefined ? undefined : mergeSteps[overriderAt];
    return {
      key: entry.key,
      valueText: Object.hasOwn(entry, "after") ? previewValue(entry.after, 60) : "(removed)",
      survived: overrider === undefined,
      ...(overrider === undefined ? {} : { overriddenBy: stepName(overrider) }),
    };
  });
  const survived = writes.filter((w) => w.survived);
  const first = writes[0];
  const wroteSummary =
    writes.length === 1 && first
      ? `${first.key} · ${first.survived ? "wins" : "overridden below"}`
      : `${writes.length} keys · ${survived.length === writes.length ? "win" : `${survived.length} win`}`;
  // The note states the conflict this rule is part of, if any: who rewrote its
  // keys, or — when everything survived — whose earlier write it rewrote.
  const lost = writes.find((w) => !w.survived);
  if (lost?.overriddenBy !== undefined) {
    return {
      writes,
      wroteSummary,
      conflictNote: `${lost.overriddenBy} runs later and rewrote ${lost.key}.`,
    };
  }
  const beaten = mergeSteps
    .slice(0, stopIndex)
    .find((earlier) => earlier.merged.some((m) => writes.some((w) => w.key === m.key)));
  if (beaten) {
    const key = writes.find((w) => beaten.merged.some((m) => m.key === w.key));
    return {
      writes,
      wroteSummary,
      conflictNote: `Applied later — its ${key?.key ?? "write"} wins over ${stepName(beaten)}.`,
    };
  }
  return { writes, wroteSummary };
}

/**
 * The one-edit fix, when one exists: exactly one clause failed, it checks a
 * list of strings, and the update's actual value is a single string — so
 * appending that value to the list is a change the reader can make and this
 * rule matches. Anything less clear-cut offers no suggestion rather than a
 * guess — including a rule that ALSO lost a fail-closed `no-input` clause,
 * because "and this rule matches" would be a false promise there.
 */
function closestMiss(rule: RuleEvaluation): PinFailedRule["closestMiss"] {
  const failing = rule.clauses.filter(
    (c) => c.state === "no-match" || c.state === "no-input" || c.state === "error",
  );
  const only = failing[0];
  if (failing.length !== 1 || !only || only.state !== "no-match") {
    return undefined;
  }
  const value = only.value;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    return undefined;
  }
  const inputs = Object.values(only.inputValues);
  const actual = inputs[0];
  if (inputs.length !== 1 || typeof actual !== "string") {
    return undefined;
  }
  return {
    clauseKey: only.key,
    suggestion: JSON.stringify([...value, actual]),
  };
}

/** The clause that decided a no-match, spelled the way a bucket row cites it:
 *  `matchManagers: ["dockerfile"] — no match against manager = "npm"`. */
function failingClauseNote(rule: RuleEvaluation): string {
  const failing = rule.clauses.find(
    (c) => c.state === "no-match" || c.state === "no-input" || c.state === "error",
  );
  if (!failing) {
    return ruleLabel(rule);
  }
  const evaluated = clauseEvaluated(failing);
  const value = evaluated.value === undefined ? "" : ` ${evaluated.value}`;
  return `${failing.key}: ${previewValue(failing.value, 32)} — ${evaluated.text}${value}`;
}

/** The `match*` axis a clause checks, as the plain word the bucket reason
 *  uses — `matchManagers` → `manager`. */
function clauseAxis(key: string): string {
  const stripped = key.replace(/^match/, "").replace(/^exclude/, "");
  const spaced = stripped.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  // The registry's plural keys name the axis in the singular.
  return spaced.replace(/ies$/, "y").replace(/s$/, "");
}

function failingAxis(rule: RuleEvaluation): string | undefined {
  const failing = rule.clauses.find((c) => c.state === "no-match" || c.state === "error");
  return failing ? clauseAxis(failing.key) : undefined;
}

/** The preset family a name belongs to (`monorepo:angular` → `monorepo`), or
 *  undefined for a non-preset layer. */
function presetFamily(layer: ProvenanceLayer | undefined): string | undefined {
  if (layer?.kind !== "preset") {
    return undefined;
  }
  const colon = layer.name.indexOf(":");
  return colon === -1 ? undefined : layer.name.slice(0, colon);
}

interface FamilyGroup {
  name: string;
  rules: RuleEvaluation[];
}

/** Group rules by their preset's full name, biggest family first. */
function groupByPreset(
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
): FamilyGroup[] {
  const byName = new Map<string, FamilyGroup>();
  for (const rule of rules) {
    const layer = layerByIndex.get(rule.index);
    const name = layer?.kind === "preset" ? layer.name : "(unknown preset)";
    const group = byName.get(name) ?? { name, rules: [] };
    group.rules.push(rule);
    byName.set(name, group);
  }
  return [...byName.values()].toSorted((a, b) => b.rules.length - a.rules.length);
}

function familyBucket(
  id: string,
  reason: string,
  source: string,
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
): PinBucket {
  const groups = groupByPreset(rules, layerByIndex);
  const rows: PinBucketRow[] = groups.slice(0, MAX_BUCKET_ROWS).map((group) => {
    const [first] = group.rules;
    const count = group.rules.length;
    return {
      key: group.name,
      label: group.name,
      note: `${count} ${pluralWord(count, "rule")} — ${first ? failingClauseNote(first) : ""}`,
      probeQuery: group.name,
    };
  });
  const hidden = groups.length - rows.length;
  return {
    id,
    count: rules.length,
    reason,
    source,
    rows,
    ...(hidden > 0
      ? { more: `${hidden} more famil${hidden === 1 ? "y" : "ies"}, sorted by rule count` }
      : {}),
  };
}

function sampleBucket(
  id: string,
  reason: string,
  source: string,
  rules: RuleEvaluation[],
): PinBucket {
  const rows: PinBucketRow[] = rules.slice(0, MAX_BUCKET_ROWS).map((rule) => ({
    key: `rule-${rule.index}`,
    label: ruleRef(rule.index),
    note: failingClauseNote(rule),
    probeQuery: ruleRef(rule.index),
  }));
  const hidden = rules.length - rows.length;
  return {
    id,
    count: rules.length,
    reason,
    source,
    rows,
    ...(hidden > 0 ? { more: `${hidden} more — probe below to inspect any of them` } : {}),
  };
}

/** The distinct axes the remainder failed on, for the bucket's reason line —
 *  `matcher on a different axis (manager, datasource)`. */
function axisReason(rules: RuleEvaluation[]): string {
  const axes: string[] = [];
  for (const rule of rules) {
    const axis = failingAxis(rule);
    if (axis !== undefined && !axes.includes(axis)) {
      axes.push(axis);
    }
    if (axes.length === 3) {
      break;
    }
  }
  return axes.length === 0
    ? "matcher on a different axis"
    : `matcher on a different axis (${axes.join(", ")})`;
}

/**
 * The buckets, cut by REASON in the funnel's order, so the count always adds
 * up and no rule is counted twice:
 *
 *  1. monorepo-family rules (`monorepo:*` presets) — the bulk of every run,
 *  2. replacement rules (`replacements:*` presets),
 *  3. everything else that mismatched real data, by failing axis,
 *  4. the rules that failed only because a field was unset (`no-input`),
 *  5. the rules the tool could not evaluate (a matcher threw — roadmap 073).
 */
/**
 * The no-input bucket's rows come from the engine's own per-field summary
 * (`simulate-missing-inputs.ts`) rather than a rule sample: the actionable
 * fact is WHICH unset field would buy the reader how many rules, not which
 * rule happened to come first. A rule with two no-input clauses appears in
 * two groups upstream, so the bucket's count stays the deduped rule count.
 */
function missingInputBucket(
  noInput: RuleEvaluation[],
  missingInputs: SimulationResult["missingInputs"],
): PinBucket {
  const groups = missingInputs.groups.slice(0, MAX_BUCKET_ROWS);
  const rows: PinBucketRow[] = groups.map((group) => ({
    key: group.fieldList,
    label: group.fieldList,
    note: `${group.rules} ${pluralWord(group.rules, "rule")} read it — set it on this test to evaluate them for real (${group.selectors.join(", ")})`,
    probeQuery: group.selectors[0] ?? group.fieldList,
  }));
  const hidden = missingInputs.groups.length - groups.length;
  return {
    id: "missing-input",
    count: noInput.length,
    reason: "matcher input not set on this simulation",
    source: "fail-closed matchers",
    rows,
    ...(hidden > 0 ? { more: `${hidden} more ${pluralWord(hidden, "field group")}` } : {}),
  };
}

function buildBuckets(
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
  depName: string,
  missingInputs: SimulationResult["missingInputs"],
): PinBucket[] {
  const monorepo: RuleEvaluation[] = [];
  const replacements: RuleEvaluation[] = [];
  const noInput: RuleEvaluation[] = [];
  const errored: RuleEvaluation[] = [];
  const rest: RuleEvaluation[] = [];
  for (const rule of rules) {
    if (hasEvaluationError(rule)) {
      errored.push(rule);
      continue;
    }
    if (isNoInputNoMatch(rule)) {
      noInput.push(rule);
      continue;
    }
    const family = presetFamily(layerByIndex.get(rule.index));
    if (family === "monorepo") {
      monorepo.push(rule);
    } else if (family === "replacements") {
      replacements.push(rule);
    } else {
      rest.push(rule);
    }
  }
  const buckets: PinBucket[] = [];
  if (monorepo.length > 0) {
    buckets.push(
      familyBucket(
        "monorepo",
        "package not in the rule’s monorepo family",
        "monorepo:* presets",
        monorepo,
        layerByIndex,
      ),
    );
  }
  if (replacements.length > 0) {
    buckets.push(
      familyBucket(
        "replacements",
        depName === ""
          ? "replacement rules for renamed packages"
          : `replacement rules — ${depName} hasn’t been renamed`,
        "replacements:* presets",
        replacements,
        layerByIndex,
      ),
    );
  }
  if (rest.length > 0) {
    buckets.push(sampleBucket("other-axis", axisReason(rest), "presets & other layers", rest));
  }
  if (noInput.length > 0) {
    buckets.push(missingInputBucket(noInput, missingInputs));
  }
  if (errored.length > 0) {
    buckets.push(
      sampleBucket("not-evaluated", "rules the tool could not evaluate", "matcher errors", errored),
    );
  }
  return buckets;
}

export function buildPinOutcome(
  sim: SimulationResult,
  layerByIndex: Map<number, ProvenanceLayer>,
  attribution: RuleAttribution[] | null | undefined,
  /** What the funnel calls the dependency — for the replacements bucket's
   *  "{dep} hasn't been renamed" reason. */
  depName = "",
): PinOutcome {
  const matched: PinMatchedRule[] = [];
  const failed: PinFailedRule[] = [];
  const skipped: RuleEvaluation[] = [];
  for (const rule of sim.rules) {
    if (rule.verdict === "matched") {
      matched.push({
        ...pinRuleRef(rule, layerByIndex, attribution),
        ...buildWrites(rule.index, sim.mergeSteps),
      });
      continue;
    }
    // The reader's OWN rules are named one by one: "why didn't MY rule fire" is
    // the question a pin exists to answer, and a bucket cannot answer it.
    if (layerByIndex.get(rule.index)?.kind === "repo") {
      const miss = closestMiss(rule);
      failed.push({
        ...pinRuleRef(rule, layerByIndex, attribution),
        ...(miss === undefined ? {} : { closestMiss: miss }),
      });
      continue;
    }
    skipped.push(rule);
  }
  const caveat = buildNoInputCaveat(sim, attribution);
  const chips = buildChips(sim, matched.length);
  return {
    updateType: sim.flattened.updateType ?? "",
    chips,
    headline: chips.map((chip) => chip.label).join(" · "),
    matched,
    failed,
    buckets: buildBuckets(skipped, layerByIndex, depName, sim.missingInputs),
    totalRules: sim.rules.length,
    skippedCount: sim.rules.length - matched.length,
    ...(caveat === undefined ? {} : { caveat }),
  };
}

/**
 * How far a test's check has got. A pinned test moves pending → failed or
 * checked as the run's simulations come back; a one-off is `checked` by
 * construction — it exists only once its own simulation returned.
 *
 * The header derivations below read this instead of an evaluation, so the
 * pinned card and the one-off card cannot say different things about the same
 * outcome (they did: a one-off with a caveat wore a green dot).
 */
export type PinCheck =
  | { status: "pending" }
  | { status: "failed"; error: string }
  | { status: "checked"; outcome: PinOutcome };

/** The check state of a pinned test, from the evaluation the run holds and the
 *  outcome derived from it. Structural on purpose: the model must not import
 *  the hook that produces the evaluation. */
export function pinCheck(
  evaluation: { error?: string } | undefined,
  outcome: PinOutcome | null,
): PinCheck {
  if (!evaluation) {
    return { status: "pending" };
  }
  if (evaluation.error !== undefined) {
    return { status: "failed", error: evaluation.error };
  }
  return outcome === null ? { status: "pending" } : { status: "checked", outcome };
}

/** The header dot. Amber says "look closer" — a simulation that failed, the
 *  023/replay-02 caveat that one of the reader's OWN rules lost to a field
 *  they left unset, or (the design's own amber) an update no rule wrote to at
 *  all, which ships with Renovate defaults. */
export function dotTone(check: PinCheck): "pending" | "warn" | "ok" {
  if (check.status !== "checked") {
    return check.status === "pending" ? "pending" : "warn";
  }
  if (check.outcome.caveat !== undefined || check.outcome.matched.length === 0) {
    return "warn";
  }
  return "ok";
}

export function dotTitle(check: PinCheck): string {
  if (check.status === "pending") {
    return "checking…";
  }
  if (check.status === "failed") {
    return "this pin could not be checked";
  }
  if (check.outcome.caveat !== undefined) {
    return check.outcome.caveat;
  }
  return check.outcome.matched.length === 0
    ? "no rule matched — Renovate defaults apply"
    : "checked against the current run";
}

/** The header's right edge — the design's one-line outcome sentence:
 *  `grouped as “npm minor” · 2 matched, 461 skipped`. */
export function headSummary(outcome: PinOutcome): string {
  const counts =
    outcome.matched.length > 0
      ? `${nf.format(outcome.matched.length)} matched, ${nf.format(outcome.skippedCount)} skipped`
      : `${nf.format(outcome.skippedCount)} skipped`;
  return `${outcome.headline} · ${counts}`;
}
