import { useEffect, useRef } from "react";
import { isTextEditingTarget } from "@/hooks/scroll-ergonomics";
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
 * - **A held key starts one action, not one per repeat.** `event.repeat` marks
 *   every OS auto-repeat after the first. Without this, holding ⌘⏎ asks for a
 *   pipeline run per repeat — the defect the 2026-08-11 review found in the
 *   editor's copy of this binding, which is closed there the same way.
 * - **Bare-key shortcuts never fire while the user is typing.** Modified ones
 *   deliberately still do: ⌘⏎ has to work from inside the editor and the
 *   simulator's fields, which is the whole point of it.
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
      // A held key is one intent, however long it is held. Deliberately AFTER
      // the match test and without `preventDefault`: a repeat of a chord we do
      // not own is none of our business.
      if (event.repeat) {
        return;
      }
      // A bare key never fires while the user is typing — `isTextEditingTarget`
      // counts a focused `<select>` too, so `e` and `r` cannot eat its
      // type-ahead. Modified chords always fire: ⌘⏎ working from inside the
      // editor is the point of them.
      if (!shortcut.mod && isTextEditingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      handlerRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut, enabled]);
}
