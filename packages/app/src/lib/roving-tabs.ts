/**
 * Roadmap 067: the arithmetic behind the results tab strip's arrow keys.
 *
 * Its own module rather than a helper inside `ResultsPanel.tsx` for two
 * reasons: exporting a non-component from a component file breaks fast refresh
 * (and the lint rule that guards it), and the wrap-around is the part of the
 * ARIA tablist pattern most likely to be subtly wrong — so it belongs in the
 * node-environment `unit` project, where it can be tested without a DOM.
 */

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
