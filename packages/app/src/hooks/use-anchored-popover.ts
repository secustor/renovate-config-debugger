import { useCallback, useEffect, useRef, useState } from "react";
import type { EscapePriority } from "@/lib/escape-stack";
import { FOCUSABLE_SELECTOR } from "@/lib/focusable";
import { useEscapeLayer } from "@/hooks/use-escape-layer";

/**
 * The open/close contract of a panel anchored to its trigger button —
 * extracted from the session menu (066) when the build-info popover (088)
 * needed the identical mechanics at a different Escape rank.
 *
 * The contract, in full (066's rules, unchanged):
 * - Escape and in-panel closes hand focus back to the trigger, because the
 *   panel the user was in is gone and focus has to land somewhere deliberate.
 * - The two closes that DON'T refocus are the ones where the user has already
 *   said where they are going: a pointer press outside the panel (yanking
 *   focus back would fight the click that is landing) and focus leaving by
 *   Tab — both watched with document listeners while open.
 * - Opening moves focus to the panel's first focusable element (WAI-ARIA
 *   menu-button behavior), so a keyboard user is already on the first action.
 * - Escape goes through the shared ladder (068), at the rank the caller
 *   names — never a local keydown listener.
 * - Deliberately no scroll listener: the panel is `position: absolute` inside
 *   its anchor, so it scrolls WITH it — unlike the portalled hover cards in
 *   glossary.tsx, which are fixed and must close when their anchor moves.
 */
export function useAnchoredPopover(escapePriority: EscapePriority) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => !wasOpen);
  }, []);

  /** Close and return focus — Escape, and every item that closes the panel. */
  const dismiss = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEscapeLayer(open, dismiss, escapePriority);

  useEffect(() => {
    if (!open) {
      return;
    }

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
    // not be able to keep the panel open behind the user's back.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  return { open, triggerRef, panelRef, toggle, dismiss };
}
