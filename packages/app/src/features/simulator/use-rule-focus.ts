import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SimulationResult } from "@renovate-config-visualizer/engine";

export interface RuleFocus {
  /** The simulator card itself — where a cross-link lands when no simulation
   *  has run yet. */
  cardRef: RefObject<HTMLDivElement | null>;
  /** A merged rule index a click on a `packageRules[N]` message link asked to see. */
  focusRule: (mergedIndex: number) => void;
}

/**
 * Roadmap 013/023/047: scroll to and flash the rule row a cross-link named —
 * either the external `focusRuleIndex` prop or a click on this component's own
 * `packageRules[N]`-in-message links. Anything hiding the row (a closed rules
 * drawer, the matched-only filter, the my-rules filter) is cleared first and
 * the effect re-runs once the row is actually in the DOM.
 */
export function useRuleFocus({
  focusRuleIndex,
  onRuleFocused,
  sim,
  showAll,
  setShowAll,
  myRulesOnly,
  setMyRulesOnly,
  rulesOpen,
  setRulesOpen,
  setFocusHint,
  repoRuleIndices,
}: {
  focusRuleIndex?: number | null;
  onRuleFocused?: () => void;
  sim: SimulationResult | null;
  showAll: boolean;
  setShowAll: Dispatch<SetStateAction<boolean>>;
  myRulesOnly: boolean;
  setMyRulesOnly: Dispatch<SetStateAction<boolean>>;
  rulesOpen: boolean;
  setRulesOpen: Dispatch<SetStateAction<boolean>>;
  setFocusHint: Dispatch<SetStateAction<number | null>>;
  repoRuleIndices: Set<number>;
}): RuleFocus {
  const cardRef = useRef<HTMLDivElement>(null);
  // Roadmap 013: the merged index awaiting a scroll+flash.
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);

  useEffect(() => {
    if (focusRuleIndex != null) {
      setScrollTarget(focusRuleIndex);
    }
  }, [focusRuleIndex]);

  // Performs the actual scroll+flash once the target row is guaranteed to be
  // in the DOM: if it is currently hidden behind the matched-only filter,
  // reveal it first and let the effect re-run on the next render (checked
  // against `sim` directly rather than the derived `notableRules`).
  useEffect(() => {
    if (scrollTarget == null) {
      return;
    }
    if (!sim) {
      // No simulation has run yet, so the target row isn't rendered anywhere.
      // Land the user on the simulator and prompt them to run one, rather than
      // leaving the cross-link click looking dead (the "looks broken" finding).
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusHint(scrollTarget);
      setScrollTarget(null);
      onRuleFocused?.();
      return;
    }
    const rule = sim.rules.find((r) => r.index === scrollTarget);
    if (!rule) {
      setScrollTarget(null);
      onRuleFocused?.();
      return;
    }
    // Roadmap 047: the rows live inside the rules drawer now — open it first
    // (nothing a link can reach may sit behind a closed drawer), then let the
    // effect re-run once the row is actually in the DOM.
    if (!rulesOpen) {
      setRulesOpen(true);
      return;
    }
    // Reveal the target row if a filter is hiding it, then let the effect re-run.
    if (myRulesOnly && !repoRuleIndices.has(rule.index)) {
      setMyRulesOnly(false);
      return;
    }
    const visible = myRulesOnly || showAll || rule.verdict !== "no-match";
    if (!visible) {
      setShowAll(true);
      return;
    }
    const el = document.getElementById(`sim-rule-${scrollTarget}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("rcv-flash");
      window.setTimeout(() => el.classList.remove("rcv-flash"), 1600);
    }
    setScrollTarget(null);
    onRuleFocused?.();
  }, [
    scrollTarget,
    sim,
    showAll,
    myRulesOnly,
    rulesOpen,
    repoRuleIndices,
    onRuleFocused,
    setShowAll,
    setMyRulesOnly,
    setRulesOpen,
    setFocusHint,
  ]);

  function focusRule(mergedIndex: number) {
    setScrollTarget(mergedIndex);
  }

  return { cardRef, focusRule };
}
