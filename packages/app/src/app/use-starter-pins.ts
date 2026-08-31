import { useEffect } from "react";
import type { RuleAttribution, TraceResult } from "@renovate-config-debugger/engine";
import { deriveStarterPins } from "@/features/simulator/starter-pins";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 091 — WHEN the starter pins are seeded. (WHAT they are is
 * `features/simulator/starter-pins.ts`; the shell computes, the feature
 * draws.)
 *
 * The design's landing transition ends with the Tests pane sliding in, and the
 * pane's whole promise — "these are the updates I care about, tell me when an
 * edit changes what happens to them" — reads as an instruction manual when the
 * list under it is empty. So the FIRST run that settles seeds up to two
 * descriptors derived from the reader's own rules, and nothing after it does:
 * the latch inside `usePinnedRun` trips here whether or not anything was
 * derived, so a reader who deletes them, or who was already pinning, is never
 * seeded over.
 *
 * "Their own rules" is provenance's answer, not a guess: the resolved
 * `packageRules` are filtered to the entries the REPO config contributed
 * (roadmap 013's `computeRuleProvenance`), because a starter derived from
 * `config:best-practices` would demonstrate a decision the reader never made.
 * Provenance is a per-run promise, so the effect waits for it — `undefined` is
 * "still computing", `null` is "unavailable", and only the second one is an
 * answer (no rules to derive from, latch tripped, empty state stays).
 */
export function useStarterPins({
  result,
  ruleProvenance,
  seedStarterPins,
}: {
  result: TraceResult | null;
  ruleProvenance: RuleAttribution[] | null | undefined;
  seedStarterPins: (forms: FormState[]) => void;
}): void {
  useEffect(() => {
    const rules = result?.finalConfig?.packageRules;
    if (!result?.finalConfig || ruleProvenance === undefined) {
      return;
    }
    if (ruleProvenance === null || !Array.isArray(rules)) {
      seedStarterPins([]);
      return;
    }
    const own = new Set(
      ruleProvenance.filter((entry) => entry.layer.kind === "repo").map((entry) => entry.index),
    );
    seedStarterPins(deriveStarterPins((rules as unknown[]).filter((_, index) => own.has(index))));
  }, [result, ruleProvenance, seedStarterPins]);
}
