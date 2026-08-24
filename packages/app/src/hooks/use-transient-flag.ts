import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A boolean that turns itself off — the "Copied ✓" receipt pattern. Four
 * sites hand-rolled `setFlag(true); setTimeout(() => setFlag(false), ms)`,
 * and the ones that skipped holding the timer leaked it: an unmount inside
 * the window left a dead setState firing into a gone component. The timer
 * lives in a ref here and every flash replaces the previous one, so a
 * second click restarts the window instead of ending it early.
 */
export function useTransientFlag(ms: number): [boolean, () => void] {
  const [flag, setFlag] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const flash = useCallback(() => {
    setFlag(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlag(false), ms);
  }, [ms]);
  return [flag, flash];
}
