/**
 * Roadmap 068: the arithmetic behind the results tab strip's arrow keys.
 *
 * Its own module rather than a helper inside `ResultsPanel.tsx` for two
 * reasons: exporting a non-component from a component file breaks fast refresh
 * (and the lint rule that guards it), and the wrap-around is the part of the
 * ARIA tablist pattern most likely to be subtly wrong — so it belongs in the
 * node-environment `unit` project, where it can be tested without a DOM.
 */

/**
 * Roadmap 068 tier 1: the tab a digit key selects, by POSITION in the rendered
 * strip — never by a hardcoded id-to-digit map. Roadmap 062 renames `Simulator`
 * and inserts an `Extraction` tab, and a frozen map would then quietly point
 * every digit at the wrong panel.
 */
export function digitTabIndex(key: string, count: number): number | null {
  if (key.length !== 1 || key < "1" || key > "9") {
    return null;
  }
  const index = Number(key) - 1;
  return index < count ? index : null;
}

/** The index this key moves to, or null when the key isn't one of ours. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) {
    return null;
  }
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
