import { useEffect, useState } from "react";

/**
 * Roadmap 016: `End` "lands on a blank over-scrolled viewport" (persona study
 * finding 7). Root cause: several cards nest their own scrollable box (the
 * preset tree, the preset detail panel, the effective config's key list —
 * each a fixed-`max-height`, `overflow: auto` region full of focusable
 * buttons). Browsers scroll the NEAREST SCROLLABLE ANCESTOR of the currently
 * focused element on Home/End, not the page — so after clicking a button
 * inside one of those boxes, Home/End silently scrolls that small box to its
 * own top/bottom instead of the page, which looks exactly like "nothing
 * happened" or "landed somewhere wrong" depending on where the box sits.
 * Fix: make the document the effective scroll container for Home/End
 * regardless of focus, the way a page with no nested scroll regions would
 * already behave — skipped for genuine text-editing contexts (inputs,
 * textareas, CodeMirror's contenteditable) where Home/End must keep moving
 * the text cursor, and for any modified key combo (e.g. shift-select).
 */
// `<input>` types that do NOT accept free text — a checkbox, radio or button
// input has no cursor and no type-ahead, so it must not count as "typing".
// Roadmap 067 reuses this predicate as the bare-key guard for `useShortcut`
// and `useTabDigits`: without this list, a focused filter checkbox
// (EffectiveConfig.tsx, PresetTree.tsx) silently swallowed `?`, `1`-`7` and
// `e`/`r` with no visible cause.
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type.toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  // A `<select>` has no free-text cursor either, but its native type-ahead
  // (jumping to an option by the letter typed) must keep winning over the
  // jump-layer bare keys — 067 documents this as deliberate.
  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest(".cm-editor") !== null;
}

export function useHomeEndPageScroll(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Home" && e.key !== "End") {
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }
      // Roadmap 067: a widget with its own Home/End semantics gets them. The
      // results tab strip is the first (ARIA tablist: Home/End = first/last
      // tab) and claims the key by calling `preventDefault`; anything that
      // doesn't claim it still scrolls the page, exactly as before.
      if (e.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(e.target)) {
        return;
      }
      e.preventDefault();
      window.scrollTo({
        top: e.key === "End" ? document.documentElement.scrollHeight : 0,
        behavior: "auto",
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * Roadmap 016: a back-to-top affordance for long results pages (persona
 * study finding 7) — the simpler, more robust alternative to a sticky
 * mini-toolbar. Visible once the page has scrolled past `threshold`.
 */
export function useBackToTopVisible(threshold = 480): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return visible;
}
