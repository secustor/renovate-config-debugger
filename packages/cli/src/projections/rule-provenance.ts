import type {
  KeyProvenance,
  ProvenanceLayer,
  RuleAttribution,
} from "@renovate-config-debugger/engine";
import {
  isOverridden,
  multiContribBadgeKind,
  ruleOriginLayer,
  ruleWrittenKeys,
  type SourceFilter,
  summarizeRuleSelectors,
} from "@renovate-config-debugger/app/headless";
import { CliError } from "../io";
import { preview } from "../output";
import { layerLabel } from "./provenance";

/**
 * Roadmap 071: `packageRules` provenance as per-layer RANGES, shared by
 * `rcd provenance <file> packageRules` and the MCP server's `get_provenance`.
 *
 * Why this key gets its own projection: it is the one key Renovate CONCATENATES
 * rather than overrides, so the generic chain view (`entryView`) states each
 * layer's cumulative snapshot of the whole merged array — 733 kB of answer on a
 * `config:best-practices` run, of which the transport's elider then kept the
 * first rule and the last. An answer worth nothing, from a tool whose whole
 * job is "which layer contributed this".
 *
 * The shape here is built on the property `computeRuleProvenance` guarantees:
 * every layer's own rules land as one CONTIGUOUS block of the merged array, in
 * merge order. So the attribution — complete, for every one of the ~727 rules —
 * compresses to a handful of ranges under a kilobyte, and only the
 * human-readable digest lines have to degrade under the byte budget. Attribution
 * is never approximated: when the engine reports none, this says so instead of
 * guessing.
 */

export interface RuleSourceRange {
  /** `layerLabel` of the contributing layer, e.g. `repo`, `preset config:recommended`. */
  layer: string;
  kind: ProvenanceLayer["kind"];
  /** The preset's name, for a get_preset_node drill-down. Presets only. */
  node?: string;
  /** First merged index this layer contributed (inclusive). */
  from: number;
  /** Last merged index this layer contributed (inclusive). */
  to: number;
  count: number;
}

/** How much of each rule the digest lines carry. Only this degrades under the
 *  byte budget — the ranges above are always complete. */
export type RuleDigestDetail = "values" | "shape" | "counts";

/** Which detail each CLASS of layer gets. The authored layers (repo, global,
 *  inherited) are a handful of rules at any scale, so they keep their values
 *  while a 726-rule preset contribution degrades. */
export interface RuleDigestPlan {
  authored: RuleDigestDetail;
  presets: RuleDigestDetail;
  /** Whether a preset's digest lines name the nested body that wrote each rule
   *  (`[from X]`). Dropped BEFORE any line is: naming the writer is an addition
   *  to an answer whose completeness — one line per merged rule — is the older
   *  promise, and the writer of one rule stays a `rule: <index>` away. */
  writers: boolean;
}

/**
 * The plans a budget-limited caller walks, richest first (measured on
 * `config:best-practices` + one own rule, ~730 merged rules: 96 kB, 53 kB,
 * 33 kB, <2 kB). The sentence a reader needs — "your `packageRules[0]` is
 * merged rule 730, matching `matchSourceUrls: […]`" — survives all four.
 */
export const RULE_DIGEST_PLANS = [
  { authored: "values", presets: "values", writers: true },
  { authored: "values", presets: "shape", writers: true },
  { authored: "values", presets: "shape", writers: false },
  { authored: "values", presets: "counts", writers: false },
] as const satisfies readonly RuleDigestPlan[];

export interface RuleContribution extends RuleSourceRange {
  /** One line per rule, `<merged index> <selectors> → <writes>`. Absent at
   *  `counts` detail. */
  rules?: string[];
}

export interface RuleProvenanceView {
  key: "packageRules";
  /** Renovate appends here; no layer overrides another. */
  mergeSemantics: "concat";
  /** Rules in the merged array — the count every index below is against. */
  total: number;
  winner: string | null;
  badge: string | null;
  isDefaultOnly: boolean;
  /** Absent exactly when `attributionNote` is present. */
  contributions?: RuleContribution[];
  /** Renovate's nested-`extends` pass rewrote the array on some layer. */
  expandedNested?: true;
  /** Present when `source` scoped the contributions below. */
  source?: SourceFilter;
  note: string;
  /** Present when the digest lines were reduced to fit the answer's budget. */
  detailNote?: string;
  /** Present exactly when attribution is unavailable. */
  attributionNote?: string;
}

export interface RuleOrigin {
  layer: string;
  /** This rule's index inside its OWN layer's `packageRules` — for the repo
   *  layer, the `packageRules[N]` in the config as written. */
  sourceIndex: number;
}

export interface OneRuleView {
  index: number;
  layer: string | null;
  sourceIndex: number | null;
  /** The sentence that places this rule in both index schemes. */
  citation: string;
  rule: unknown;
}

const ATTRIBUTION_NOTE =
  "this run's merged rules could not be attributed to layers (a `packageRules[n].extends` " +
  "reshaped the array); nothing is reported rather than a wrong link.";

const NOTE =
  "`packageRules` CONCATENATES: every layer appends its own rules in merge order and no layer " +
  "overrides another, so a rule's merged index is its position in one array built end to end — " +
  "the index `simulate` and Renovate's own validator messages cite. A rule's index inside its " +
  "own layer is `index - from`; for the `repo` contribution that is the `packageRules[N]` you " +
  "wrote. A preset range names the extend the rules ARRIVED through; `[from X]` on a digest " +
  "line names the nested preset that actually wrote that one rule, which is also what " +
  "`rule: <index>` cites. Rule BODIES are not included here: ask for one with `rule: <index>` (`--rule <n>` on " +
  'the CLI), or for all of them with get_final_config `keys: ["packageRules"]`.';

const DEGRADED_NOTE =
  "the per-rule digest lines were reduced to fit this answer's size budget — shorter lines, or " +
  "no `[from X]` writer, or no lines at all; the ranges above are complete regardless. Narrow " +
  'with `source: "repo"` for the rules you wrote, or ask for one rule\'s body and its exact ' +
  "writer with `rule: <index>`.";

/** Layer identity, not layer KIND: the same preset extended twice contributes
 *  two separate blocks, and reporting them as one range would invent a
 *  contiguity the merge does not have. */
function layerKey(layer: ProvenanceLayer): string {
  return layer.kind === "preset" ? `preset:${layer.nodeId}` : layer.kind;
}

function rangeOf(attr: RuleAttribution): RuleSourceRange {
  return {
    layer: layerLabel(attr.layer),
    kind: attr.layer.kind,
    ...(attr.layer.kind === "preset" ? { node: attr.layer.name } : {}),
    from: attr.index,
    to: attr.index,
    count: 1,
  };
}

/**
 * The attribution, compressed to one range per contributing TOP-LEVEL layer.
 *
 * `computeRuleProvenance` emits the merged indexes in order, one contiguous
 * block per layer, so a new range starts exactly where the layer identity
 * changes — the ranges are exact, not inferred.
 *
 * Per top-level layer, not per writing body, and that is the whole point: the
 * ranges are the part of every answer here that must survive a byte budget
 * whole (~200 bytes, immune to the elider), and a `config:best-practices` run
 * has ~700 distinct writing bodies. Which nested preset wrote ONE rule is a
 * per-rule question, answered per-rule by {@link ruleOrigin} — where it costs
 * nothing — and by the digest lines below.
 */
export function ruleSourceRanges(
  attribution: readonly RuleAttribution[] | null | undefined,
): RuleSourceRange[] {
  const ranges: RuleSourceRange[] = [];
  let currentKey: string | null = null;
  for (const attr of attribution ?? []) {
    const key = layerKey(attr.layer);
    const current = ranges.at(-1);
    if (current && key === currentKey && attr.index === current.to + 1) {
      current.to = attr.index;
      current.count += 1;
      continue;
    }
    ranges.push(rangeOf(attr));
    currentKey = key;
  }
  return ranges;
}

/**
 * Which config wrote one merged rule, and its index inside THAT config — the
 * nested preset when the engine verified one (`writtenBy`), else the direct
 * extend it arrived through. Both halves come from the same body: citing
 * `config:best-practices packageRules[726]` for a rule the reader will find at
 * `packageRules[3]` of `security:minimumReleaseAgeNpm` is two wrong answers.
 */
export function ruleOrigin(
  index: number,
  attribution: readonly RuleAttribution[] | null | undefined,
): RuleOrigin | undefined {
  const found = attribution?.find((attr) => attr.index === index);
  if (!found) {
    return undefined;
  }
  return {
    layer: layerLabel(ruleOriginLayer(found)),
    sourceIndex: found.writtenBy?.sourceIndex ?? found.sourceIndex,
  };
}

/** The selector keys of a rule, read off the app's own one-line summary so
 *  there is exactly one answer to "what does this rule select on". */
function selectorKeys(rule: unknown): string[] {
  const summary = summarizeRuleSelectors(rule);
  // The two fallbacks are parenthesized prose; a selector key never is.
  return summary.startsWith("(") ? [] : summary.split(" + ");
}

/**
 * One rule's line. `writer` is appended when the rule came from a preset
 * NESTED below the range's own extend — the range head says
 * `config:best-practices` for all 731 of them, and this is the only place a
 * whole-key answer can say which body actually wrote each one.
 */
function digestLine(
  index: number,
  rule: unknown,
  detail: RuleDigestDetail,
  writer: string | undefined,
): string {
  const writes = ruleWrittenKeys(rule);
  const written = writes.length > 0 ? writes.join(", ") : "(sets nothing)";
  const from = writer ? ` [from ${writer}]` : "";
  const selectors = selectorKeys(rule);
  const first = selectors[0];
  if (detail === "shape" || first === undefined) {
    return `${index} ${summarizeRuleSelectors(rule)} → ${written}${from}`;
  }
  const value = preview((rule as Record<string, unknown>)[first], 48, { withLength: true });
  const more = selectors.length - 1;
  return `${index} ${first}: ${value}${more > 0 ? ` +${more}` : ""} → ${written}${from}`;
}

/** Global, inherited and the repo's own config — the layers a person WROTE,
 *  and a handful of rules at any scale. */
function isAuthored(kind: ProvenanceLayer["kind"]): boolean {
  return kind === "repo" || kind === "global" || kind === "inherited";
}

function detailFor(kind: ProvenanceLayer["kind"], plan: RuleDigestPlan): RuleDigestDetail {
  return isAuthored(kind) ? plan.authored : plan.presets;
}

function keepRange(kind: ProvenanceLayer["kind"], source: SourceFilter): boolean {
  if (source === "all") {
    return true;
  }
  return source === "repo" ? kind === "repo" : kind === "preset";
}

export interface RuleProvenanceOptions {
  /** Report only the ranges of this class of layer. `total` still counts every
   *  merged rule — scoping the view never moves the indexes. */
  source?: SourceFilter;
}

/**
 * The whole answer for `packageRules`: the layer ranges, the digest lines the
 * requested plan affords, and the semantics two persona sessions got wrong
 * (that a later layer had "overridden" the earlier ones).
 */
export function ruleProvenanceView(
  entry: KeyProvenance,
  attribution: readonly RuleAttribution[] | null | undefined,
  rules: readonly unknown[],
  plan: RuleDigestPlan,
  options?: RuleProvenanceOptions,
): RuleProvenanceView {
  const winner = entry.chain.findLast((step) => !step.noop) ?? entry.chain.at(-1);
  const source = options?.source ?? "all";
  const base: RuleProvenanceView = {
    key: "packageRules",
    mergeSemantics: "concat",
    total: rules.length,
    winner: winner ? layerLabel(winner.layer) : null,
    // Roadmap 016's word for it — an appended array is not an overridden one.
    badge: isOverridden(entry) ? multiContribBadgeKind(entry) : null,
    isDefaultOnly: entry.isDefaultOnly,
    ...(entry.chain.some((step) => step.expandedNested) ? { expandedNested: true as const } : {}),
    ...(source !== "all" ? { source } : {}),
    note: NOTE,
  };
  if (!attribution) {
    return { ...base, attributionNote: ATTRIBUTION_NOTE };
  }
  const writerByIndex = plan.writers
    ? new Map(
        attribution.flatMap((attr) => (attr.writtenBy ? [[attr.index, attr.writtenBy.name]] : [])),
      )
    : new Map<number, string>();
  const contributions = ruleSourceRanges(attribution)
    .filter((range) => keepRange(range.kind, source))
    .map((range) => {
      const detail = detailFor(range.kind, plan);
      if (detail === "counts") {
        return range;
      }
      const lines: string[] = [];
      for (let index = range.from; index <= range.to; index += 1) {
        lines.push(digestLine(index, rules[index], detail, writerByIndex.get(index)));
      }
      return { ...range, rules: lines };
    });
  const degraded =
    contributions.some((range) => detailFor(range.kind, plan) !== "values" && range.count > 0) ||
    (!plan.writers && attribution.some((attr) => attr.writtenBy));
  return {
    ...base,
    contributions,
    ...(degraded ? { detailNote: DEGRADED_NOTE } : {}),
  };
}

/** The `packageRules[N]` citation for one merged rule, in both index schemes. */
function citationOf(index: number, origin: RuleOrigin | undefined): string {
  if (!origin) {
    return (
      `merged packageRules[${index}] — no layer could be attributed to it, so which config ` +
      "wrote it is not reported."
    );
  }
  return origin.layer === "repo"
    ? `merged packageRules[${index}] is the \`packageRules[${origin.sourceIndex}]\` of your own config.`
    : `merged packageRules[${index}] is packageRules[${origin.sourceIndex}] of ${origin.layer}.`;
}

/** One merged rule, body included — the drill-down the ranges point at. */
export function oneRuleView(
  index: number,
  attribution: readonly RuleAttribution[] | null | undefined,
  rules: readonly unknown[],
): OneRuleView {
  if (index >= rules.length) {
    throw new CliError(
      `this run has ${rules.length} merged packageRules; there is no packageRules[${index}].`,
    );
  }
  const origin = ruleOrigin(index, attribution);
  return {
    index,
    layer: origin?.layer ?? null,
    sourceIndex: origin?.sourceIndex ?? null,
    citation: citationOf(index, origin),
    rule: rules[index],
  };
}
