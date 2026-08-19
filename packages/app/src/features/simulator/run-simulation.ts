import type { SimulationResult } from "@renovate-config-debugger/engine";
import { type FormState, toDescriptor } from "./form";

/**
 * The engine call a simulation IS: derive the updateType when the form did not
 * pin one, then hand the descriptor to `simulatePackageRules`.
 *
 * Extracted (roadmap 075, iteration 6) because there are now two callers and
 * they must not be two answers: `useSimulationRun` — the simulator's own
 * on-demand run, with its form state, staleness key and scroll restoration —
 * and `usePinnedTests`, which re-runs every pinned descriptor after each
 * pipeline run. A pin's verdict has to be the verdict the simulator would show
 * for the same descriptor, down to the derived updateType.
 *
 * The engine import is the module-cached dynamic one every simulator path uses,
 * so this costs no extra chunk; `simulatePackageRules` queues on the engine's
 * own task queue, which is what keeps a batch of pins from competing with a
 * simulation the user asked for.
 */

export interface SimulationOutcome {
  sim: SimulationResult;
  /** The updateType the run actually used — derived, or the form's own. */
  effectiveUpdateType: string;
}

/**
 * @param touched Roadmap 015: the caller's updateType is a manual override
 * (the simulator's select, or a stored pin that carries one) rather than a
 * value derivation may replace.
 */
export async function runSimulation(
  config: Record<string, unknown>,
  form: FormState,
  touched: boolean,
): Promise<SimulationOutcome> {
  const engine = await import("@renovate-config-debugger/engine");
  const derived = engine.deriveUpdateType(form.currentValue, form.newValue, form.versioning);
  const effectiveUpdateType = touched || derived === undefined ? form.updateType : derived;
  const sim = await engine.simulatePackageRules({
    config,
    dep: toDescriptor(form, effectiveUpdateType),
  });
  return { sim, effectiveUpdateType };
}
