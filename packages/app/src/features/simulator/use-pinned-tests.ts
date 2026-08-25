import { useEffect, useInsertionEffect, useRef, useState } from "react";
import type { SimulationResult, TraceResult } from "@renovate-config-debugger/engine";
import type { PinnedTest } from "./pins";
import { runSimulation } from "./run-simulation";
import { errorMessage } from "@/lib/errors";

/**
 * Roadmap 075 (iteration 6): every pinned descriptor, re-simulated against the
 * run on screen.
 *
 * The contract is the one the tab's promise rests on — "re-checked on every
 * run" — so the work is keyed on the RESULT and on the pin list, and on
 * nothing else. It is emphatically not keyed on the editor's text: a keystroke
 * changes neither of those two, the panel holding this hook is memoized on
 * identity-stable props (roadmap 032), and evaluating twenty descriptors per
 * character typed is exactly the regression that contract exists to prevent.
 *
 * Within one run the evaluations are a cache: a pin ADDED to an already-checked
 * run costs one simulation, not twenty. A new run invalidates all of them at
 * once, the same way `useSimulationRun` drops the simulator's own verdict.
 */

export interface PinEvaluation {
  /** The simulation, or null when it failed (see `error`). */
  sim: SimulationResult | null;
  /** The updateType the run actually used — derived, or the pin's own. */
  effectiveUpdateType: string;
  error?: string;
}

export interface PinnedTests {
  /** Finished evaluations for the result on screen, by pin id. A pin with no
   *  entry is still queued behind the ones before it. */
  evaluations: Record<string, PinEvaluation>;
  /** At least one pin is still waiting for its verdict. */
  evaluating: boolean;
}

interface PinState {
  /** The result these evaluations describe — anything else is stale. */
  result: TraceResult | null;
  byId: Record<string, PinEvaluation>;
}

const EMPTY: Record<string, PinEvaluation> = {};

export function usePinnedTests({
  result,
  pins,
}: {
  result: TraceResult;
  pins: PinnedTest[];
}): PinnedTests {
  const [state, setState] = useState<PinState>({ result: null, byId: {} });
  // Read by the async loop below to know what is ALREADY evaluated for this
  // result, without listing `state` in the effect's deps — which would restart
  // the loop after every pin it finishes. The write is `useLatestRef`'s,
  // inlined rather than the helper itself: the effect below reads
  // `stateRef.current.result`, and `exhaustive-deps` only knows a `.current`
  // read is not a dependency when it can see the `useRef()` call — behind a
  // custom hook it demands the DEREFERENCED value, which is the one thing that
  // must never be in this list. An insertion effect lands the value before
  // every effect of the same commit, which is all that reads it.
  const stateRef = useRef(state);
  useInsertionEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    const finalConfig = result.finalConfig;
    let cancelled = false;
    // Snapshot taken before the first await: everything committed for THIS
    // result is done, and anything else has to be (re-)evaluated. A second
    // effect run that overlaps this one can only ever redo a pin whose result
    // had not committed yet, which is idempotent.
    const known = stateRef.current.result === result ? stateRef.current.byId : EMPTY;
    if (stateRef.current.result !== result) {
      setState({ result, byId: {} });
    }
    if (!finalConfig) {
      return;
    }
    void (async () => {
      for (const pin of pins) {
        if (cancelled) {
          return;
        }
        if (known[pin.id]) {
          continue;
        }
        // Roadmap 015: a stored updateType is a deliberate pin (the share-link
        // path reads a link's the same way), so derivation may not replace it.
        const touched = pin.form.updateType.trim() !== "";
        let evaluation: PinEvaluation;
        try {
          const outcome = await runSimulation(finalConfig, pin.form, touched);
          evaluation = { sim: outcome.sim, effectiveUpdateType: outcome.effectiveUpdateType };
        } catch (err) {
          evaluation = {
            sim: null,
            effectiveUpdateType: "",
            error: errorMessage(err),
          };
        }
        if (cancelled) {
          return;
        }
        // The result guard is what keeps a verdict from an abandoned run out of
        // the table a newer run has already started filling.
        setState((prev) =>
          prev.result === result
            ? { result, byId: { ...prev.byId, [pin.id]: evaluation } }
            : { result, byId: { [pin.id]: evaluation } },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result, pins]);

  const evaluations = state.result === result ? state.byId : EMPTY;
  return {
    evaluations,
    evaluating: Boolean(result.finalConfig) && pins.some((pin) => !evaluations[pin.id]),
  };
}
