import { useCallback } from "react";
import { useTransientValue } from "./use-transient-value";

/**
 * A boolean that turns itself off — the "Copied ✓" receipt pattern. Four
 * sites hand-rolled `setFlag(true); setTimeout(() => setFlag(false), ms)`,
 * and the ones that skipped holding the timer leaked it: an unmount inside
 * the window left a dead setState firing into a gone component.
 *
 * The timer lives in `useTransientValue` now, which is this hook with the
 * boolean widened to a payload — four MORE sites needed the receipt to carry
 * a value (a toast's sentence, a popover's URL) and so could not reuse this
 * one. Keeping this name is the point: "did something just happen" is a
 * different question from "what just happened", and the call sites that only
 * ask the first should not have to invent a payload to ask it.
 */
export function useTransientFlag(ms: number): [boolean, () => void] {
  const [value, show] = useTransientValue<true>(ms);
  const flash = useCallback(() => {
    show(true);
  }, [show]);
  return [value === true, flash];
}
