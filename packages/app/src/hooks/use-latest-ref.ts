import { type RefObject, useInsertionEffect, useRef } from "react";

/**
 * The "latest-ref idiom" (roadmap 032), named once instead of re-spelled at
 * every site: a ref that always holds the value from the CURRENT render, so an
 * effect or a `useCallback` with an empty dependency list can reach the fresh
 * value without re-registering — which is what keeps the memoized panels'
 * props identity-stable and the keystroke render budget flat.
 *
 * The write happens in a `useInsertionEffect`, not during render, which is
 * what `react/refs` asks for and is also the more honest spelling of the
 * invariant the idiom always had: the ref is only ever READ after the commit
 * (an effect, an event handler), never during the render that produces the
 * value. Insertion effects run in the mutation phase — before every layout and
 * passive effect of the same commit, and before any handler can fire — so
 * every legitimate reader still sees this render's value, while a render React
 * throws away now leaves the ref untouched instead of poisoning it. The
 * `useRef` seed covers the first render, which has no earlier commit to
 * inherit from.
 *
 * A site that needs to read the ref during render, or that writes it
 * conditionally, is NOT this idiom and keeps its own `useRef`.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}
