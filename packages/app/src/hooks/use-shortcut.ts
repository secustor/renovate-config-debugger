import { useEffect, useRef } from "react";
import { useLatestRef } from "./use-latest-ref";
import { isTextEditingTarget } from "@/lib/keyboard-target";
import { overlayKeyboardOwned } from "@/lib/escape-stack";
import { matchShortcut, type Shortcut } from "@/lib/shortcuts";

/**
 * Roadmap 068: binds one registry entry (`lib/shortcuts.ts`) to a handler for
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
 * - **Bare-key shortcuts never fire while the user is typing, and not while a
 *   popover or menu is up unless the entry declares `firesUnderOverlay`.**
 *   Modified ones deliberately still fire in every case: ⌘⏎ has to work from
 *   inside the editor and the simulator's fields, which is the whole point of
 *   it.
 * - **The handler is read through a ref**, so the window listener is installed
 *   once and never churns with a per-render callback identity — the keystroke
 *   render budget (032) pays nothing for this.
 */
export function useShortcut(
  shortcut: Shortcut,
  handler: () => void,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const handlerRef = useLatestRef(handler);
  // Read through a ref for the same reason as `handlerRef`, plus one more:
  // the window listener must not be torn down by an `enabled` flip that
  // happens mid-hold (see `heldRef` below), so `enabled` can no longer be an
  // effect dependency that gates whether the listener exists at all.
  const enabledRef = useLatestRef(enabled);
  // Roadmap 068 review: `?` is the one binding that disables itself the
  // instant it fires — pressing it sets `shortcutSheetOpen`, which flips this
  // hook's own `enabled` to false. Gating listener installation on `enabled`
  // (the previous shape) tore the effect down mid-hold, so every repeat after
  // the first reached the browser un-prevented — the exact Firefox quick-find
  // failure the `preventDefault`-before-`repeat` ordering below exists to
  // avoid. `heldRef` records whether the hold CURRENTLY IN PROGRESS was
  // claimed, decided once on its first (non-repeat) press and reused for
  // every repeat of that same hold, so a later `enabled` flip cannot retract
  // a claim already made. `event.repeat` is false only on a key's first press
  // per hold (the browser's own guarantee), so a fresh press always resets
  // this before it is read — no keyup listener needed, and nothing to leak if
  // a keyup is ever missed (e.g. focus leaving the window mid-hold).
  const heldRef = useRef(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !matchShortcut(event, shortcut)) {
        return;
      }
      if (event.repeat) {
        // Continuing a hold: the claim was decided below on this hold's first
        // press and does not get re-litigated against the CURRENT `enabled`,
        // target or overlay state — that is what "stays claimed for the whole
        // hold" means.
        if (!heldRef.current) {
          return;
        }
        event.preventDefault();
        return;
      }
      // Fresh press: decide the claim once, in order — falls through to
      // `false` (unclaimed) unless every gate below passes and reaches the end.
      heldRef.current = false;
      if (!enabledRef.current) {
        return;
      }
      // A bare key never fires while the user is typing — `isTextEditingTarget`
      // counts a focused `<select>` too, so `e` and `r` cannot eat its
      // type-ahead. No exceptions to this half: every bare key in the registry
      // is a character someone can be in the middle of typing. Modified chords
      // always fire: ⌘⏎ working from inside the editor is the point of them.
      if (!shortcut.mod && isTextEditingTarget(event.target)) {
        return;
      }
      // Nor while a popover or menu is drawn over the page, which no predicate
      // about the FOCUSED element can see: the rule-evidence card is portalled
      // to `<body>` and takes focus itself. Escape first, then the jump.
      //
      // Unless the binding says otherwise. The gate is about keys that MOVE the
      // page under a layer the reader is looking at, and `?` moves nothing — it
      // opens a modal that takes the keyboard outright. Suppressing it made the
      // session menu's own "Press ? any time" row a promise the app broke; the
      // exemption is declared on the registry entry (`firesUnderOverlay`), so it
      // is visible where the binding is, not hidden in an id check here.
      if (!shortcut.mod && !shortcut.firesUnderOverlay && overlayKeyboardOwned()) {
        return;
      }
      event.preventDefault();
      // A held key is one intent, however long it is held. Deliberately AFTER
      // `preventDefault`: a chord we own stays owned for the whole hold, or the
      // browser gets back every repeat we declined — a held `?` in Firefox then
      // opens its quick-find bar behind the sheet, which swallows the
      // keystrokes that follow. Not running the action again is the only thing
      // a repeat may change.
      heldRef.current = true;
      handlerRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // The two refs are stable objects, listed only because `exhaustive-deps`
    // cannot see the `useRef()` behind `useLatestRef`; neither ever changes
    // identity, so this listener is still installed exactly once per shortcut.
  }, [shortcut, handlerRef, enabledRef]);
}
