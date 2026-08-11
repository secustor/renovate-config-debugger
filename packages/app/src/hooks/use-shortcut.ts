import { useEffect, useRef } from "react";
import { isTextEditingTarget } from "@/hooks/scroll-ergonomics";
import { overlayKeyboardOwned } from "@/lib/escape-stack";
import { matchShortcut, type Shortcut } from "@/lib/shortcuts";

/**
 * Roadmap 067: binds one registry entry (`lib/shortcuts.ts`) to a handler for
 * as long as the component is mounted.
 *
 * Four rules are enforced here rather than at each call site:
 *
 * - **An already-handled key is left alone.** The editor's own ⌘⏎ handler calls
 *   `preventDefault()` (see `run-keymap.ts`), so the page listener bailing on
 *   `defaultPrevented` is what keeps ⌘⏎ inside the editor from running the
 *   pipeline twice.
 * - **A held key starts one action, not one per repeat — but stays claimed for
 *   the whole hold.** `event.repeat` marks every OS auto-repeat after the
 *   first. Without the first half, holding ⌘⏎ asks for a pipeline run per
 *   repeat; without the second, the repeats go to the browser's default for a
 *   chord we own.
 * - **Bare-key shortcuts never fire while the user is typing, or while a
 *   popover or menu is up.** Modified ones deliberately still fire in both
 *   cases: ⌘⏎ has to work from inside the editor and the simulator's fields,
 *   which is the whole point of it.
 * - **The handler is read through a ref**, so the window listener is installed
 *   once and never churns with a per-render callback identity — the keystroke
 *   render budget (032) pays nothing for this.
 */
export function useShortcut(
  shortcut: Shortcut,
  handler: () => void,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !matchShortcut(event, shortcut)) {
        return;
      }
      // A bare key never fires while the user is typing — `isTextEditingTarget`
      // counts a focused `<select>` too, so `e` and `r` cannot eat its
      // type-ahead — nor while a popover or menu is drawn over the page, which
      // no predicate about the FOCUSED element can see: the rule-evidence card
      // is portalled to `<body>` and takes focus itself. Escape first, then the
      // jump. Modified chords always fire: ⌘⏎ working from inside the editor is
      // the point of them.
      if (!shortcut.mod && (isTextEditingTarget(event.target) || overlayKeyboardOwned())) {
        return;
      }
      event.preventDefault();
      // A held key is one intent, however long it is held. Deliberately AFTER
      // `preventDefault`: a chord we own stays owned for the whole hold, or the
      // browser gets back every repeat we declined — a held `?` in Firefox then
      // opens its quick-find bar behind the sheet, which swallows the
      // keystrokes that follow. Not running the action again is the only thing
      // a repeat may change.
      if (event.repeat) {
        return;
      }
      handlerRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut, enabled]);
}
