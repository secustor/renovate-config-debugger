import type { TraceEvent, TraceResult } from "@renovate-config-debugger/engine";
import { presetTreeSummary, type TreeSummary } from "./preset-tree-stats";
import type { DigestInput, DigestProblem } from "./run-digest";
import type { EffectiveTally } from "./effective-tally";

/**
 * Roadmap 058: the run's derived facts and the digest's input, as pure
 * functions. `use-run-summary.ts` (the React hook) used to hold both inline,
 * which made them unreachable from anything without React — so the CLI's
 * `rcd digest` would have had to restate the assembly that 029 exists to keep
 * single-sourced ("a number in the paragraph can never disagree with the badge
 * beside it"). The hook now memoizes {@link deriveRunFacts} and feeds it to
 * {@link buildDigestInput}; the CLI calls the same two functions.
 */

export interface RunFacts {
  /** Granular migrate-stage steps (004) — the Rewrites tab badge. */
  migrateSteps: TraceEvent[];
  /** The migrate stage's final whole-document snapshot. */
  finalMigrated: unknown;
  /**
   * Roadmap 028: preset-resolution failures render in the Problems tab
   * alongside the validator's errors/warnings, so they count toward its badge.
   */
  presetErrors: TraceEvent[];
  /** Null when the run resolved no preset tree at all. */
  presetSummary: TreeSummary | null;
  /** Unique resolved presets — the Presets tab badge. */
  presetCount: number;
  /** Validator errors PLUS preset-resolution failures. */
  errorCount: number;
  warningCount: number;
}

/**
 * The exact config `validateConfig("repo", …)` ran against (post-migrate/
 * massage, pre-preset-merge). It matches the `packageRules[N]` indices those
 * messages name, so a suggested fix's path resolves against the SAME snapshot
 * the message was produced from — which is what `translateMessage` wants.
 */
export function validatedConfigOf(result: TraceResult): Record<string, unknown> | null {
  const event = result.events.find((e) => e.stage === "massage" && e.kind === "stage-complete");
  return (event?.after as Record<string, unknown> | undefined) ?? null;
}

/**
 * One pass over the event stream for every count a finished run reports. The
 * result is stable per `TraceResult`, so callers memoize it on the result
 * object (the tree summary underneath is itself cached per tree).
 */
export function deriveRunFacts(result: TraceResult | null): RunFacts {
  const migrateSteps: TraceEvent[] = [];
  const presetErrors: TraceEvent[] = [];
  let finalMigrated: unknown;
  for (const event of result?.events ?? []) {
    if (event.stage === "migrate") {
      if (event.kind === "migration-applied") {
        migrateSteps.push(event);
      } else if (event.kind === "stage-complete") {
        finalMigrated = event.after;
      }
    } else if (event.kind === "preset-error") {
      presetErrors.push(event);
    }
  }
  const presetSummary = presetTreeSummary(result?.presetTree);
  return {
    migrateSteps,
    finalMigrated,
    presetErrors,
    presetSummary,
    presetCount: presetSummary?.resolved ?? 0,
    errorCount: (result?.errors.length ?? 0) + presetErrors.length,
    warningCount: result?.warnings.length ?? 0,
  };
}

/** The Problems tab lists validator errors, then warnings, then preset
 *  failures — the digest quotes whichever of those comes first. */
function firstProblem(result: TraceResult, facts: RunFacts): DigestProblem | undefined {
  const error = result.errors[0];
  if (error) {
    return { severity: "error", topic: error.topic, message: error.message };
  }
  const warning = result.warnings[0];
  if (warning) {
    return { severity: "warning", topic: warning.topic, message: warning.message };
  }
  const presetError = facts.presetErrors[0];
  return presetError
    ? { severity: "error", topic: "Preset", message: presetError.title }
    : undefined;
}

/** A rewrite reads best as `old → new`, anything else by the key it acted on. */
function migrationLabel(step: TraceEvent): string {
  const info = step.migration;
  if (!info) {
    return step.title;
  }
  return info.key && info.newKey ? `${info.key} → ${info.newKey}` : (info.key ?? info.name);
}

/**
 * Roadmap 029: everything the Overview paragraph quotes, assembled from
 * exactly the derivations that feed the tab badges. `effective` is null while
 * provenance is still being computed (the browser computes it asynchronously);
 * the digest then says so rather than quoting a number it does not have.
 *
 * Every signal below is a run-level aggregate or provenance keyed per
 * TOP-LEVEL config key, so an edit confined to one `packageRules` entry moves
 * none of them and the paragraph comes out unchanged. That ceiling is
 * deliberate: rule-level differences belong to the simulator and to
 * `rcd compare`, not to the orientation paragraph.
 */
export function buildDigestInput(
  result: TraceResult,
  facts: RunFacts,
  effective: EffectiveTally | null,
): DigestInput {
  const problem = firstProblem(result, facts);
  return {
    // A parse failure ends the run: the only honest thing to report is why.
    ...(result.stageStatus.parse === "error"
      ? { fatalParse: result.errors[0]?.message ?? "the file could not be parsed" }
      : {}),
    refused: result.stageStatus.validate === "error",
    errors: facts.errorCount,
    warnings: facts.warningCount,
    ...(problem ? { firstProblem: problem } : {}),
    migrations: {
      count: facts.migrateSteps.length,
      // Named only when the digest will use them (≤ 2 rewrites).
      labels: facts.migrateSteps.length <= 2 ? facts.migrateSteps.map(migrationLabel) : [],
    },
    presets: {
      // Nested extends (packageRules[n].extends) are not entries the user
      // wrote at the top level, so they are not named as such.
      entries: (result.presetTree?.children ?? []).filter((c) => !c.nested).map((c) => c.name),
      resolved: facts.presetCount,
      optionSetting: facts.presetSummary?.optionSetting ?? 0,
      rules: facts.presetSummary?.rules ?? 0,
      // The tree's own error count, so the clause matches the Presets tab it
      // links to (the Problems badge additionally counts validator errors).
      failed: facts.presetSummary?.errors ?? 0,
      injected: result.usedInjections.length,
    },
    effective: {
      options: effective?.keys ?? null,
      overridden: effective?.overridden ?? null,
    },
    layers: {
      global: Boolean(result.layerConfigs?.globalResolved),
      inherited: Boolean(result.layerConfigs?.inheritedResolved),
    },
  };
}
