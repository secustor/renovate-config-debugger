import { useEffect, useRef } from "react";
import { mayOwnNativePopup } from "@/hooks/scroll-ergonomics";
import {
  type EscapePriority,
  handleEscape,
  overlayKeyboardOwned,
  pushEscapeLayer,
} from "@/lib/escape-stack";

/**
 * Roadmap 067: the document half of the Escape ladder (`lib/escape-stack.ts`
 * holds the ordering, and holds it purely).
 *
 * ONE listener for the whole app, refcounted here rather than installed per
 * hook instance: with a listener each, every open layer would invoke the stack
 * and the topmost handler would fire once per layer.
 */

let refs = 0;

/**
 * The combobox that has already been handed one Escape since it was last typed
 * into or clicked — see the bail in `onKeyDown`. Module state for the same
 * reason `refs` is: there is one listener, so there is one answer.
 */
let popupGivenAPress: EventTarget | null = null;

/**
 * Anything that can put a native suggestion popup back on screen re-arms the
 * bail: typing (the list re-opens as the query changes), ArrowDown (which opens
 * it outright), Tab into another field, a click on the control. Keys arrive at
 * the listener below; clicks need their own, which is why `retain` installs two.
 */
function rearmPopupPress(): void {
  popupGivenAPress = null;
}

function onKeyDown(event: KeyboardEvent): void {
  // `defaultPrevented` is the ENTIRE editor rule, and no target predicate is
  // needed for it — the one below is about a surface the DOM cannot describe at
  // all, not about the focused element. Verified in the pinned versions rather
  // than assumed:
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
  // top, from wherever they are standing, including a form field.
  if (event.key !== "Escape") {
    rearmPopupPress();
    return;
  }
  if (event.defaultPrevented) {
    return;
  }
  // The one target the ladder does yield to, and the reason is not the element
  // but what the BROWSER may be drawing over it: a `<datalist>` popup, whose
  // Escape closes the suggestions. It reports nothing about ITSELF to the page —
  // no node, no open/close event, and not even a `defaultPrevented` on the press
  // it just consumed — so "did that press belong to the popup?" is unanswerable,
  // while the press itself arrives here regardless, which is how answering it
  // wrong destroyed a layer the user could not see they were dismissing: in the
  // simulator, type into `datasource` until the suggestions appear and press
  // Escape, and the return pill went with them.
  //
  // Narrow on purpose, and narrow three times over.
  //
  // In WHERE: round one's `isTextEditingTarget` bail took Escape away from every
  // field and left layers stranded; this covers only a control that can have a
  // native popup at all (`mayOwnNativePopup` — two fields in this app), so
  // Escape from a text field still reaches the ladder, which is the constraint
  // that fix established.
  //
  // In WHAT IT YIELDS TO — the rule the glossary card states in the other
  // direction: a surface that opened ITSELF cannot outrank one the user opened.
  // Nothing closes a rule-evidence card on blur and it does not trap focus, so a
  // keyboard user can Tab out of it and back into `datasource` with the card
  // still standing, and an unconditional bail left it undismissable from there.
  // `overlayKeyboardOwned()` is `popover` or `menu`: those keep the key.
  //
  // And in HOW LONG. Ranking alone still cost the `ambient` rank everything —
  // the return pill was undismissable from these two fields for the whole
  // session, though the `?` sheet prints Escape as dismissing it, because
  // `ambient` sits below the threshold above. The fix is to treat the popup as
  // what it is, the topmost layer of a ladder we cannot see: it gets the FIRST
  // press after each interaction that could have opened it, and the next press
  // is the page's. So Escape in a combobox reads "close the suggestions, then
  // the pill", which is the same one-layer-per-press story the ladder tells
  // everywhere else — and the cost of guessing wrong is now exactly one wasted
  // keystroke in a field where no popup was open, never a layer destroyed by a
  // press the user aimed at the browser's own popup.
  if (
    mayOwnNativePopup(event.target) &&
    !overlayKeyboardOwned() &&
    popupGivenAPress !== event.target
  ) {
    popupGivenAPress = event.target;
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
    document.addEventListener("pointerdown", rearmPopupPress);
  }
  return () => {
    refs -= 1;
    if (refs === 0) {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", rearmPopupPress);
      // Nothing is listening, so nothing can re-arm — and holding the element
      // would keep a detached node alive until the next app-wide layer opens.
      rearmPopupPress();
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
