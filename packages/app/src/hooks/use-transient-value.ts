import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A value that clears itself — the receipt pattern, generalized.
 *
 * `useTransientFlag` (built on this, below its own name) closed a leak class
 * for the boolean case: the sites that hand-rolled
 * `setFlag(true); setTimeout(() => setFlag(false), ms)` and skipped holding the
 * timer leaked it, so an unmount inside the window left a dead setState firing
 * into a gone component.
 *
 * It could only ever return a `boolean`, though, and four sites needed the
 * receipt to CARRY something — a toast's sentence, a share popover's URL — so
 * they could not reuse it and re-hand-rolled the timer, leak and all:
 * `use-app-messages`'s toast, `ShareButton`'s two, and `RuleSimulator`'s pin
 * receipt. Widening it here is what lets all of them share the one timer.
 *
 * The timer lives in a ref and every call replaces the previous one, so a
 * second receipt restarts the window instead of ending it early.
 */
export function useTransientValue<T>(ms: number): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const show = useCallback(
    (next: T) => {
      setValue(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(null), ms);
    },
    [ms],
  );
  return [value, show];
}
