import { useCallback, useEffect, useRef, useState } from "react";
import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { FOCUSABLE_SELECTOR } from "@/lib/focusable";
import { useEscapeLayer } from "@/hooks/use-escape-layer";

/**
 * Roadmap 066 — the open/close contract of the header's session menu.
 *
 * This is the repo-form disclosure (023/039, `use-repo-load.ts`) applied to a
 * popover rather than an inline panel, and it keeps that feature's rule:
 * closing by Escape or by choosing an item hands focus back to the button that
 * opened it, because the panel the user was in is gone and focus has to land
 * somewhere deliberate.
 *
 * The two closes that DON'T refocus are the ones where the user has already
 * said where they are going: a pointer press outside the panel (yanking focus
 * back to the header would fight the click that is landing) and focus leaving
 * by Tab.
 *
 * There is deliberately no scroll listener. The panel is `position: absolute`
 * inside the header, so it scrolls WITH its anchor — unlike the portalled
 * hover cards in `glossary.tsx`, which are `position: fixed` and must close
 * when the thing they point at moves out from under them.
 */
export function useSessionMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => !wasOpen);
  }, []);

  /** Close and return focus — Escape, and every item that closes the menu. */
  const dismiss = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Roadmap 068: Escape through the shared ladder, so a hover card opened
  // from inside the panel closes first and the menu survives that press —
  // by rank, which holds whichever of the two mounted first.
  //
  // 068 review, on what this menu gave up by no longer listening for Escape
  // itself: the ladder declines a press in three cases, and none of them can
  // reach a menu that is open, because the `focusin` close below is what makes
  // them unreachable. While this panel is up, focus is inside it or on the
  // trigger — anywhere else closes it in the same event that moved it.
  //
  // - `defaultPrevented`: the two surfaces that claim Escape are CodeMirror and
  //   the repo-load form, and focus reaching either has already closed the menu.
  //   Nothing the panel itself renders claims the key — its items are buttons
  //   and `ThemeSwitch`'s radios, with no key handler between them — and no
  //   registry shortcut binds Escape.
  // - The combobox yield: `mayOwnNativePopup` is the simulator's two `<input
  //   list>` fields, which are two panels away from this one.
  // - `modalKeyboardOwned()`: `?` is exempt from the overlay gate, so the sheet
  //   CAN be opened over this menu — and `showModal()` moves focus into the
  //   dialog, which closes the menu on the way in rather than stranding it
  //   behind a claim it cannot outlast.
  useEscapeLayer(open, dismiss, ESCAPE_PRIORITY.menu);

  useEffect(() => {
    if (!open) {
      return;
    }

    // WAI-ARIA's menu-button behavior: opening moves focus into the panel, so
    // a keyboard user is already on the first action and Tab walks the rest.
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    function owns(node: EventTarget | null): boolean {
      return (
        node instanceof Node &&
        (panelRef.current?.contains(node) === true || triggerRef.current?.contains(node) === true)
      );
    }

    function onPointerDown(event: PointerEvent) {
      // The trigger owns its own click — closing here would race `toggle` and
      // reopen the panel the same press just closed.
      if (!owns(event.target)) {
        setOpen(false);
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!owns(event.target)) {
        setOpen(false);
      }
    }

    // Capture phase: a handler inside the panel that stops propagation must
    // not be able to keep the menu open behind the user's back.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  return { open, triggerRef, panelRef, toggle, dismiss };
}
