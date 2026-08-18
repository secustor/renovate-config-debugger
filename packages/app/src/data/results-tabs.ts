/**
 * Roadmap 028 — the tabbed results shell's tab model. Pure and DOM-free so
 * share.ts (which encodes the active tab into a link) and the e2e suite can
 * depend on it without pulling React in.
 *
 * Roadmap 075 (v2, iteration 3) reshaped it: seven tabs became five. The
 * simulator leads as **Tests** (the dependency descriptors a run is checked
 * against), **Rewrites** folded into Pipeline's migrate stage, and **Overview**
 * retired — its digest is the header's jump-links now. The three retired ids
 * live on below as decode-only aliases, because share links carrying them are
 * already out there.
 */

export const RESULTS_TAB_IDS = ["tests", "pipeline", "presets", "effective", "problems"] as const;

export type ResultsTabId = (typeof RESULTS_TAB_IDS)[number];

export const RESULTS_TAB_LABELS: Record<ResultsTabId, string> = {
  tests: "Tests",
  pipeline: "Pipeline",
  presets: "Presets",
  effective: "Effective config",
  problems: "Problems",
};

export function isResultsTabId(value: unknown): value is ResultsTabId {
  return typeof value === "string" && (RESULTS_TAB_IDS as readonly string[]).includes(value);
}

/**
 * Roadmap 075 (v2, iteration 3): the pre-v2 tab ids. Nothing ENCODES these any
 * more — `buildShareState` writes whichever `ResultsTabId` is active — but every
 * link shared before v2 carries one, so the decoder still has to know them.
 */
export const LEGACY_RESULTS_TAB_IDS = ["overview", "rewrites", "simulator"] as const;

export type LegacyResultsTabId = (typeof LEGACY_RESULTS_TAB_IDS)[number];

/** What a share link's `tab` field may say: a v2 id, or a retired one. */
export type ShareResultsTabId = ResultsTabId | LegacyResultsTabId;

/**
 * Where each retired tab went. `overview` → Tests because the digest it opened
 * on is the header's now and Tests is where a run lands; `simulator` → Tests
 * because that IS the simulator, renamed; `rewrites` → Pipeline, whose migrate
 * stage holds the stepper (see `shareTabWantsMigrateStage`).
 */
const LEGACY_TAB_TARGETS: Record<LegacyResultsTabId, ResultsTabId> = {
  overview: "tests",
  rewrites: "pipeline",
  simulator: "tests",
};

export function isShareResultsTabId(value: unknown): value is ShareResultsTabId {
  return (
    isResultsTabId(value) ||
    (typeof value === "string" && (LEGACY_RESULTS_TAB_IDS as readonly string[]).includes(value))
  );
}

/** The tab a link's `tab` field opens, mapping the retired ids forward. */
export function resultsTabForShareTab(id: ShareResultsTabId): ResultsTabId {
  return isResultsTabId(id) ? id : LEGACY_TAB_TARGETS[id];
}

/**
 * Whether opening this link should also select the migrate stage. Only
 * `rewrites` does: the tab it named no longer exists, and Pipeline on its
 * default stage would show the sender's link landing on something the sender
 * was not looking at. Selecting migrate puts the stepper back on screen.
 */
export function shareTabWantsMigrateStage(id: ShareResultsTabId): boolean {
  return id === "rewrites";
}

/**
 * Roadmap 028: which tab a PRE-028 share link should open. Those links carry
 * only the vertical layout's view state, so the tab is inferred from the most
 * specific thing the sender had selected — a preset node beats a migration
 * step beats a stage, because every link this app ever produced carries
 * `stage` (it was always set), while `node`/`step` were only written when the
 * sender had actually selected one. An explicit `tab` always wins over this.
 *
 * Roadmap 075: `step` used to infer the Rewrites tab and now infers Pipeline,
 * for the same reason `rewrites` maps there — the stepper lives on the migrate
 * stage, which App selects alongside (see its pending-view effect).
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
    return "pipeline";
  }
  if (view.stage) {
    return "pipeline";
  }
  return null;
}
