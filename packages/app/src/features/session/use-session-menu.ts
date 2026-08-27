import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { useAnchoredPopover } from "@/hooks/use-anchored-popover";

/**
 * Roadmap 066 — the open/close contract of the header's session menu.
 *
 * The mechanics (outside-click, Tab-away, Escape-with-refocus, focus into the
 * panel on open) moved to `useAnchoredPopover` when the build-info popover
 * (088) needed them too; this keeps the menu's one distinguishing choice, its
 * Escape rank.
 *
 * 068 review, on what this menu gave up by no longer listening for Escape
 * itself: the ladder declines a press in three cases, and none of them can
 * reach a menu that is open, because the hook's `focusin` close is what makes
 * them unreachable. While this panel is up, focus is inside it or on the
 * trigger — anywhere else closes it in the same event that moved it.
 *
 * - `defaultPrevented`: the two surfaces that claim Escape are CodeMirror and
 *   the repo-load form, and focus reaching either has already closed the menu.
 *   Nothing the panel itself renders claims the key — its items are buttons
 *   and `ThemeSwitch`'s radios, with no key handler between them — and no
 *   registry shortcut binds Escape.
 * - The combobox yield: `mayOwnNativePopup` is the simulator's two `<input
 *   list>` fields, which are two panels away from this one.
 * - `modalKeyboardOwned()`: `?` is exempt from the overlay gate, so the sheet
 *   CAN be opened over this menu — and `showModal()` moves focus into the
 *   dialog, which closes the menu on the way in rather than stranding it
 *   behind a claim it cannot outlast.
 */
export function useSessionMenu() {
  return useAnchoredPopover(ESCAPE_PRIORITY.menu);
}
