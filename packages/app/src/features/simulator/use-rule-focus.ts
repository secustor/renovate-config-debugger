import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ProvenanceLayer, SimulationResult } from "@renovate-config-debugger/engine";
import { landOnTarget, motionScrollOptions } from "@/lib/motion";
import { type RuleFilters, ruleVisible } from "@/lib/rule-filters";

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
 * drawer, either filter facet) is cleared first and the effect re-runs once
 * the row is actually in the DOM.
 */
export function useRuleFocus({
  focusRuleIndex,
  onRuleFocused,
  sim,
  ruleFilters,
  setRuleFilters,
  layerByIndex,
  rulesOpen,
  setRulesOpen,
  setFocusHint,
}: {
  focusRuleIndex?: number | null;
  onRuleFocused?: () => void;
  sim: SimulationResult | null;
  ruleFilters: RuleFilters;
  setRuleFilters: Dispatch<SetStateAction<RuleFilters>>;
  layerByIndex: Map<number, ProvenanceLayer>;
  rulesOpen: boolean;
  setRulesOpen: Dispatch<SetStateAction<boolean>>;
  setFocusHint: Dispatch<SetStateAction<number | null>>;
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
  // in the DOM: if a filter facet is currently hiding it, reveal it first and
  // let the effect re-run on the next render (checked against `sim` and the
  // list's own `ruleVisible` predicate, never a copy of its filtering).
  useEffect(() => {
    if (scrollTarget == null) {
      return;
    }
    if (!sim) {
      // No simulation has run yet, so the target row isn't rendered anywhere.
      // Land the user on the simulator and prompt them to run one, rather than
      // leaving the cross-link click looking dead (the "looks broken" finding).
      cardRef.current?.scrollIntoView(motionScrollOptions("start"));
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
    // Reveal the target row if either facet is hiding it, then let the effect
    // re-run. Both are dropped at once (rather than relaxed one at a time):
    // the link's promise is "here is that rule", and a second re-run to get
    // past the other facet would scroll the page twice to keep it.
    if (!ruleVisible(rule, ruleFilters, layerByIndex)) {
      setRuleFilters({ verdict: "all", preset: "all" });
      return;
    }
    const el = document.getElementById(`sim-rule-${scrollTarget}`);
    if (el) {
      landOnTarget(el, "center");
    }
    setScrollTarget(null);
    onRuleFocused?.();
  }, [
    scrollTarget,
    sim,
    ruleFilters,
    layerByIndex,
    rulesOpen,
    onRuleFocused,
    setRuleFilters,
    setRulesOpen,
    setFocusHint,
  ]);

  function focusRule(mergedIndex: number) {
    setScrollTarget(mergedIndex);
  }

  return { cardRef, focusRule };
}
