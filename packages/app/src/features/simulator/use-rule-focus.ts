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
import { useSyncedReset } from "@/hooks/use-synced-reset";

export interface RuleFocus {
  /** The simulator card itself — where a cross-link lands when no simulation
   *  has run yet. */
  cardRef: RefObject<HTMLDivElement | null>;
  /** A merged rule index a click on a `packageRules[N]` message link asked to see. */
  focusRule: (mergedIndex: number) => void;
}

/**
 * Roadmap 068 review: the fallback landing, for the two exits below that have
 * no rule row to land on. Both are only reachable from the EXTERNAL
 * `focusRuleIndex` prop — this component's own `packageRules[N]` links exist
 * only inside a rendered simulation — and that prop is set by a click in the
 * Problems panel, which `jumpToTab("tests")` marks `hidden` in the same
 * commit. The browser has therefore already blurred the link the user
 * activated and dropped focus on `<body>`, so a jump that only scrolls leaves
 * the reader moved and their next Tab restarting at the top of the document.
 *
 * The card is a plain `<div>`, so `tabIndex` is set here rather than in the
 * JSX: `-1` makes it a landing site without making it a tab stop, and setting
 * it from the one place that focuses it keeps the attribute next to its reason.
 *
 * Scroll and focus but no flash, which is why this is not `landOnTarget`: the
 * flash says "the thing you named is HERE", and here there is no such thing to
 * point at — these two exits land on the card precisely because the row the
 * link named does not exist. A whole card lighting up would be pointing at the
 * wrong answer.
 */
function landOnCard(card: HTMLDivElement | null): void {
  if (!card) {
    return;
  }
  card.tabIndex = -1;
  card.scrollIntoView(motionScrollOptions("start"));
  card.focus({ preventScroll: true });
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
  // Roadmap 013: the merged index awaiting a scroll+flash. An index the
  // EXTERNAL prop already carries at mount is one of them, so it is the initial
  // value rather than something an effect copies in a commit later.
  const [scrollTarget, setScrollTarget] = useState<number | null>(focusRuleIndex ?? null);
  // A later external index is adopted through React's "adjust state when a prop
  // changes" idiom rather than an effect: the prop is the whole trigger and the
  // copy reads nothing else, so the landing below starts from the render that
  // observed the cross-link instead of one commit after it. Null is the prop's
  // "consumed" state (`onRuleFocused` clears it) and clears no target: the
  // landing owns when a target is done.
  useSyncedReset(focusRuleIndex, () => {
    if (focusRuleIndex != null) {
      setScrollTarget(focusRuleIndex);
    }
  });

  // Performs the actual scroll+flash once the target row is guaranteed to be
  // in the DOM: if a filter facet is currently hiding it, reveal it first and
  // let the effect re-run on the next render (checked against `sim` and the
  // list's own `ruleVisible` predicate, never a copy of its filtering).
  //
  // A reveal-then-land machine, and only an effect can be one: every pass asks
  // a question about a COMMITTED DOM. `landed` is the pass's verdict, and there
  // is exactly one place that acts on it — a reveal returns with the target
  // still set so the next commit gets another pass, and a landing consumes it.
  useEffect(() => {
    if (scrollTarget == null) {
      return;
    }
    let landed = true;
    if (!sim) {
      // No simulation has run yet, so the target row isn't rendered anywhere.
      // Land the user on the simulator and prompt them to run one, rather than
      // leaving the cross-link click looking dead (the "looks broken" finding).
      // Focus goes to the card too (068 review): the hint below it is what the
      // reader is meant to act on, and from the card the next Tab reaches the
      // form it names.
      landOnCard(cardRef.current);
      setFocusHint(scrollTarget);
    } else {
      const rule = sim.rules.find((r) => r.index === scrollTarget);
      if (!rule) {
        // A merged index this simulation does not contain — its rules describe
        // the config as it was when it ran. There is no row to flash and (the
        // hint above renders only before the first simulation) nothing to say,
        // so the card is the whole landing: without it this exit moved neither
        // the page nor the focus, which is exactly what a dead link looks like.
        landOnCard(cardRef.current);
      } else if (!rulesOpen) {
        // Roadmap 047: the rows live inside the rules drawer now — open it
        // first (nothing a link can reach may sit behind a closed drawer), then
        // let the effect re-run once the row is actually in the DOM.
        setRulesOpen(true);
        landed = false;
      } else if (!ruleVisible(rule, ruleFilters, layerByIndex)) {
        // Reveal the target row if either facet is hiding it, then let the
        // effect re-run. Both are dropped at once (rather than relaxed one at a
        // time): the link's promise is "here is that rule", and a second re-run
        // to get past the other facet would scroll the page twice to keep it.
        setRuleFilters({ verdict: "all", preset: "all" });
        landed = false;
      } else {
        const el = document.getElementById(`sim-rule-${scrollTarget}`);
        if (el) {
          landOnTarget(el, "center");
        }
      }
    }
    if (!landed) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- the one consume point of the machine described above, and it can live nowhere else: only a pass that has read the committed DOM knows the landing HAPPENED. Leaving the target set instead would re-land the page on every later filter change; clearing it during render would end the loop before its first pass ran.
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
