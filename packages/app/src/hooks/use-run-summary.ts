/**
 * Roadmap 048 — the run summary: every number App.tsx derives from a finished
 * pipeline result, as one hook. It is a pure derivation over `result` and the
 * effective-config view's reported stats — no state moves here, and App still
 * owns both inputs.
 *
 * What makes it ONE concept rather than a bag of memos is the digest's own
 * contract (029, restated below): the Overview paragraph is assembled from
 * exactly the derivations that feed the tab badges, "so a number in the
 * paragraph can never disagree with the badge beside it". Splitting the badge
 * counts from the digest would be splitting the two halves of that guarantee.
 */
import { useMemo } from "react";
import type { TraceEvent, TraceResult } from "@renovate-config-visualizer/engine";
import type { EffectiveStats } from "@/components/EffectiveConfig";
import { presetTreeSummary } from "@/components/preset-tree-stats";
import type { ResultsTabDescriptor } from "@/components/ResultsPanel";
import {
  buildRunDigest,
  type DigestClause,
  type DigestInput,
  type DigestProblem,
} from "@/lib/run-digest";

export interface RunSummary {
  migrateSteps: TraceEvent[];
  finalMigrated: unknown;
  migrateStepperMounted: boolean;
  errorCount: number;
  warningCount: number;
  /** Rebuilt every render on purpose — see the note at its declaration. */
  resultsTabs: ResultsTabDescriptor[];
  digest: DigestClause[];
}

export function useRunSummary(
  result: TraceResult | null,
  effectiveStats: EffectiveStats | null,
): RunSummary {
  // Granular migrate-stage steps (004); the migrate stage shows the stepper
  // when any exist, otherwise falls back to the whole-stage blob diff.
  const migrateSteps = useMemo(
    () =>
      result?.events.filter((e) => e.stage === "migrate" && e.kind === "migration-applied") ?? [],
    [result],
  );
  const finalMigrated = useMemo(
    () =>
      result?.events.findLast((e) => e.stage === "migrate" && e.kind === "stage-complete")?.after,
    [result],
  );

  // Roadmap 028: the migration stepper lives in the Rewrites tab and stays
  // mounted whenever the run produced steps, so a link can always carry its
  // index (it no longer depends on which stage is selected).
  const migrateStepperMounted = migrateSteps.length > 0;

  // Roadmap 028: preset-resolution failures render in the Problems tab
  // alongside the validator's errors/warnings, so they count toward its badge.
  // One filter pass per result (032): the badge counts these and the digest
  // quotes the first one — both previously re-filtered the event stream.
  const presetErrors = useMemo(
    () => result?.events.filter((e) => e.kind === "preset-error") ?? [],
    [result],
  );
  const presetErrorCount = presetErrors.length;
  const errorCount = (result?.errors.length ?? 0) + presetErrorCount;
  const warningCount = result?.warnings.length ?? 0;
  const presetSummary = useMemo(() => presetTreeSummary(result?.presetTree), [result]);
  const presetCount = presetSummary?.resolved ?? 0;

  // Roadmap 028: the tab strip's ambient counts. A tab whose run produced
  // nothing keeps its place (dimmed, showing its zero) rather than
  // disappearing; `undefined` marks the tabs that have no count to give.
  // Deliberately NOT memoized: this array is rebuilt on every render, exactly
  // as it was when it lived in App.tsx's body. Memoizing it here would change
  // the identity of ResultsPanel's `tabs` prop across renders that currently
  // hand it a fresh one, which is a behavior change, not a cleanup.
  const resultsTabs: ResultsTabDescriptor[] = [
    { id: "overview" },
    { id: "pipeline" },
    { id: "rewrites", count: migrateSteps.length },
    { id: "presets", count: presetCount },
    // Provenance is computed asynchronously by the effective-config view; no
    // badge until it reports, rather than a wrong zero.
    { id: "effective", count: effectiveStats?.keys },
    { id: "simulator" },
    {
      id: "problems",
      count: errorCount + warningCount,
      tone: errorCount > 0 ? "error" : warningCount > 0 ? "warn" : undefined,
    },
  ];

  /**
   * Roadmap 029: the Overview's plain-English digest. Assembled from exactly
   * the derivations that feed the tab badges above (preset summary, migration
   * steps, the effective-config view's reported stats, the problem counts), so
   * a number in the paragraph can never disagree with the badge beside it.
   * The clause logic itself lives in the pure `run-digest` module.
   */
  const digest = useMemo(() => {
    if (!result) {
      return [];
    }
    // The Problems tab lists validator errors, then warnings, then preset
    // failures — the digest quotes whichever of those comes first.
    const firstProblem: DigestProblem | undefined = result.errors[0]
      ? { severity: "error", topic: result.errors[0].topic, message: result.errors[0].message }
      : result.warnings[0]
        ? {
            severity: "warning",
            topic: result.warnings[0].topic,
            message: result.warnings[0].message,
          }
        : presetErrors[0]
          ? { severity: "error", topic: "Preset", message: presetErrors[0].title }
          : undefined;
    const input: DigestInput = {
      // A parse failure ends the run: the only honest thing to report is why.
      ...(result.stageStatus.parse === "error"
        ? { fatalParse: result.errors[0]?.message ?? "the file could not be parsed" }
        : {}),
      refused: result.stageStatus.validate === "error",
      errors: errorCount,
      warnings: warningCount,
      ...(firstProblem ? { firstProblem } : {}),
      migrations: {
        count: migrateSteps.length,
        // Named only when the digest will use them (≤ 2 rewrites); a rename
        // reads best as `old → new`, anything else by the key it acted on.
        labels:
          migrateSteps.length <= 2
            ? migrateSteps.map((step) => {
                const info = step.migration;
                if (!info) {
                  return step.title;
                }
                return info.key && info.newKey
                  ? `${info.key} → ${info.newKey}`
                  : (info.key ?? info.name);
              })
            : [],
      },
      presets: {
        // Nested extends (packageRules[n].extends) are not entries the user
        // wrote at the top level, so they are not named as such.
        entries: (result.presetTree?.children ?? []).filter((c) => !c.nested).map((c) => c.name),
        resolved: presetCount,
        optionSetting: presetSummary?.optionSetting ?? 0,
        rules: presetSummary?.rules ?? 0,
        // The tree's own error count, so the clause matches the Presets tab it
        // links to (the Problems badge additionally counts validator errors).
        failed: presetSummary?.errors ?? 0,
        injected: result.usedInjections.length,
      },
      effective: {
        options: effectiveStats?.keys ?? null,
        overridden: effectiveStats?.overridden ?? null,
      },
      layers: {
        global: Boolean(result.layerConfigs?.globalResolved),
        inherited: Boolean(result.layerConfigs?.inheritedResolved),
      },
    };
    return buildRunDigest(input);
  }, [
    result,
    presetErrors,
    errorCount,
    warningCount,
    migrateSteps,
    presetCount,
    presetSummary,
    effectiveStats,
  ]);

  return {
    migrateSteps,
    finalMigrated,
    migrateStepperMounted,
    errorCount,
    warningCount,
    resultsTabs,
    digest,
  };
}
