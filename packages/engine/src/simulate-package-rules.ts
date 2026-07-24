import { enqueueEngineTask } from "./pipeline";
import {
  GlobalConfig,
  memCache,
  mergeChildConfig,
  packageRuleMatchers,
  validateConfig,
} from "./renovate-adapter";
import type { ValidationMessage } from "./trace/model";

/**
 * Roadmap 006: the packageRules simulator. Evaluates a completed run's
 * `finalConfig.packageRules` against a user-described hypothetical dependency
 * update using Renovate's REAL matcher registry (upstream
 * `lib/util/package-rules/matchers.ts`, via the adapter), records a
 * per-clause verdict for every rule, and replicates `applyPackageRules`'s merge tail
 * (removeMatchers + mergeChildConfig, cumulative and in order) so the final
 * per-dependency config matches what Renovate would compute.
 *
 * Roadmap 012: after the merge tail, the simulator also replicates Renovate's
 * update-type flattening (upstream `flattenUpdates`:
 * `mergeChildConfig(config, config[updateType])` followed by deleting every
 * update-type block) so that e.g. `minor: { automerge: true }` resolves to
 * `automerge: true` for a minor update. What the flattening changed, and which
 * update-type blocks were present, is recorded on `result.flattened`.
 *
 * The one deliberate gap: `matchConfidence` needs a Merge Confidence API
 * token and upstream THROWS without one, so rules containing it are reported
 * as "not-simulated" instead of being decided — mirroring that a real run
 * would abort rather than silently match or skip.
 */

/** Everything the 18 matchers can read about a hypothetical dependency update. */
export interface DependencyDescriptor {
  manager?: string;
  datasource?: string;
  packageName?: string;
  /** Defaults to `packageName` when omitted. */
  depName?: string;
  depType?: string;
  packageFile?: string;
  lockFiles?: string[];
  currentValue?: string;
  currentVersion?: string;
  lockedVersion?: string;
  newValue?: string;
  updateType?: string;
  /** In-range "bump" updates match `matchUpdateTypes: ["bump"]`. */
  isBump?: boolean;
  versioning?: string;
  sourceUrl?: string;
  registryUrls?: string[];
  categories?: string[];
  repository?: string;
  baseBranch?: string;
  /** ISO timestamp of the current version's release (matchCurrentAge). */
  currentVersionTimestamp?: string;
  /** Read only by matchConfidence, which is never simulated. */
  mergeConfidenceLevel?: string;
}

export interface SimulationInput {
  /** The effective config whose packageRules run (a run's `finalConfig`). */
  config: Record<string, unknown>;
  dep: DependencyDescriptor;
}

/**
 * Roadmap 018: the matcher return `boolean | null` is reported at three
 * levels of precision instead of the old two:
 * - `matched` — the matcher returned `true`.
 * - `no-match` — the matcher returned `false` AND at least one input field it
 *   reads was set on the dependency: a genuine mismatch (e.g. the money-shot
 *   `matchSourceUrls: [...] — no match against sourceUrl = "…"`).
 * - `no-input` — the matcher returned `false` because NONE of the fields it
 *   reads were set on the simulated dependency (upstream's fail-closed
 *   `if (!sourceUrl) return false`). Still fails the rule (verdict → no-match,
 *   oracle-identical), but is reported as "skipped — no sourceUrl set …" so it
 *   isn't mistaken for a real mismatch.
 * - `not-applicable` — the matcher returned `null` (it could not evaluate the
 *   clause, e.g. an unparseable age range); upstream skips it, so it does not
 *   affect whether the rule matches.
 */
export type ClauseState =
  | "matched"
  | "no-match"
  | "no-input"
  | "not-applicable"
  | "not-simulated"
  | "error";

export interface ClauseEvaluation {
  /** The `match*` selector key, e.g. `matchPackageNames`. */
  key: string;
  /** The clause's value inside the rule. */
  value: unknown;
  state: ClauseState;
  /** The input fields the matcher consulted, for human explanations. */
  inputValues: Record<string, unknown>;
  /** The dependency fields this matcher reads (for a "no X set" explanation). */
  readFields: readonly string[];
  /** Present for no-input / not-applicable / not-simulated / error states. */
  note?: string;
}

export type RuleVerdict = "matched" | "no-match" | "not-simulated";

/** One key the rule changed on the cumulative per-dependency config. */
export interface MergedKey {
  key: string;
  before?: unknown;
  after?: unknown;
}

/**
 * The update-type flattening step (roadmap 012), replicating upstream
 * `flattenUpdates`: after packageRules merge, `config[updateType]` is merged
 * up into the config and every update-type block is dropped.
 */
export interface FlattenResult {
  /** The update's type whose block was merged, e.g. `minor` (if any was set). */
  updateType?: string;
  /** Keys the update-type block set/changed on the final config (may be empty). */
  merged: MergedKey[];
  /**
   * Every standard update-type block present on the resolved config *before*
   * flattening (`major`/`minor`/`patch`/`pin`/`digest`/`lockFileMaintenance`/
   * `replacement`), so the UI can explain when a setting is scoped to update
   * types other than the current one.
   */
  blocks: Record<string, Record<string, unknown>>;
}

export interface RuleEvaluation {
  /** Position in `packageRules`. */
  index: number;
  verdict: RuleVerdict;
  /** Every `match*` clause present on the rule, in matcher-registry order. */
  clauses: ClauseEvaluation[];
  /** Keys this rule set/changed when it merged (matched rules only). */
  merged?: MergedKey[];
  /** Rule-level caveats (ignored selectors, uncompiled templates, …). */
  notes: string[];
}

export interface SimulationResult {
  rules: RuleEvaluation[];
  /** Exactly what `applyPackageRules` would return (dep fields included). */
  rawFinalConfig: Record<string, unknown>;
  /**
   * `rawFinalConfig` after update-type flattening, without `packageRules` and
   * without synthetic descriptor fields that no rule changed — the
   * per-dependency config for display.
   */
  finalDependencyConfig: Record<string, unknown>;
  /** What Renovate's update-type flattening changed (roadmap 012). */
  flattened: FlattenResult;
  /** `validateConfig("repo", { packageRules })` output for the rules block. */
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  /** Simulation-level caveats. */
  notes: string[];
}

interface MatcherDescriptor {
  /** The packageRules selector the matcher reads. */
  readonly key: string;
  /** The input-config fields the matcher consults, for UI explanations. */
  readonly inputFields: readonly string[];
}

/**
 * Selector key + read fields for each entry of Renovate's matcher registry,
 * by position. Must stay aligned with the upstream registry
 * (`lib/util/package-rules/matchers.ts`) — length-checked at runtime.
 */
const MATCHER_TABLE: readonly MatcherDescriptor[] = [
  { key: "matchConfidence", inputFields: ["mergeConfidenceLevel"] },
  { key: "matchRepositories", inputFields: ["repository"] },
  { key: "matchBaseBranches", inputFields: ["baseBranch"] },
  { key: "matchCategories", inputFields: ["categories"] },
  { key: "matchManagers", inputFields: ["manager"] },
  { key: "matchFileNames", inputFields: ["packageFile", "lockFiles"] },
  { key: "matchDatasources", inputFields: ["datasource"] },
  { key: "matchPackageNames", inputFields: ["packageName"] },
  { key: "matchDepNames", inputFields: ["depName"] },
  { key: "matchDepTypes", inputFields: ["depType", "depTypes"] },
  { key: "matchCurrentValue", inputFields: ["currentValue"] },
  {
    key: "matchCurrentVersion",
    inputFields: ["versioning", "currentValue", "currentVersion", "lockedVersion"],
  },
  { key: "matchUpdateTypes", inputFields: ["updateType", "isBump"] },
  { key: "matchSourceUrls", inputFields: ["sourceUrl"] },
  { key: "matchRegistryUrls", inputFields: ["registryUrls"] },
  { key: "matchNewValue", inputFields: ["newValue"] },
  { key: "matchCurrentAge", inputFields: ["currentVersionTimestamp"] },
  { key: "matchJsonata", inputFields: [] },
];

const KNOWN_SELECTORS = new Set(MATCHER_TABLE.map((entry) => entry.key));

/**
 * The update-type config blocks Renovate flattens and then deletes, in the
 * exact set and order of upstream `flattenUpdates`. `rollback`/`bump` are NOT
 * flattenable blocks upstream and are intentionally absent.
 */
const UPDATE_TYPE_KEYS = [
  "major",
  "minor",
  "patch",
  "pin",
  "digest",
  "lockFileMaintenance",
  "replacement",
] as const;

const NOT_SIMULATED_NOTE =
  "not simulated — matchConfidence requires a Merge Confidence API token; " +
  "a real Renovate run without one throws instead of evaluating the rule";

export function simulatePackageRules(input: SimulationInput): Promise<SimulationResult> {
  return enqueueEngineTask(() => execute(input));
}

/** The descriptor as config fields, undefineds dropped, depName defaulted. */
function buildDepFields(dep: DependencyDescriptor): Record<string, unknown> {
  const withDefaults: DependencyDescriptor = {
    ...dep,
    ...(dep.depName === undefined && dep.packageName !== undefined
      ? { depName: dep.packageName }
      : {}),
  };
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(withDefaults)) {
    if (value !== undefined) {
      fields[key] = value;
    }
  }
  return fields;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Upstream removeMatchers: strip every key starting with match/exclude. */
function removeMatchers(rule: Record<string, unknown>): Record<string, unknown> {
  const out = { ...rule };
  for (const key of Object.keys(out)) {
    if (key.startsWith("match") || key.startsWith("exclude")) {
      delete out[key];
    }
  }
  return out;
}

/**
 * ASCII approximation of the `slugify` package with `{ lower: true }` (used
 * upstream to derive `groupSlug` from `groupName`): keep word chars and
 * slugify's allowed punctuation, collapse whitespace to `-`, lowercase.
 */
function slugifyLite(input: string): string {
  return input
    .normalize()
    .trim()
    .replace(/[^\w\s$*_+~.()'"!\-:@]+/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/**
 * Upstream compiles Handlebars templates in override/sourceUrl values; the
 * simulator applies them verbatim and notes when a template was present.
 */
function applyTemplate(value: string, field: string, notes: string[]): string {
  if (value.includes("{{")) {
    notes.push(
      `${field} contains a Handlebars template — the simulator does not compile templates and applied it verbatim`,
    );
  }
  return value;
}

/** "sourceUrl" / "packageFile or lockFiles" — the fields a matcher reads,
 *  for the fail-closed "no X set on the simulated dependency" explanation. */
function humanFieldList(fields: readonly string[]): string {
  if (fields.length <= 1) {
    return fields[0] ?? "matching input";
  }
  return `${fields.slice(0, -1).join(", ")} or ${fields.at(-1)}`;
}

async function evaluateRule(
  index: number,
  inputConfig: Record<string, unknown>,
  rule: Record<string, unknown>,
): Promise<RuleEvaluation> {
  const clauses: ClauseEvaluation[] = [];
  const notes: string[] = [];
  let verdict: RuleVerdict = "matched";

  for (const [position, entry] of MATCHER_TABLE.entries()) {
    const value = rule[entry.key];
    // MergeConfidenceMatcher skips null too (isNullOrUndefined); the rest
    // check isUndefined only.
    const present = entry.key === "matchConfidence" ? value != null : value !== undefined;
    if (!present) {
      continue;
    }
    const inputValues: Record<string, unknown> = {};
    for (const field of entry.inputFields) {
      if (inputConfig[field] !== undefined) {
        inputValues[field] = inputConfig[field];
      }
    }
    const readFields = entry.inputFields;
    if (entry.key === "matchConfidence") {
      clauses.push({
        key: entry.key,
        value,
        state: "not-simulated",
        inputValues,
        readFields,
        note: NOT_SIMULATED_NOTE,
      });
      // The registry evaluates matchConfidence FIRST, so a real run throws
      // before any other clause of this rule is consulted.
      verdict = "not-simulated";
      continue;
    }
    const matcher = packageRuleMatchers[position];
    if (!matcher) {
      throw new Error(
        `Renovate's matcher registry no longer aligns with the simulator table (index ${position})`,
      );
    }
    try {
      const raw = await matcher.matches(inputConfig, rule);
      if (raw === true) {
        clauses.push({ key: entry.key, value, state: "matched", inputValues, readFields });
      } else if (raw === false) {
        // Roadmap 018: a `false` from a matcher that reads dependency fields
        // NONE of which are set is upstream's fail-closed branch
        // (`if (!sourceUrl) return false`), not a real mismatch — report it as
        // "skipped — no <field> set" and name the missing field(s). Matchers
        // that read nothing off the dependency (matchJsonata) never take this
        // path. Either way the rule still fails to match, exactly as upstream.
        const failClosed = readFields.length > 0 && Object.keys(inputValues).length === 0;
        clauses.push({
          key: entry.key,
          value,
          state: failClosed ? "no-input" : "no-match",
          inputValues,
          readFields,
          ...(failClosed
            ? {
                note: `skipped — no ${humanFieldList(readFields)} set on the simulated dependency`,
              }
            : {}),
        });
        if (verdict === "matched") {
          verdict = "no-match";
        }
      } else {
        clauses.push({
          key: entry.key,
          value,
          state: "not-applicable",
          inputValues,
          readFields,
          note:
            "not applicable — the matcher returned null (it could not evaluate this clause), " +
            "so Renovate skips it and it does not affect whether the rule matches",
        });
      }
    } catch (err) {
      clauses.push({
        key: entry.key,
        value,
        state: "error",
        inputValues,
        readFields,
        note: `matcher threw: ${err instanceof Error ? err.message : String(err)} — treated as not matching`,
      });
      if (verdict === "matched") {
        verdict = "no-match";
      }
    }
  }

  const ignored = Object.keys(rule).filter(
    (key) => (key.startsWith("match") || key.startsWith("exclude")) && !KNOWN_SELECTORS.has(key),
  );
  if (ignored.length > 0) {
    notes.push(
      `no matcher reads ${ignored.map((k) => `\`${k}\``).join(", ")} — Renovate strips such keys without ever matching on them`,
    );
  }

  return { index, verdict, clauses, notes };
}

/** Keys whose value changed between two cumulative configs. */
function diffKeys(before: Record<string, unknown>, after: Record<string, unknown>): MergedKey[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const merged: MergedKey[] = [];
  for (const key of keys) {
    if (!jsonEqual(before[key], after[key])) {
      merged.push({
        key,
        ...(key in before ? { before: before[key] } : {}),
        ...(key in after ? { after: after[key] } : {}),
      });
    }
  }
  return merged;
}

async function execute(input: SimulationInput): Promise<SimulationResult> {
  if (MATCHER_TABLE.length !== packageRuleMatchers.length) {
    throw new Error(
      `Renovate ships ${packageRuleMatchers.length} package-rule matchers but the simulator knows ${MATCHER_TABLE.length}`,
    );
  }
  try {
    memCache.init();
    GlobalConfig.set({} as Parameters<typeof GlobalConfig.set>[0]);

    const depFields = buildDepFields(input.dep);
    // Upstream builds PackageRuleInputConfig by layering the update's fields
    // over the effective config, so rules (e.g. matchJsonata) can reference
    // config-level values too.
    const inputConfig: Record<string, unknown> = { ...input.config, ...depFields };

    const rawRules = Array.isArray(input.config.packageRules) ? input.config.packageRules : [];
    const notes: string[] = [];

    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    if (input.config.packageRules !== undefined) {
      const validation = await validateConfig("repo", {
        packageRules: input.config.packageRules,
      });
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }

    const rules: RuleEvaluation[] = [];
    let config: Record<string, unknown> = { ...inputConfig };
    let anyNotSimulated = false;

    for (const [index, rawRule] of rawRules.entries()) {
      if (!isPlainObject(rawRule)) {
        rules.push({
          index,
          verdict: "no-match",
          clauses: [],
          notes: ["not an object — ignored by the simulator (validation flags it)"],
        });
        continue;
      }
      const evaluation = await evaluateRule(index, inputConfig, rawRule);
      rules.push(evaluation);
      if (evaluation.verdict === "not-simulated") {
        anyNotSimulated = true;
        continue;
      }
      if (evaluation.verdict !== "matched") {
        continue;
      }

      // ---- upstream applyPackageRules merge tail, replicated ----
      const before = config;
      config = { ...config };
      const toApply = removeMatchers(rawRule);
      if (config.groupSlug && rawRule.groupName && !rawRule.groupSlug) {
        toApply.groupSlug = slugifyLite(String(rawRule.groupName));
        evaluation.notes.push(
          "groupSlug derived from groupName with a simplified slugify (ASCII-equivalent to Renovate's)",
        );
      }
      const force = isPlainObject(toApply.force) ? toApply.force : undefined;
      if (force?.enabled === false || (toApply.enabled === false && config.enabled !== false)) {
        config.skipReason = "package-rules";
      }
      if (force?.enabled || toApply.enabled) {
        delete config.skipReason;
        delete config.skipStage;
      }
      if (
        typeof toApply.overrideDatasource === "string" &&
        toApply.overrideDatasource !== config.datasource
      ) {
        config.datasource = toApply.overrideDatasource;
      }
      if (
        typeof toApply.overrideDepName === "string" &&
        toApply.overrideDepName !== config.depName
      ) {
        config.depName = applyTemplate(
          toApply.overrideDepName,
          "overrideDepName",
          evaluation.notes,
        );
      }
      if (
        typeof toApply.overridePackageName === "string" &&
        toApply.overridePackageName !== config.packageName
      ) {
        config.packageName = applyTemplate(
          toApply.overridePackageName,
          "overridePackageName",
          evaluation.notes,
        );
      }
      if (typeof toApply.sourceUrl === "string") {
        toApply.sourceUrl = applyTemplate(toApply.sourceUrl, "sourceUrl", evaluation.notes);
      }
      delete toApply.overrideDatasource;
      delete toApply.overrideDepName;
      delete toApply.overridePackageName;
      config = mergeChildConfig(config, toApply) as Record<string, unknown>;
      evaluation.merged = diffKeys(before, config);
    }

    if (anyNotSimulated) {
      notes.push(
        "a real Renovate run would abort with MISSING_API_CREDENTIALS on the first matchConfidence rule — " +
          "such rules are reported as not simulated and never merge here",
      );
    }

    // ---- upstream flattenUpdates update-type flattening, replicated ----
    // After the packageRules merge, Renovate merges `config[updateType]` up
    // into the config (so `minor: { automerge: true }` becomes
    // `automerge: true` for a minor update) and then drops every update-type
    // block. `rawFinalConfig` keeps the pre-flatten value (006 oracle parity);
    // the display config below reflects the flattening.
    const updateType = typeof config.updateType === "string" ? config.updateType : undefined;
    const blocks: Record<string, Record<string, unknown>> = {};
    for (const key of UPDATE_TYPE_KEYS) {
      if (isPlainObject(config[key])) {
        blocks[key] = config[key] as Record<string, unknown>;
      }
    }
    const preFlatten: Record<string, unknown> = { ...config };
    for (const key of UPDATE_TYPE_KEYS) {
      delete preFlatten[key];
    }
    let flattenedConfig: Record<string, unknown> = { ...config };
    const updateBlock = updateType !== undefined ? config[updateType] : undefined;
    if (isPlainObject(updateBlock)) {
      flattenedConfig = mergeChildConfig(flattenedConfig, updateBlock) as Record<string, unknown>;
    }
    for (const key of UPDATE_TYPE_KEYS) {
      delete flattenedConfig[key];
    }
    const flattenMerged = diffKeys(preFlatten, flattenedConfig);
    if (flattenMerged.length > 0 && updateType) {
      notes.push(
        `update-type flattening merged the \`${updateType}\` block up into the config: ` +
          `${flattenMerged.map((m) => `\`${m.key}\``).join(", ")}`,
      );
    }

    const finalDependencyConfig = { ...flattenedConfig };
    delete finalDependencyConfig.packageRules;
    for (const [key, value] of Object.entries(depFields)) {
      if (key in finalDependencyConfig && jsonEqual(finalDependencyConfig[key], value)) {
        delete finalDependencyConfig[key];
      }
    }

    return {
      rules,
      rawFinalConfig: config,
      finalDependencyConfig,
      flattened: { updateType, merged: flattenMerged, blocks },
      errors,
      warnings,
      notes,
    };
  } finally {
    GlobalConfig.reset();
    memCache.reset();
  }
}
