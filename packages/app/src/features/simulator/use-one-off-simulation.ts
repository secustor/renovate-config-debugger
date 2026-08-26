import { useCallback, useState } from "react";
import type {
  ProvenanceLayer,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import type { FormState } from "@/types/simulator";
import { buildPinOutcome, type PinOutcome } from "./pin-outcome";
import { pinName } from "./pins";
import { runSimulation } from "./run-simulation";

/**
 * "Check this dependency once, without pinning it" — the new-pin card's own
 * simulation.
 *
 * Two state slots and an async run in `AddTestBox`, which had eleven state
 * slots and no obvious reason why these two were among them. They are a pair:
 * `simulating` exists only to keep a second click from starting a second run
 * while the first is in flight, and the result is only meaningful next to it.
 *
 * The verdict carries the RUN it belongs to, and the card only renders it while
 * that run is still the one on screen — anything else makes it stale, and a
 * stale verdict about the reader's own dependency is worse than none.
 */

export interface OneOff {
  /** The run the verdict belongs to — anything else on screen makes it stale. */
  result: TraceResult;
  form: FormState;
  outcome: PinOutcome;
  effectiveUpdateType: string;
}

export interface OneOffSimulation {
  /** The last verdict, or null. Check `oneOff.result === result` before
   *  rendering it — see the type's own note. */
  oneOff: OneOff | null;
  /** In flight. The submit control reads this to disable itself. */
  simulating: boolean;
  /** Run the form once against the current result. A no-op while one is in
   *  flight, or when the form does not pass the caller's guard. */
  simulate: (form: FormState, updateTypeTouched: boolean) => void;
  /** Drop the verdict — the form has moved on and the card would be lying. */
  clear: () => void;
}

export interface OneOffSimulationHost {
  /** The run to simulate against. */
  result: TraceResult;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  /** The form hook's emptiness guard — the same one a pin has to pass. */
  guard: (form: FormState) => boolean;
}

export function useOneOffSimulation(host: OneOffSimulationHost): OneOffSimulation {
  const { result, layerByIndex, attribution, guard } = host;
  const [oneOff, setOneOff] = useState<OneOff | null>(null);
  const [simulating, setSimulating] = useState(false);

  const simulate = useCallback(
    (form: FormState, updateTypeTouched: boolean) => {
      const finalConfig = result.finalConfig;
      if (!guard(form) || !finalConfig || simulating) {
        return;
      }
      setSimulating(true);
      // Snapshotted because the run is async and the form stays editable: the
      // verdict has to describe the descriptor that was actually run.
      const snapshot = { ...form };
      void runSimulation(finalConfig, snapshot, updateTypeTouched)
        .then(({ sim, effectiveUpdateType: ranType }) => {
          const outcome = buildPinOutcome(sim, layerByIndex, attribution, pinName(snapshot));
          setOneOff({ result, form: snapshot, outcome, effectiveUpdateType: ranType });
          return undefined;
        })
        .finally(() => setSimulating(false));
    },
    [result, layerByIndex, attribution, guard, simulating],
  );

  const clear = useCallback(() => {
    setOneOff(null);
  }, []);

  return { oneOff, simulating, simulate, clear };
}
