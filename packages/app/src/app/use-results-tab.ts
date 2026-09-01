/**
 * Roadmap 028/075, extracted under 033/048's decomposition rule — which results
 * tab the reader is on, and everything that decides it.
 *
 * One cluster because the three ways a tab changes are defined against each
 * other rather than against anything outside: choosing a tab (`setTab`) ends
 * the cross-link trail, walking the strip (`walkToTab`) keeps it, a
 * programmatic jump (`jumpToTab`) starts one — and `backTab` is the trail. The
 * pending rule focus rides along because the one gesture that sets it is a jump
 * (`onJumpToSimRule` sends a reader to a rule on the Tests tab, which is a tab
 * switch and a scroll target in one act).
 *
 * Nothing here is an effect. Everything that COMPOSES a tab switch with other
 * App state — the run path's `keepTab`, the share link's decoded tab, the
 * digit shortcuts, the header's digest links, "show rewrites" selecting a
 * pipeline stage on the way — stays in App, which owns the other half of each
 * of those pairs. This hook only owns the tab.
 */
import { useCallback, useRef, useState } from "react";
import type { ResultsTabId } from "@/data/results-tabs";

export interface ResultsTab {
  tab: ResultsTabId;
  backTab: ResultsTabId | null;
  setTab: (next: ResultsTabId) => void;
  walkToTab: (next: ResultsTabId) => void;
  jumpToTab: (next: ResultsTabId) => void;
  /** Drops the "back to where I was" target without moving the reader — what a
   *  new run does to the trail left by the run that just ended. */
  clearBackTab: () => void;
  landAfterRun: (hasStageError: boolean) => void;
  pendingRuleFocus: number | null;
  onRuleFocused: () => void;
  onJumpToSimRule: (index: number) => void;
}

export function useResultsTab(): ResultsTab {
  // Roadmap 028: the active results tab, and the one-step "back to where I
  // was" target recorded whenever something OTHER than a tab click moved the
  // user (a provenance chip, a message jump, a header digest link). The three
  // setters below are the only writers of `tab`, and each maintains `tabRef`
  // so a handler can read the pre-switch value synchronously — which is what
  // `jumpToTab` records the trail from.
  //
  // Roadmap 075 (iteration 3): Tests is the first tab and where a run lands.
  const [tab, setTabState] = useState<ResultsTabId>("tests");
  const [backTab, setBackTab] = useState<ResultsTabId | null>(null);
  const tabRef = useRef<ResultsTabId>(tab);
  // Roadmap 013: rule identity cross-links. The editor is an imperative jump
  // target (CodeMirror has no declarative "scroll to offset X" prop); the
  // simulator's target rule is prop-driven since it is a sibling component.
  const [pendingRuleFocus, setPendingRuleFocus] = useState<number | null>(null);

  /** Roadmap 028: a tab the user chose explicitly — clears the back affordance.
   *  Identity-stable (032): reads tab state only through its ref. */
  const setTab = useCallback((next: ResultsTabId) => {
    tabRef.current = next;
    setTabState(next);
    setBackTab(null);
  }, []);

  /**
   * Roadmap 068: the tab strip's arrows, which SELECT (see `ResultsPanel`) —
   * but a walk along the strip is not the same act as choosing a tab, which is
   * what `setTab` above is defined by and why it clears the cross-link trail.
   * Keeping the trail is the whole reason this is not just `setTab`: a reader
   * sent to Presets by a provenance chip can look at the next instrument along
   * without the one-step way back disappearing from under them.
   *
   * Landing back ON the origin ends the trail, because at that point the trail
   * has been walked — leaving it would offer "← Back to Tests" to a reader
   * already on Tests.
   */
  const walkToTab = useCallback((next: ResultsTabId) => {
    tabRef.current = next;
    setTabState(next);
    setBackTab((from) => (from === next ? null : from));
  }, []);

  /** Roadmap 028: a programmatic jump (a cross-instrument link, a header
   *  digest link) — records where the user was so one click returns them. */
  const jumpToTab = useCallback((next: ResultsTabId) => {
    const from = tabRef.current;
    if (from === next) {
      return;
    }
    tabRef.current = next;
    setTabState(next);
    setBackTab(from);
  }, []);

  const clearBackTab = useCallback(() => setBackTab(null), []);

  /**
   * Roadmap 028/075/083: where a run lands — Tests, the dependency descriptors
   * this config is checked against, or straight on Problems when a stage
   * errored (the tabbed equivalent of the old "select the first errored
   * stage"). Unchanged since 075 and re-affirmed by 083, which put the Overview
   * first in the strip without making it a landing: landing is about the loop
   * the app is shaped around — edit → Run → read — and an edit's answer is not
   * "here is what your config does in general".
   *
   * WHETHER a run lands at all is the run path's question (`RunOptions.keepTab`),
   * and stays there.
   */
  const landAfterRun = useCallback(
    (hasStageError: boolean) => {
      setTab(hasStageError ? "problems" : "tests");
    },
    [setTab],
  );

  // Roadmap 032: stable handlers for the memoized panels — each reads state
  // only through refs and setters, so its identity never changes.
  const onRuleFocused = useCallback(() => setPendingRuleFocus(null), []);
  const onJumpToSimRule = useCallback(
    (index: number) => {
      setPendingRuleFocus(index);
      jumpToTab("tests");
    },
    [jumpToTab],
  );

  return {
    tab,
    backTab,
    setTab,
    walkToTab,
    jumpToTab,
    clearBackTab,
    landAfterRun,
    pendingRuleFocus,
    onRuleFocused,
    onJumpToSimRule,
  };
}
