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
 *
 * Roadmap 083 brings **Overview** back, first in the strip: the design's Final
 * artboard turns 069's description digest into the beginner's entry point
 * ("What this config does", sorted by topic), and that is a tab, not a card at
 * the top of somebody else's. So `overview` stops being a retired alias and
 * becomes a current id again — which needs no compatibility machinery at all,
 * because a link that says `tab=overview` now opens the tab it named. The two
 * ids still retired are `rewrites` and `simulator`.
 *
 * Roadmap 089 adds **Dependencies** (`deps`), between Effective config and
 * Problems — the strip order of the design's Integrated Shell artboard. It
 * lists what 087's extraction found in the loaded repository, which until now
 * was reachable only as a five-row picker inside the Add-a-test card. A new id
 * needs no compatibility machinery either: no link in the wild says `deps`, and
 * one that will is made by the app that has the tab.
 */
import { isNumber, isString } from "@renovate-config-debugger/engine/is";

export const RESULTS_TAB_IDS = [
  "overview",
  "tests",
  "pipeline",
  "presets",
  "effective",
  "deps",
  "problems",
] as const;

export type ResultsTabId = (typeof RESULTS_TAB_IDS)[number];

export const RESULTS_TAB_LABELS: Record<ResultsTabId, string> = {
  overview: "Overview",
  tests: "Tests",
  pipeline: "Pipeline",
  presets: "Presets",
  effective: "Effective config",
  deps: "Dependencies",
  problems: "Problems",
};

export function isResultsTabId(value: unknown): value is ResultsTabId {
  return isString(value) && (RESULTS_TAB_IDS as readonly string[]).includes(value);
}

/**
 * Roadmap 075 (v2, iteration 3): the pre-v2 tab ids. Nothing ENCODES these any
 * more — `buildShareState` writes whichever `ResultsTabId` is active — but every
 * link shared before v2 carries one, so the decoder still has to know them.
 *
 * Roadmap 083 removed `overview` from this list. It is a real tab again, so the
 * encoder writes it (as it writes any active tab) and the decoder accepts it as
 * a current id — a v1 link naming it lands on the Overview, which is the tab its
 * sender was looking at. It was never a rename; it was a removal, and the
 * removal is undone.
 */
export const LEGACY_RESULTS_TAB_IDS = ["rewrites", "simulator"] as const;

export type LegacyResultsTabId = (typeof LEGACY_RESULTS_TAB_IDS)[number];

/** What a share link's `tab` field may say: a v2 id, or a retired one. */
export type ShareResultsTabId = ResultsTabId | LegacyResultsTabId;

/**
 * Where each retired tab went. `simulator` → Tests because that IS the
 * simulator, renamed; `rewrites` → Pipeline, whose migrate stage holds the
 * stepper (see `shareTabWantsMigrateStage`).
 */
const LEGACY_TAB_TARGETS: Record<LegacyResultsTabId, ResultsTabId> = {
  rewrites: "pipeline",
  simulator: "tests",
};

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
 *
 * Roadmap 083 deliberately does NOT add an `overview` answer here. This
 * function only ever fires for a link with no `tab` field at all, and it infers
 * from what the sender had SELECTED — a preset node, a migration step, a stage.
 * The Overview has no such state (it selects nothing, and the one thing it
 * remembers is a disclosure), so there is nothing in a pre-028 link that could
 * mean "they were on the Overview". Returning `null` leaves App's own landing
 * rule in charge, which is the honest answer: we do not know.
 */
export function legacyTabForView(view: {
  stage?: unknown;
  node?: unknown;
  step?: unknown;
}): ResultsTabId | null {
  if (view.node) {
    return "presets";
  }
  if (isNumber(view.step)) {
    return "pipeline";
  }
  if (view.stage) {
    return "pipeline";
  }
  return null;
}
