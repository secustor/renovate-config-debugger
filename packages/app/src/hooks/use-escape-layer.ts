import { useEffect, useRef } from "react";
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
  // `defaultPrevented` is the ENTIRE editor rule, and no target predicate is
  // needed beside it. Verified in the pinned versions rather than assumed:
  //
  // - `@codemirror/commands@6.10.4` binds Escape to `simplifySelection`, which
  //   returns FALSE when there is nothing to simplify (`dist/index.js:1147` — a
  //   single empty range). So do the other two Escape bindings `basicSetup`
  //   installs, `closeCompletion` (no open completion) and `closeSearchPanel`
  //   (no panel), and none of the three carries `preventDefault: true`.
  // - `@codemirror/view@6.43.8` calls `preventDefault()` on the event only for
  //   a handler that returned true (`dist/index.js:4562`), and its keymap
  //   handler returns whether a command ran (`runHandlers`, :9161).
  //
  // So CodeMirror claims Escape exactly when it acts on it, and the check below
  // already stands aside for that — while a press the editor did nothing with
  // reaches the ladder, which is what a user pressing Escape with a popover
  // open meant. An `isEditorTarget` bail on top of it stranded layers instead:
  // 067's own `e` shortcut jumps focus INTO the editor, so a rule-evidence
  // card, the session menu or the return pill opened beforehand became
  // undismissable by keyboard until the user tabbed back out.
  //
  // Not `isTextEditingTarget` either, for the reason that predicate exists: it
  // counts every text input and `<select>` as typing, and Escape is not a bare
  // key competing with what the user is writing — it dismisses whatever is on
  // top, from wherever they are standing.
  if (event.key !== "Escape" || event.defaultPrevented) {
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
