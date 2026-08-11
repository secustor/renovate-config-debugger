import { useEffect, useRef } from "react";
import { isEditorTarget } from "@/hooks/scroll-ergonomics";
import { type EscapePriority, handleEscape, pushEscapeLayer } from "@/lib/escape-stack";

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
  // 067: "Escape inside the editor is the editor's own and never reaches the
  // page ladder". It has to be enforced HERE, not asked for politely: the
  // editor's Escape is CodeMirror's `simplifySelection`, which runs on every
  // press and neither prevents the default nor stops propagating when there is
  // nothing to simplify — so a press meant for the editor would also pop the
  // topmost layer. Our own element-scoped handlers claim the key with
  // `stopPropagation()` instead (the repo-load form's, a glossary term's); a
  // third-party keymap cannot be asked to.
  //
  // The editor ONLY — not `isTextEditingTarget`, which the bare-key layer uses
  // and which counts every text input and `<select>` as typing. Escape is not a
  // bare key competing with what the user is writing: it dismisses whatever is
  // on top, and a layer the user opened has to stay dismissible from the field
  // they moved to afterwards (the simulator's return pill while the caret sits
  // in `packageName`, the session menu, a popover reached by Tab from a filter
  // select). Every one of those was undismissable while this read the wide
  // predicate.
  if (isEditorTarget(event.target)) {
    return;
  }
  if (handleEscape()) {
    // Claim the key so nothing downstream of this listener acts on the same
    // press — and so a `<dialog>`'s or a `<details>`'s native Escape default
    // cannot fire behind the layer that just consumed it.
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
 * Registers `onEscape` on the ladder at `priority` while `active`. Only the
 * winning layer sees the key — highest priority, then most recently pushed, so
 * a caller states what it IS rather than relying on when it mounted. The
 * handler is read through a ref, so a layer stays put in the stack across
 * re-renders instead of re-registering whenever its callback identity changes.
 */
export function useEscapeLayer(
  active: boolean,
  onEscape: () => void,
  priority: EscapePriority,
): void {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;

  useEffect(() => {
    if (!active) {
      return;
    }
    const release = pushEscapeLayer(() => handlerRef.current(), priority);
    const stopListening = retain();
    return () => {
      release();
      stopListening();
    };
  }, [active, priority]);
}
