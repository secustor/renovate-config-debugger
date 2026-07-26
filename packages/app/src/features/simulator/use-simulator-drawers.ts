import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

export interface SimulatorDrawers {
  moreFieldsOpen: boolean;
  setMoreFieldsOpen: Dispatch<SetStateAction<boolean>>;
  rulesOpen: boolean;
  setRulesOpen: Dispatch<SetStateAction<boolean>>;
  mergeOpen: boolean;
  setMergeOpen: Dispatch<SetStateAction<boolean>>;
  rulesDrawerRef: RefObject<HTMLDetailsElement | null>;
  mergeDrawerRef: RefObject<HTMLDetailsElement | null>;
  jumpToRules: () => void;
  jumpToStep: (stopIndex: number) => void;
}

/**
 * Roadmap 047: the three summary drawers' open state, and the cross-links
 * that open the drawer they target. It lives here rather than on the
 * `<details>` elements so it survives a quick-fill, a re-simulation and a new
 * pipeline run — "a disclosure must not move or reset unrelated UI", and a
 * re-run must never fold what the user opened.
 */
export function useSimulatorDrawers({
  mergeStepIndex,
  onMergeStepChange,
}: {
  mergeStepIndex?: number;
  onMergeStepChange?: (index: number) => void;
}): SimulatorDrawers {
  const [moreFieldsOpen, setMoreFieldsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const rulesDrawerRef = useRef<HTMLDetailsElement>(null);
  const mergeDrawerRef = useRef<HTMLDetailsElement>(null);

  // Roadmap 047: a share link whose `simStep` points at a merge stop must
  // arrive with the merge drawer open — the stop it restored is inside it.
  // One-way: a re-simulation resetting the index to 0 never folds the drawer.
  useEffect(() => {
    if ((mergeStepIndex ?? 0) > 0) {
      setMergeOpen(true);
    }
  }, [mergeStepIndex]);

  // Roadmap 047: cross-links OPEN what they target. The scroll runs against
  // the drawer's own <details> element, which exists whether or not its body
  // is currently mounted — so the same call works on a closed drawer that this
  // click is opening in the very same tick.
  function jumpToRules() {
    setRulesOpen(true);
    rulesDrawerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** A verdict-card jump link → open the merge drawer, select that stop, and
   *  bring the drawer into view. */
  function jumpToStep(stopIndex: number) {
    setMergeOpen(true);
    onMergeStepChange?.(stopIndex);
    mergeDrawerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return {
    moreFieldsOpen,
    setMoreFieldsOpen,
    rulesOpen,
    setRulesOpen,
    mergeOpen,
    setMergeOpen,
    rulesDrawerRef,
    mergeDrawerRef,
    jumpToRules,
    jumpToStep,
  };
}
