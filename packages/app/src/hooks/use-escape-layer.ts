import { useEffect, useRef } from "react";
import { handleEscape, pushEscapeLayer } from "@/lib/escape-stack";

/**
 * Roadmap 067: the document half of the Escape ladder (`lib/escape-stack.ts`
 * holds the ordering, and holds it purely).
 *
 * ONE listener for the whole app, refcounted here rather than installed per
 * hook instance: with a listener each, every open layer would invoke the stack
 * and the topmost handler would fire once per layer.
 */

let refs = 0;

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) {
    return;
  }
  if (handleEscape()) {
    // Claim the key so a layer BELOW an element-scoped handler (the editor's
    // own Escape, the repo form's) can't also act on the same press.
    event.preventDefault();
  }
}

function retain(): () => void {
  refs += 1;
  if (refs === 1) {
    document.addEventListener("keydown", onKeyDown);
  }
  return () => {
    refs -= 1;
    if (refs === 0) {
      document.removeEventListener("keydown", onKeyDown);
    }
  };
}

/**
 * Makes `onEscape` the topmost Escape layer while `active`. Nothing below it
 * sees the key. The handler is read through a ref, so a layer stays put in the
 * stack across re-renders instead of popping to the top whenever its callback
 * identity changes.
 */
export function useEscapeLayer(active: boolean, onEscape: () => void): void {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;

  useEffect(() => {
    if (!active) {
      return;
    }
    const release = pushEscapeLayer(() => handlerRef.current());
    const stopListening = retain();
    return () => {
      release();
      stopListening();
    };
  }, [active]);
}
