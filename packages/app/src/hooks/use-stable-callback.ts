import { useCallback } from "react";
import { useLatestRef } from "./use-latest-ref";

/**
 * The forwarding half of the latest-ref idiom (roadmap 032), named once: a
 * callback whose IDENTITY never changes while every call still runs the
 * CURRENT render's closure. Twelve sites had hand-spelled the pair.
 *
 * The wrapper's dependency is the REF, not the function it holds — a ref
 * object's identity never changes, so the wrapper is declared once for the
 * component's lifetime. That is what keeps a memoized panel's props stable
 * across a keystroke while its handlers still read this render's state.
 *
 * Same rule as {@link useLatestRef}: only for callbacks invoked AFTER the
 * commit (an event handler, an effect). A value read during render is not this
 * idiom and keeps its own `useRef`.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const fnRef = useLatestRef(fn);
  return useCallback((...args: A) => fnRef.current(...args), [fnRef]);
}
