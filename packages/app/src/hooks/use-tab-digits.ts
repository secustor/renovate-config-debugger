import { useEffect, useRef } from "react";
import { isTextEditingTarget } from "@/hooks/scroll-ergonomics";
import { overlayKeyboardOwned } from "@/lib/escape-stack";
import { digitTabIndex } from "@/lib/roving-tabs";

/**
 * Roadmap 067 tier 1: `1`–`7` jump straight to that results tab.
 *
 * Its own hook rather than seven registry entries — the binding is one idea
 * ("the Nth tab"), the sheet prints it as one row, and the count follows
 * whatever the strip currently renders. Same guards a bare key gets in
 * `useShortcut`, spelled out because this hook is the other half of that layer:
 * never on an already-handled event, never with a modifier held, never while
 * the user is typing, never under an open popover or menu — and one jump per
 * hold, since a held `3` repeats ~30 times a second and each repeat would
 * re-select the tab and start another `focusTab` polling chain.
 */
export function useTabDigits(
  count: number,
  onSelect: (index: number) => void,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      // A popover or menu is drawn over the panels these digits switch between,
      // and it survives the switch: without this, `2` under an open
      // rule-evidence card moved the page beneath it and left the card
      // explaining a rule that is no longer on screen.
      if (isTextEditingTarget(event.target) || overlayKeyboardOwned()) {
        return;
      }
      const index = digitTabIndex(event.key, countRef.current);
      if (index === null) {
        return;
      }
      event.preventDefault();
      // Claimed first, then declined: a digit we own stays ours for the whole
      // hold (`useShortcut` takes the same order, for the same reason), and a
      // repeat only means "do not jump again".
      if (event.repeat) {
        return;
      }
      onSelectRef.current(index);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
