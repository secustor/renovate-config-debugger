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
 *
 * Roadmap 058 moved both halves into `lib/run-facts.ts` as plain functions, so
 * the CLI quotes the same numbers by importing them; what stays here is the
 * memoization and the tab-strip shape, which are React concerns.
 */
import { useMemo } from "react";
import type { TraceEvent, TraceResult } from "@renovate-config-debugger/engine";
import type { EffectiveStats } from "@/components/EffectiveConfig";
import type { ResultsTabDescriptor } from "@/components/ResultsPanel";
import { RESULTS_TAB_IDS, type ResultsTabId } from "@/data/results-tabs";
import { buildRunDigest, type DigestClause } from "@/lib/run-digest";
import { buildDigestInput, deriveRunFacts } from "@/lib/run-facts";

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
  // One pass over the event stream per RESULT for every count below: the
  // migrate steps and the stage's final snapshot (004), the preset-resolution
  // failures the Problems tab lists (028), and the preset expansion totals.
  const facts = useMemo(() => deriveRunFacts(result), [result]);

  // Roadmap 028: the migration stepper lives in the Rewrites tab and stays
  // mounted whenever the run produced steps, so a link can always carry its
  // index (it no longer depends on which stage is selected).
  const migrateStepperMounted = facts.migrateSteps.length > 0;

  // Roadmap 028: the tab strip's ambient counts. A tab whose run produced
  // nothing keeps its place (dimmed, showing its zero) rather than
  // disappearing; `undefined` marks the tabs that have no count to give.
  // Deliberately NOT memoized: this array is rebuilt on every render, exactly
  // as it was when it lived in App.tsx's body. Memoizing it here would change
  // the identity of ResultsPanel's `tabs` prop across renders that currently
  // hand it a fresh one, which is a behavior change, not a cleanup.
  //
  // Roadmap 068 review: MAPPED over `RESULTS_TAB_IDS` (data/results-tabs.ts)
  // rather than written out as a same-length literal — `useTabDigits` (App.tsx)
  // is wired to `resultsTabs.length` while the `?` sheet's digit range
  // (`lib/shortcuts.ts`) reads `RESULTS_TAB_IDS.length` directly, and a
  // hand-matched literal here only agreed with that by coincidence. Keying
  // `tabData` by `ResultsTabId` makes the two structurally unable to drift:
  // adding a tab to `RESULTS_TAB_IDS` (062 adds one) fails this file's
  // typecheck until `tabData` grows a matching entry, rather than silently
  // shipping a strip one tab short of what the sheet advertises.
  const tabData: Record<ResultsTabId, Omit<ResultsTabDescriptor, "id">> = {
    overview: {},
    pipeline: {},
    rewrites: { count: facts.migrateSteps.length },
    presets: { count: facts.presetCount },
    // Provenance is computed asynchronously by the effective-config view; no
    // badge until it reports, rather than a wrong zero.
    effective: { count: effectiveStats?.keys },
    simulator: {},
    problems: {
      count: facts.errorCount + facts.warningCount,
      tone: facts.errorCount > 0 ? "error" : facts.warningCount > 0 ? "warn" : undefined,
    },
  };
  const resultsTabs: ResultsTabDescriptor[] = RESULTS_TAB_IDS.map((id) => ({
    id,
    ...tabData[id],
  }));

  /**
   * Roadmap 029: the Overview's plain-English digest. Assembled from exactly
   * the derivations that feed the tab badges above (preset summary, migration
   * steps, the effective-config view's reported stats, the problem counts), so
   * a number in the paragraph can never disagree with the badge beside it.
   * The clause logic itself lives in the pure `run-digest` module.
   */
  const digest = useMemo(
    () => (result ? buildRunDigest(buildDigestInput(result, facts, effectiveStats)) : []),
    [result, facts, effectiveStats],
  );

  return {
    migrateSteps: facts.migrateSteps,
    finalMigrated: facts.finalMigrated,
    migrateStepperMounted,
    errorCount: facts.errorCount,
    warningCount: facts.warningCount,
    resultsTabs,
    digest,
  };
}
