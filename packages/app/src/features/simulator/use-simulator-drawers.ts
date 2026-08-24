import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { motionScrollOptions } from "@/lib/motion";

export interface SimulatorDrawers {
  /** Roadmap 079: which of the form's three field groups is expanded, or -1. */
  openFieldGroup: number;
  setOpenFieldGroup: Dispatch<SetStateAction<number>>;
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
 * Roadmap 047: the panel's disclosure state — the two summary drawers below
 * the verdict, the form's open field group (079's successor to the single
 * "More about this update" drawer), and the cross-links that open the drawer
 * they target. It lives here rather than on the `<details>` elements so it
 * survives a quick-fill, a re-simulation and a new pipeline run — "a
 * disclosure must not move or reset unrelated UI", and a re-run must never
 * fold what the user opened.
 */
export function useSimulatorDrawers({
  mergeStepIndex,
  onMergeStepChange,
}: {
  mergeStepIndex: number;
  onMergeStepChange: (index: number) => void;
}): SimulatorDrawers {
  const [openFieldGroup, setOpenFieldGroup] = useState(-1);
  const [rulesOpen, setRulesOpen] = useState(false);
  // Roadmap 047: a share link whose `simStep` points at a merge stop must
  // arrive with the merge drawer open — the stop it restored is inside it. An
  // index that is already restored when this hook mounts is known right here,
  // so the drawer STARTS open rather than being opened a commit later.
  const [mergeOpen, setMergeOpen] = useState(() => mergeStepIndex > 0);
  const rulesDrawerRef = useRef<HTMLDetailsElement>(null);
  const mergeDrawerRef = useRef<HTMLDetailsElement>(null);

  // …and an index restored AFTER mount opens it through React's "adjust state
  // when a prop changes" idiom rather than an effect: the index is the TRIGGER
  // and nothing here reads it afterwards, so as an effect it was a dependency
  // whose value the body only compared against zero. One-way either way: a
  // re-simulation resetting the index to 0 never folds the drawer.
  const [mergeStepOwner, setMergeStepOwner] = useState(mergeStepIndex);
  if (mergeStepIndex !== mergeStepOwner) {
    setMergeStepOwner(mergeStepIndex);
    if (mergeStepIndex > 0) {
      setMergeOpen(true);
    }
  }

  // Roadmap 047: cross-links OPEN what they target. The drawer's <details>
  // element exists whether or not its body is mounted, but SummaryDrawer only
  // mounts the body once `open` is true — a scrollIntoView in the same tick
  // runs against the closed-drawer document height and gets clamped, so from
  // near the bottom of the page it is a visual no-op. Defer the scroll until
  // the commit where the body exists (same pending-target idiom as
  // `focusKey` in use-thread-nav.ts).
  //
  // The request is a fresh OBJECT per jump rather than a name the effect clears
  // once it has scrolled: identity is what makes two jumps to the same drawer
  // two runs of this effect, and it gets there without the effect writing state
  // back into the render it was started by.
  const [pendingScroll, setPendingScroll] = useState<{ drawer: "rules" | "merge" } | null>(null);
  useEffect(() => {
    if (pendingScroll === null) {
      return;
    }
    const ref = pendingScroll.drawer === "rules" ? rulesDrawerRef : mergeDrawerRef;
    ref.current?.scrollIntoView(motionScrollOptions("start"));
  }, [pendingScroll]);

  function jumpToRules() {
    setRulesOpen(true);
    setPendingScroll({ drawer: "rules" });
  }

  /** A verdict-card jump link → open the merge drawer, select that stop, and
   *  bring the drawer into view. */
  function jumpToStep(stopIndex: number) {
    setMergeOpen(true);
    onMergeStepChange(stopIndex);
    setPendingScroll({ drawer: "merge" });
  }

  return {
    openFieldGroup,
    setOpenFieldGroup,
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
