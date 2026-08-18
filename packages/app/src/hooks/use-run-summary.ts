/**
 * Roadmap 048 — the run summary: every number App.tsx derives from a finished
 * pipeline result, as one hook. It is a pure derivation over `result` and the
 * effective-config view's reported stats — no state moves here, and App still
 * owns both inputs.
 *
 * What makes it ONE concept rather than a bag of memos is the contract 029
 * stated for the Overview digest and 075 moved into the header: the numbers a
 * reader steers by are assembled from exactly the derivations that feed the tab
 * badges, "so a number in the paragraph can never disagree with the badge
 * beside it". The paragraph is gone (iteration 3 — the header's jump-links
 * carry the numbers, the clause model stays the CLI's), the guarantee is not:
 * `AppShellHeader` is handed these counts rather than deriving its own.
 *
 * Roadmap 058 moved the counting into `lib/run-facts.ts` as plain functions, so
 * the CLI quotes the same numbers by importing them; what stays here is the
 * memoization and the tab-strip shape, which are React concerns.
 */
import { useMemo } from "react";
import type { TraceEvent, TraceResult } from "@renovate-config-debugger/engine";
import type { EffectiveStats } from "@/components/EffectiveConfig";
import type { ResultsTabDescriptor } from "@/components/ResultsPanel";
import { RESULTS_TAB_IDS, type ResultsTabId } from "@/data/results-tabs";
import { deriveRunFacts } from "@/lib/run-facts";

export interface RunSummary {
  migrateSteps: TraceEvent[];
  finalMigrated: unknown;
  migrateStepperMounted: boolean;
  /** Roadmap 075: the presets the run resolved — the Presets tab's badge, and
   *  (iteration 2) the header digest link that opens it. Exposed rather than
   *  re-derived in the header, for the reason the digest itself is assembled
   *  here: one count, quoted everywhere it appears. */
  presetCount: number;
  errorCount: number;
  warningCount: number;
  /** Rebuilt every render on purpose — see the note at its declaration. */
  resultsTabs: ResultsTabDescriptor[];
}

export function useRunSummary(
  result: TraceResult | null,
  effectiveStats: EffectiveStats | null,
): RunSummary {
  // One pass over the event stream per RESULT for every count below: the
  // migrate steps and the stage's final snapshot (004), the preset-resolution
  // failures the Problems tab lists (028), and the preset expansion totals.
  const facts = useMemo(() => deriveRunFacts(result), [result]);

  // Roadmap 028/075: the migration stepper lives on the Pipeline tab's migrate
  // stage, and "mounted" here means only that the run PRODUCED steps — which is
  // what decides whether a share link carries an index at all, independently of
  // which stage happens to be selected when the link is made.
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
    // Roadmap 075 (iteration 3): no count yet — a "test" is still the one
    // descriptor in the simulator's form. Iteration 6 pins several, and that is
    // the number this badge will carry.
    tests: {},
    pipeline: {},
    presets: { count: facts.presetCount },
    // Provenance is computed asynchronously by the effective-config view; no
    // badge until it reports, rather than a wrong zero.
    effective: { count: effectiveStats?.keys },
    problems: {
      count: facts.errorCount + facts.warningCount,
      tone: facts.errorCount > 0 ? "error" : facts.warningCount > 0 ? "warn" : undefined,
    },
  };
  const resultsTabs: ResultsTabDescriptor[] = RESULTS_TAB_IDS.map((id) => ({
    id,
    ...tabData[id],
  }));

  return {
    migrateSteps: facts.migrateSteps,
    finalMigrated: facts.finalMigrated,
    migrateStepperMounted,
    presetCount: facts.presetCount,
    errorCount: facts.errorCount,
    warningCount: facts.warningCount,
    resultsTabs,
  };
}
