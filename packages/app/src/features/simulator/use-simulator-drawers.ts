import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { mergeStopId } from "./dom-ids";
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
  jumpToReplay: () => void;
  jumpToStep: (stopIndex: number) => void;
}

/** What a jump is waiting to scroll to: a drawer, or one stop inside the
 *  replay. A fresh OBJECT per jump — see the effect below. */
type ScrollRequest = { drawer: "rules" | "merge"; stopIndex?: number };

/**
 * Roadmap 047: the panel's disclosure state — the two summary drawers below
 * the verdict, the form's open field group (079's successor to the single
 * "More about this update" drawer), and the cross-links that open the drawer
 * they target. It lives here rather than on the `<details>` elements so it
 * survives a quick-fill, a re-simulation and a new pipeline run — "a
 * disclosure must not move or reset unrelated UI", and a re-run must never
 * fold what the user opened.
 */
export function useSimulatorDrawers(): SimulatorDrawers {
  const [openFieldGroup, setOpenFieldGroup] = useState(-1);
  const [rulesOpen, setRulesOpen] = useState(false);
  // Roadmap 094: the merge drawer always starts closed. It used to open itself
  // for a share link whose `simStep` named a stop; the stepper that index drove
  // is retired, and `simStep` is decoded and ignored now.
  const [mergeOpen, setMergeOpen] = useState(false);
  const rulesDrawerRef = useRef<HTMLDetailsElement>(null);
  const mergeDrawerRef = useRef<HTMLDetailsElement>(null);

  // Roadmap 047: cross-links OPEN what they target. The drawer's <details>
  // element exists whether or not its body is mounted, but SummaryDrawer only
  // mounts the body once `open` is true — a scrollIntoView in the same tick
  // runs against the closed-drawer document height and gets clamped, so from
  // near the bottom of the page it is a visual no-op. Defer the scroll until
  // the commit where the body exists (same pending-target idiom as
  // `focusKey` in use-thread-nav.ts) — which is also the commit where a stop's
  // own element exists to be scrolled to.
  //
  // The request is a fresh OBJECT per jump rather than a name the effect clears
  // once it has scrolled: identity is what makes two jumps to the same drawer
  // two runs of this effect, and it gets there without the effect writing state
  // back into the render it was started by.
  const [pendingScroll, setPendingScroll] = useState<ScrollRequest | null>(null);
  useEffect(() => {
    if (pendingScroll === null) {
      return;
    }
    const stop =
      pendingScroll.stopIndex === undefined
        ? null
        : document.getElementById(mergeStopId(pendingScroll.stopIndex));
    const drawer = pendingScroll.drawer === "rules" ? rulesDrawerRef : mergeDrawerRef;
    (stop ?? drawer.current)?.scrollIntoView(motionScrollOptions("start"));
  }, [pendingScroll]);

  function jumpToRules() {
    setRulesOpen(true);
    setPendingScroll({ drawer: "rules" });
  }

  /** The verdict foot's "build replay, K stops" link → open the replay at its
   *  head, which is where the sequence starts. */
  function jumpToReplay() {
    setMergeOpen(true);
    setPendingScroll({ drawer: "merge" });
  }

  /** A verdict-card jump link → open the merge drawer and bring THAT stop into
   *  view (roadmap 094: the stop is a section of the list, not a selection). */
  function jumpToStep(stopIndex: number) {
    setMergeOpen(true);
    setPendingScroll({ drawer: "merge", stopIndex });
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
    jumpToReplay,
    jumpToStep,
  };
}
