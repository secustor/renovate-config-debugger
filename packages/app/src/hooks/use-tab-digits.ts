import { useEffect, useRef } from "react";
import { isTextEditingTarget } from "@/hooks/scroll-ergonomics";
import { overlayKeyboardOwned } from "@/lib/escape-stack";
import { digitTabIndex } from "@/lib/roving-tabs";
import { commandModifierHeld } from "@/lib/shortcuts";

/**
 * Roadmap 067 tier 1: `1`–`7` jump straight to that results tab.
 *
 * Its own hook rather than seven registry entries — the binding is one idea
 * ("the Nth tab"), the sheet prints it as one row, and the count follows
 * whatever the strip currently renders. Same guards a bare key gets in
 * `useShortcut`, spelled out because this hook is the other half of that layer:
 * never on an already-handled event, never with a COMMAND modifier held, never
 * while the user is typing, never under an open popover or menu — and one jump
 * per hold, since a held `3` repeats ~30 times a second and each repeat would
 * re-select the tab and start another `focusTab` polling chain.
 *
 * Roadmap 067 review finding 3: the window listener is installed once, not
 * re-installed on every `enabled` flip — `use-shortcut.ts` moved off that
 * shape for `?`, whose own handler disables itself the instant it fires, so
 * gating the listener's existence on `enabled` tore it down mid-hold and let
 * the rest of that hold's auto-repeat reach the browser un-prevented. No
 * binding here disables itself that way — App gates this hook on
 * `keysLive && Boolean(result)`, and selecting a tab changes neither — but
 * `enabled` can still flip out from under a held digit for a reason external
 * to this hook (pressing `?` while `3` is held flips `keysLive`), and a held
 * digit has no dangerous browser default to leak into the way `?` does in
 * Firefox. The fix is applied anyway: `enabled` is read through a ref and
 * re-checked on every event instead of gating whether the listener exists,
 * so this hook cannot go silent mid-gesture for a reason a held key should
 * not care about, and it stops carrying a listener-teardown shape its sibling
 * already proved is the wrong one.
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
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // ⌘/Ctrl/Alt only, and Shift deliberately absent — the one bare-key layer
      // besides `?` that has to allow it. On AZERTY the number row types
      // `&é"'(-è` unshifted and `1`–`7` WITH Shift, so demanding an unshifted
      // press would leave this hook dead on a French keyboard. Nothing is lost
      // by allowing it: what is matched is the character the layout produced,
      // and Shift+`1` on a US layout produces `!`, which `digitTabIndex`
      // declines below.
      if (event.defaultPrevented || commandModifierHeld(event)) {
        return;
      }
      if (!enabledRef.current) {
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
  }, []);
}
