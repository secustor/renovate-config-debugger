/**
 * Roadmap 028 — the tabbed results shell's tab model. Pure and DOM-free so
 * share.ts (which encodes the active tab into a link) and the e2e suite can
 * depend on it without pulling React in.
 */

export const RESULTS_TAB_IDS = [
  "overview",
  "pipeline",
  "rewrites",
  "presets",
  "effective",
  "simulator",
  "problems",
] as const;

export type ResultsTabId = (typeof RESULTS_TAB_IDS)[number];

export const RESULTS_TAB_LABELS: Record<ResultsTabId, string> = {
  overview: "Overview",
  pipeline: "Pipeline",
  rewrites: "Rewrites",
  presets: "Presets",
  effective: "Effective config",
  simulator: "Simulator",
  problems: "Problems",
};

export function isResultsTabId(value: unknown): value is ResultsTabId {
  return typeof value === "string" && (RESULTS_TAB_IDS as readonly string[]).includes(value);
}

/**
 * Roadmap 028: which tab a PRE-028 share link should open. Those links carry
 * only the vertical layout's view state, so the tab is inferred from the most
 * specific thing the sender had selected — a preset node beats a migration
 * step beats a stage, because every link this app ever produced carries
 * `stage` (it was always set), while `node`/`step` were only written when the
 * sender had actually selected one. An explicit `tab` always wins over this.
 */
export function legacyTabForView(view: {
  stage?: unknown;
  node?: unknown;
  step?: unknown;
}): ResultsTabId | null {
  if (view.node) {
    return "presets";
  }
  if (typeof view.step === "number") {
    return "rewrites";
  }
  if (view.stage) {
    return "pipeline";
  }
  return null;
}
