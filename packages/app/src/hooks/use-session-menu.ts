import { useCallback, useEffect, useRef, useState } from "react";
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

  // Roadmap 067: Escape through the shared ladder, so a hover card opened
  // from inside the panel closes first and the menu survives that press.
  useEscapeLayer(open, dismiss);

  useEffect(() => {
    if (!open) {
      return;
    }

    // WAI-ARIA's menu-button behavior: opening moves focus into the panel, so
    // a keyboard user is already on the first action and Tab walks the rest.
    panelRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();

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
