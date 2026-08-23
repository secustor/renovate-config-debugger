import type {
  ComparisonMode,
  ConfigKeyDelta,
  MergedKey,
  RuleAttribution,
  RuleEvaluation,
  RuleRef,
  SignatureChange,
  SimulationComparison,
  SimulationResult,
  ValidationMessage,
} from "@renovate-config-debugger/engine";
import { CliError } from "../io";
import {
  evaluationErrorsNote,
  missingInputsNote,
  ruleFilterNote,
  ruleFilterPayload,
  type RuleView,
} from "../rule-view";
import type { RunTransport } from "../run-input";
import {
  collapseDeltas,
  collapseDiffs,
  type ConfigScope,
  type ConfigView,
  type MaybeCollapsed,
  type MaybeCollapsedDelta,
  projectConfig,
  projectKeySet,
} from "./config-view";
import { type RuleCrossLink, ruleCrossLink } from "./messages";
import {
  type RuleOrigin,
  ruleOrigin,
  type RuleSourceRange,
  ruleSourceRanges,
} from "./rule-provenance";
import { flattenedView, verdictPayload } from "./verdict";

/**
 * Roadmap 070: the simulate/compare payload shape, shared by `rcd simulate` /
 * `rcd compare` and the MCP server's `simulate` / `compare_simulations`.
 *
 * It used to live in `mcp/server.ts`, which meant the CLI's `--format json`
 * had no `detail` gate at all and spread the whole `SimulationResult`: 74% of
 * a 106 kB answer was `mergeSteps` + `rawFinalConfig`, describing how the
 * merge proceeded — a question nobody asked. The two transports are one
 * surface, so they are now one implementation, and the projections it applies
 * (`config-view`) are the same on both.
 */

/**
 * H1 (roadmap 068, 6 of 9 persona sessions): what a simulate answer carries by
 * default.
 *
 * Measured on `config:recommended` + a react update, the whole
 * `SimulationResult` is 1.36 MB — of which `mergeSteps` is 797 kB (two
 * elements, each a full config snapshot) and `rawFinalConfig` 199 kB. Those
 * two answer "how did the merge proceed", a question nobody asked, and they
 * drowned the one that was: the elision spent its budget on them and returned
 * 2 of 713 rules, with the merge trace dropped whole anyway. Personas at every
 * level asked for the same shape by hand — the matched rules, `flattened` and
 * `finalDependencyConfig`.
 *
 * So the merge trace is opt-in. `full` is the whole `SimulationResult` — every
 * member verbatim, no key projection, no collapsed diffs — for the caller who
 * is actually stepping through the merge, which is also what makes every other
 * projection here safe to apply: the unprojected document is one parameter
 * away. The one thing `full` does not undo is the rule-list SELECTION (roadmap
 * 073): the facets are a question about which rows you asked for, not a
 * projection of a row, and `verdict: "all"` is what widens them at every level.
 */
export const SIMULATE_DETAIL = ["verdict", "full"] as const;
export type SimulateDetail = (typeof SIMULATE_DETAIL)[number];

export const VERDICT_DETAIL_NOTE =
  "`mergeSteps` and `rawFinalConfig` are omitted at this detail level — on a `config:recommended` " +
  'run they are ~1 MB of the payload and describe how the merge proceeded. Pass detail: "full" ' +
  "for them.";

export interface SimulateProjection {
  detail: SimulateDetail;
  keys?: readonly string[];
  scope: ConfigScope;
  /**
   * Which rules to answer with, and what that view cost (roadmap 073). Omitted
   * means the whole array unfiltered and no `ruleFilter` — the shape a
   * hand-built test asserts on; both transports pass one, because the flipped
   * default is only safe while the payload states what it withheld.
   */
  ruleView?: RuleView;
  /**
   * The transport's spelling of the missing-input pointer
   * (`missingInputsNote`). Optional only so a caller that has no rule list to
   * point at can omit it; both transports pass it.
   */
  transport?: RunTransport;
  /**
   * Per-rule attribution for the run this simulation came from (roadmap 071) —
   * `buildRuleView`'s `attribution`. Omitted, or `undefined` because the run
   * could not be attributed, means no `ruleSources`, no `origin` and no
   * message cross-links: a wrong layer is worse than none.
   */
  attribution?: readonly RuleAttribution[] | undefined;
  /**
   * The run's effective config (roadmap 048) — the pre-rules baseline
   * `verdict.changedKeys` is measured against. Omitted only costs the
   * sentence its negative clauses ("would NOT automerge" needs to know a rule
   * turned it off); the verdict itself is answered either way.
   */
  finalConfig?: Record<string, unknown> | undefined;
}

export const RULE_SOURCES_NOTE =
  "`ruleSources` is the whole rule list's legend: each entry is the CONTIGUOUS range of merged " +
  "indexes one layer contributed. A rule's index inside its own layer is `index - from` — for " +
  "the `repo` entry that is the `packageRules[N]` you wrote. Matched rules carry it inline as " +
  "`origin`.";

/** Matched rules, with the layer that contributed them. Only the matched ones:
 *  annotating all ~727 rows costs 15 % of the payload to answer a question
 *  about the handful that fired, and `ruleSources` already covers the rest. */
export function withRuleOrigins<T extends { index: number; verdict: RuleEvaluation["verdict"] }>(
  rules: readonly T[],
  attribution: readonly RuleAttribution[] | undefined,
): (T | (T & { origin: RuleOrigin }))[] {
  if (!attribution || attribution.length === 0) {
    return [...rules];
  }
  return rules.map((rule) => {
    if (rule.verdict !== "matched") {
      return rule;
    }
    const origin = ruleOrigin(rule.index, attribution);
    return origin ? { ...rule, origin } : rule;
  });
}

/** A message with `rule` — its merged index cross-linked to the one the reader
 *  wrote. These come from validating the MERGED array, so the link runs the
 *  other way round from the repo-stage messages `run_config` reports. */
export function withRuleLinks(
  messages: readonly ValidationMessage[],
  attribution: readonly RuleAttribution[] | undefined,
): (ValidationMessage | (ValidationMessage & { rule: RuleCrossLink }))[] {
  return messages.map((message) => {
    const rule = ruleCrossLink(message, "merged", attribution);
    return rule ? { ...message, rule } : message;
  });
}

/** A rule with its merge diffs collapsed. */
function collapseRuleMerges(
  rules: readonly RuleEvaluation[],
): (RuleEvaluation | (Omit<RuleEvaluation, "merged"> & { merged: MaybeCollapsed<MergedKey>[] }))[] {
  return rules.map((rule) =>
    rule.merged ? { ...rule, merged: collapseDiffs(rule.merged) } : rule,
  );
}

/**
 * The rule rows an answer carries, at this detail level — one implementation,
 * so `rcd simulate --format json` and the MCP tool cannot disagree about the
 * shape of a row (they did, and the whole rules array used to be re-derived at
 * each call site after the projection had already built one).
 *
 * `detail: "full"` keeps the rows verbatim, the escape hatch it is meant to be.
 * A single-rule view (`rule: N`) additionally carries `origin` on a row that
 * did NOT match: the list omits it there because annotating ~727 rows costs 15 %
 * of the payload, but "which layer wrote the rule I asked about" is most of the
 * question when it is one row.
 */
export function ruleRows(view: RuleView, detail: SimulateDetail) {
  const rows = detail === "full" ? [...view.rules] : collapseRuleMerges(view.rules);
  if (view.rule === undefined) {
    return withRuleOrigins(rows, view.attribution);
  }
  return rows.map((row) => {
    const origin = ruleOrigin(row.index, view.attribution);
    return origin ? { ...row, origin } : row;
  });
}

/**
 * The simulation, at the requested detail. Listed key by key rather than
 * subtracted from the result, so the default shape is legible here and a
 * future field has to be admitted on purpose.
 */
export function simulationPayload(sim: SimulationResult, options: SimulateProjection) {
  // Roadmap 048: FIRST, on every detail level. It is the answer the other keys
  // are evidence for, it is the last thing the MCP elision would take (it drops
  // the largest keys), and `full` must not be the level that loses it.
  const verdict = verdictPayload(sim, options.finalConfig, options.attribution);
  const flattened = flattenedView(sim, options.attribution);
  const view = options.ruleView;
  const rules = view ? ruleRows(view, options.detail) : collapseRuleMerges(sim.rules);
  const filterNote = view ? ruleFilterNote(view) : undefined;
  if (options.detail === "full") {
    // The escape hatch stays the result itself — every member verbatim,
    // `mergeSteps` and `rawFinalConfig` included — plus the verdict and the
    // flattening legend, which are additive and cost a few hundred bytes. The
    // rule LIST is still the requested view (roadmap 073), and says so.
    return {
      verdict,
      ...sim,
      rules: view ? rules : sim.rules,
      flattened,
      ...(view ? ruleFilterPayload(view) : {}),
      ...(filterNote ? { notes: [...sim.notes, filterNote] } : {}),
    };
  }
  const projected = projectConfig(sim.finalDependencyConfig, {
    scope: options.scope,
    ...(options.keys ? { keys: options.keys } : {}),
  });
  const sources: RuleSourceRange[] = ruleSourceRanges(options.attribution);
  return {
    verdict,
    rules,
    // ~200 bytes for the whole attribution, and immune to the elision (the
    // largest-array pass never picks it) — so "which layer wrote this rule"
    // survives an answer whose rule list did not.
    ...(sources.length > 0 ? { ruleSources: sources } : {}),
    // Admitted on purpose, and NOT next to the rows they describe: `rules` is
    // the view a `verdict`/`source`/`rule` selection produced and the first
    // array the MCP elision shrinks, and the rules these two count are exactly
    // the ones a `notable`/`matched` filter removes. A few hundred bytes that
    // survive both, against an answer that reads as "nothing matched" — or,
    // worse, as a verdict about a rule the tool never managed to evaluate.
    missingInputs: sim.missingInputs,
    evaluationErrors: sim.evaluationErrors,
    ...(view ? ruleFilterPayload(view) : {}),
    flattened: { ...flattened, merged: collapseDiffs(sim.flattened.merged) },
    finalDependencyConfig: projected.config,
    configView: projected.view,
    // The simulator validates the MERGED array (`validateConfig("repo", {
    // packageRules })`), so a `packageRules[N]` here is a merged index — the
    // link says which rule of the reader's own config that is.
    errors: withRuleLinks(sim.errors, options.attribution),
    warnings: withRuleLinks(sim.warnings, options.attribution),
    // ONE notes array (roadmap 073). The payload used to carry five
    // note-shaped fields — `notes`, `detailNote`, `missingInputsNote`,
    // `ruleSourcesNote` and `flattened.note` — and an agent should not have to
    // learn five field names to find the map. Each aggregate keeps its own
    // `note` inside its object; everything that is a pointer about the ANSWER
    // is appended here, in the order a reader needs it.
    notes: [
      ...sim.notes,
      ...(filterNote ? [filterNote] : []),
      ...(options.transport ? notesFor(sim, options.transport) : []),
      ...(sources.length > 0 ? [RULE_SOURCES_NOTE] : []),
      VERDICT_DETAIL_NOTE,
    ],
  };
}

/** The two aggregates' transport-spelled pointers, in the order that matters:
 *  "the tool could not evaluate this" outranks "your dep left a field unset". */
function notesFor(sim: SimulationResult, transport: RunTransport): string[] {
  const errors = evaluationErrorsNote(sim.evaluationErrors, transport);
  const missing = missingInputsNote(sim.missingInputs, transport);
  return [...(errors ? [errors] : []), ...(missing ? [missing] : [])];
}

/**
 * Roadmap 073: how much of a comparison an answer carries.
 *
 * `verdict` (the default) is the claim plus the evidence for it — the behavior
 * verdict, `netEffect`, the rules that started/stopped mattering, the key delta
 * — and states the identity axis as COUNTS. Measured on the persona-replay
 * configs, the two things it drops are the two that cost: `matchedInBoth` is
 * every rule that behaved the same on both sides (the answer to a question
 * nobody asked of a diff), and a `signature` is the whole selector array of a
 * rule re-serialized as a string, next to the `label` that already names it.
 *
 * `rules` puts the arrays back, still without the signature strings; `full` is
 * the engine's `SimulationComparison` exactly as it computes it. The engine's
 * object is complete either way — this is a projection, and the reversal is
 * named in the answer.
 */
export const COMPARE_DETAIL = ["verdict", "rules", "full"] as const;
export type CompareDetail = (typeof COMPARE_DETAIL)[number];

/**
 * What the CALLER varied. The engine cannot see it, and a wrong guess is how
 * the comparison came to claim a selector rewrite about one unchanged config
 * read through two dependencies — so both surfaces derive it here, from the
 * same two facts, instead of each spelling its own ternary.
 */
export function comparisonMode(twoConfigs: boolean, twoDeps: boolean): ComparisonMode {
  if (twoConfigs && twoDeps) {
    return "unspecified";
  }
  return twoDeps ? "dependency" : "config";
}

export interface ComparisonProjection {
  keys?: readonly string[];
  scope: ConfigScope;
  detail: CompareDetail;
  /** Which surface the note's `detail` spelling is for. Defaults to `mcp`'s. */
  transport?: RunTransport;
  /**
   * Top-level keys present in EITHER side's `finalDependencyConfig` — what
   * tells a withheld key `identical` (both sides carry it, nothing differs)
   * apart from `absent` (neither side's per-dependency config has it). Both
   * call sites hold the two simulations, so both pass it; without it every
   * unchanged key reads `absent`, which replay-03 showed being read as "not
   * in the config" about an option both configs hold.
   */
  sideKeys?: readonly string[];
}

/** A {@link RuleRef} without the re-serialized selector array. */
type ProjectedRuleRef = Omit<RuleRef, "signature"> | RuleRef;

/** The identity axis, as counts or as the arrays themselves. */
interface ProjectedIdentity {
  changed: boolean;
  counts?: { onlyInA: number; onlyInB: number; signatureChanges: number };
  signatureChanges?: (
    | SignatureChange
    | (Omit<SignatureChange, "a" | "b"> & {
        a: ProjectedRuleRef;
        b: ProjectedRuleRef;
      })
  )[];
  onlyInA?: ProjectedRuleRef[];
  onlyInB?: ProjectedRuleRef[];
}

export interface ProjectedComparison extends Omit<
  SimulationComparison,
  "configDelta" | "matchedInBoth" | "identity" | "stoppedMatching" | "startedMatching"
> {
  stoppedMatching: ProjectedRuleRef[];
  startedMatching: ProjectedRuleRef[];
  matchedInBoth?: ProjectedRuleRef[];
  configDelta: MaybeCollapsedDelta<ConfigKeyDelta>[];
  configView: ConfigView;
  identity: ProjectedIdentity;
  /** The one place a comparison's pointers live — same rule as the simulation
   *  payload's `notes`. Absent when the answer withheld nothing. */
  notes?: string[];
}

const IDENTITY_COUNTS_NOTE =
  "`identity` is stated as counts at this detail level: it is bookkeeping about selector TEXT, " +
  "never a behavior claim, and it goes true whenever you edit the very array a rule matches on. ";

const MATCHED_IN_BOTH_NOTE =
  "`matchedInBoth` (the rules that behaved the same on both sides) and the per-rule `signature` " +
  "strings are omitted; `label` and `index` identify each rule. ";

function withoutSignature(ref: RuleRef): ProjectedRuleRef {
  const { signature: _signature, ...rest } = ref;
  return rest;
}

function projectRefs(refs: readonly RuleRef[], detail: CompareDetail): ProjectedRuleRef[] {
  return detail === "full" ? [...refs] : refs.map(withoutSignature);
}

function projectIdentity(
  identity: SimulationComparison["identity"],
  detail: CompareDetail,
): ProjectedIdentity {
  if (detail === "full") {
    return identity;
  }
  if (detail === "verdict") {
    return {
      changed: identity.changed,
      counts: {
        onlyInA: identity.onlyInA.length,
        onlyInB: identity.onlyInB.length,
        signatureChanges: identity.signatureChanges.length,
      },
    };
  }
  return {
    changed: identity.changed,
    signatureChanges: identity.signatureChanges.map((change) => ({
      ...change,
      a: withoutSignature(change.a),
      b: withoutSignature(change.b),
    })),
    onlyInA: projectRefs(identity.onlyInA, detail),
    onlyInB: projectRefs(identity.onlyInB, detail),
  };
}

/**
 * The comparison, with its key delta scoped, key-selected and
 * description-collapsed, at the requested {@link CompareDetail}.
 *
 * `summary`, `verdict` and `netEffect` are deliberately NOT projected: they
 * state what the comparison found, over the whole delta, and a verdict that
 * changed with the view a caller asked for would be uncitable. So `summary`
 * may name a key this view withheld — which is exactly what `configView`
 * (`scope`, `withheld`, `droppedGlobalOnly`) is there to say.
 *
 * Collapsing never moves a key: it rewrites one entry's VALUE fields, so the
 * delta's key set is untouched by it.
 */
export function comparisonPayload(
  comparison: SimulationComparison,
  options: ComparisonProjection,
): ProjectedComparison {
  const deltaKeys = new Set(comparison.configDelta.map((delta) => delta.key));
  // A key both sides carry that is not in the delta did not differ — the
  // `identical` withheld reason, as opposed to a key neither side has.
  const unchanged = new Set((options.sideKeys ?? []).filter((key) => !deltaKeys.has(key)));
  const { kept, view } = projectKeySet(
    [...deltaKeys],
    { scope: options.scope, ...(options.keys ? { keys: options.keys } : {}) },
    unchanged,
  );
  const { detail } = options;
  const spell = (value: CompareDetail) =>
    options.transport === "cli" ? `\`--detail ${value}\`` : `\`detail: "${value}"\``;
  const notes =
    detail === "full"
      ? []
      : [
          (detail === "verdict" ? IDENTITY_COUNTS_NOTE + MATCHED_IN_BOTH_NOTE : "") +
            `${spell("rules")} returns the rule and identity arrays, ${spell("full")} the ` +
            "comparison exactly as the engine computes it — every signature included.",
        ];
  // Destructured out rather than overwritten: at `verdict` the key is not
  // present at all, and a spread would keep the engine's.
  const { matchedInBoth, ...rest } = comparison;
  return {
    ...rest,
    stoppedMatching: projectRefs(comparison.stoppedMatching, detail),
    startedMatching: projectRefs(comparison.startedMatching, detail),
    ...(detail === "verdict" ? {} : { matchedInBoth: projectRefs(matchedInBoth, detail) }),
    configDelta: collapseDeltas(comparison.configDelta.filter((delta) => kept.has(delta.key))),
    configView: view,
    identity: projectIdentity(comparison.identity, detail),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

export function parseCompareDetail(raw: string | undefined): CompareDetail | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const found = COMPARE_DETAIL.find((detail) => detail === raw);
  if (!found) {
    throw new CliError(`--detail must be one of ${COMPARE_DETAIL.join("|")} (got "${raw}")`);
  }
  return found;
}

export function parseDetail(raw: string | undefined): SimulateDetail | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const found = SIMULATE_DETAIL.find((detail) => detail === raw);
  if (!found) {
    throw new CliError(`--detail must be one of ${SIMULATE_DETAIL.join("|")} (got "${raw}")`);
  }
  return found;
}
