import { useEffect, useRef } from "react";
import { isTextEditingTarget } from "@/hooks/scroll-ergonomics";
import { digitTabIndex } from "@/lib/roving-tabs";

/**
 * Roadmap 067 tier 1: `1`–`7` jump straight to that results tab.
 *
 * Its own hook rather than seven registry entries — the binding is one idea
 * ("the Nth tab"), the sheet prints it as one row, and the count follows
 * whatever the strip currently renders. Same guards as `useShortcut`: never
 * while typing, never with a modifier held, never on an already-handled event.
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
      if (isTextEditingTarget(event.target)) {
        return;
      }
      const index = digitTabIndex(event.key, countRef.current);
      if (index === null) {
        return;
      }
      event.preventDefault();
      onSelectRef.current(index);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
