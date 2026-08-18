import { useMemo, useState } from "react";
import type * as EngineModule from "@renovate-config-debugger/engine";
import type {
  DependencyDescriptor,
  SimulationComparison,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { type FormState, toDescriptor } from "./form";

/**
 * Roadmap 021: the fields two descriptors disagree on, sorted for a stable
 * warning message. Compared via JSON so array-valued fields (lockFiles,
 * registryUrls, categories) and the `isBump` flag (only present when
 * updateType is "bump") are handled the same as everywhere else.
 *
 * Lives here, not in the panel, because it now answers two questions from one
 * definition: what to warn about, and what the comparison's `mode` is — the
 * axis the caller varied, which the engine cannot derive on its own.
 */
export function descriptorDiffKeys(a: DependencyDescriptor, b: DependencyDescriptor): string[] {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const diffs: string[] = [];
  for (const key of keys) {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      diffs.push(key);
    }
  }
  return diffs.toSorted();
}

/** Roadmap 021: the pinned A-run plus the full form snapshot it was run
 *  against (all simulator fields, not just the ones the engine reads) — so
 *  the comparison panel can show and diff exactly what was simulated. */
export interface PinnedRun {
  sim: SimulationResult;
  form: FormState;
  effectiveUpdateType: string;
}

export interface AbComparison {
  pinned: PinnedRun | null;
  pin: () => void;
  unpin: () => void;
  comparison: SimulationComparison | null;
  currentDescriptor: DependencyDescriptor;
}

/**
 * Roadmap 018/021: A/B pinning — a pinned run (A) kept for comparison against
 * the current one (B). Deliberately NOT cleared when a new pipeline result
 * arrives (the whole point is to pin, edit the config, re-run, and compare);
 * only "Unpin" clears it.
 */
export function useAbComparison({
  engineModule,
  sim,
  simForm,
  simEffectiveUpdateType,
  form,
  effectiveUpdateType,
}: {
  engineModule: typeof EngineModule | null;
  sim: SimulationResult | null;
  simForm: FormState | null;
  simEffectiveUpdateType: string;
  form: FormState;
  effectiveUpdateType: string;
}): AbComparison {
  const [pinned, setPinned] = useState<PinnedRun | null>(null);

  // Roadmap 018: the A/B comparison — the pinned run (A) vs the current run (B).
  // Null until a NEW simulation replaces the one that was pinned (comparing a
  // result against itself is not useful — the panel shows a "waiting" hint
  // instead). The comparison logic itself is pure and lives in the engine.
  const comparison = useMemo<SimulationComparison | null>(() => {
    if (!engineModule || !pinned || !sim || pinned.sim === sim) {
      return null;
    }
    // The axis this panel varied: the same hypothetical dependency on both
    // sides means the CONFIG is what moved; a different one means the config
    // never moved at all, so no selector text can have been rewritten.
    // Deliberately read from `simForm` — the form that actually produced `sim`
    // — and not from the live one, which changes on every keystroke.
    const mode = simForm
      ? descriptorDiffKeys(
          toDescriptor(pinned.form, pinned.effectiveUpdateType),
          toDescriptor(simForm, simEffectiveUpdateType),
        ).length > 0
        ? "dependency"
        : "config"
      : "unspecified";
    return engineModule.compareSimulations(pinned.sim, sim, { mode });
  }, [engineModule, pinned, sim, simForm, simEffectiveUpdateType]);

  // Roadmap 021: what the comparison panel treats as "B"'s inputs — the form
  // that actually produced `sim`, or (before any run since pinning, or after
  // a fresh pipeline run cleared `sim`) the live form, so the panel always has
  // something to show/diff against the pinned snapshot.
  const currentDescriptor = useMemo(
    () =>
      simForm
        ? toDescriptor(simForm, simEffectiveUpdateType)
        : toDescriptor(form, effectiveUpdateType),
    [simForm, simEffectiveUpdateType, form, effectiveUpdateType],
  );

  function pin() {
    // Roadmap 021: simForm is set in the same simulate() call as sim, so it is
    // never null wherever this can be clicked — the guard is only to satisfy
    // the type checker, not a real runtime branch.
    if (sim && simForm) {
      setPinned({ sim, form: simForm, effectiveUpdateType: simEffectiveUpdateType });
    }
  }

  function unpin() {
    setPinned(null);
  }

  return { pinned, pin, unpin, comparison, currentDescriptor };
}
