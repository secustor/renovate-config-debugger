import { type RefObject, useRef } from "react";

/**
 * The "latest-ref idiom" (roadmap 032), named once instead of re-spelled at
 * every site: a ref that always holds the value from the CURRENT render, so an
 * effect or a `useCallback` with an empty dependency list can reach the fresh
 * value without re-registering — which is what keeps the memoized panels'
 * props identity-stable and the keystroke render budget flat.
 *
 * Assigning during render is deliberate and safe here: the ref is only ever
 * READ from an effect or an event handler (i.e. after the commit), never during
 * the render that writes it, so a render React discards leaves nothing behind.
 * A site that needs to read the ref during render, or that writes it
 * conditionally, is NOT this idiom and keeps its own `useRef`.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
