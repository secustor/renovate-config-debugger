/**
 * Roadmap 068 review: `data-tab` — the attribute that names one results tab
 * BUTTON in the DOM — was written in one file and read in two others that
 * agreed with it only by coincidence. The strip (`ResultsPanel`) renders it and
 * reads it back, because its arrows move focus by it; App reaches across the
 * lazy results boundary for it, because the digit jump and the apply-fix
 * landing have to focus a button nothing on their side of that boundary holds a
 * handle to. Renaming the attribute in the strip therefore fixed the strip's
 * own arrows and silently broke both of App's landings.
 *
 * The attribute is named here exactly once, and everything that writes or reads
 * it goes through these three functions.
 *
 * Here rather than in `ResultsPanel.tsx`, next to the button itself, because a
 * non-component export from a component file costs that file its Fast Refresh
 * (`react/only-export-components`, error since roadmap 041).
 */

import { isResultsTabId, type ResultsTabId } from "@/data/results-tabs";

/** Spread onto the tab button — the write half of the attribute. */
export function tabButtonAttrs(id: ResultsTabId): { "data-tab": ResultsTabId } {
  return { "data-tab": id };
}

/** The one tab button named by `id`, for a `querySelector`. */
export function tabButtonSelector(id: ResultsTabId): string {
  return `[data-tab="${id}"]`;
}

/** Which tab an element IS, or undefined for anything that is not a tab
 *  button — how a focus/keyboard handler asks where in the strip it is. */
export function tabIdOfElement(el: EventTarget | null): ResultsTabId | undefined {
  const id = el instanceof HTMLElement ? el.dataset.tab : undefined;
  return isResultsTabId(id) ? id : undefined;
}
