import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulationResult } from "@renovate-config-visualizer/engine";
import { flashTarget, motionScrollOptions } from "@/lib/motion";
import { RULE_POP_SELECTOR } from "./rule-pop-dom";

/**
 * Roadmap 053 (layer 4): thread expansion and the way back from a jump, as one
 * concern — because they are one concern. Expansion was local to each
 * `ThreadRow` in layer 2, which was right until two things outside a row
 * needed to open one: a share link's `simThread`, and the return pill, whose
 * whole job is to put the reader back inside the thread they left.
 *
 * The set of open keys is the simulator's, not App's (see RuleSimulator's
 * `copySimLink`): a thread only exists for the LAST run's evidence and several
 * can be open at once, so App owning it would mean App mirroring a Set it has
 * no use for — unlike `mergeStepIndex`, which is a controlled stepper's index.
 * The consequence is documented where it bites: a jump does not push a history
 * entry, so browser Back does not undo one — the pill is what undoes it.
 */

const NO_THREADS: ReadonlySet<string> = new Set();

/** The thread head's DOM id — what a return (or a deep link) scrolls to. Keys
 *  are config option names, so this is `getElementById`-safe as written. */
export function threadHeadId(key: string): string {
  return `sim-thread-${key}`;
}

export interface ThreadNav {
  /** The expanded threads, by key. */
  openThreads: ReadonlySet<string>;
  toggleThread: (key: string, open: boolean) => void;
  /** Record a thread-originated jump — the pill's origin. */
  noteJump: (key: string) => void;
  /** The thread a jump left behind, or null when no pill is showing. */
  returnKey: string | null;
  /** Go back: expand the origin thread, scroll to its head, flash it. */
  returnToThread: () => void;
  /** A decoded link's `simThread`, applied to the NEXT run's threads. */
  requestThread: (key: string | null) => void;
  /** Exactly one thread open → the key a copied link should carry. */
  shareThreadKey?: string;
}

export function useThreadNav(sim: SimulationResult | null): ThreadNav {
  const [openThreads, setOpenThreads] = useState<ReadonlySet<string>>(NO_THREADS);
  const [returnKey, setReturnKey] = useState<string | null>(null);
  // The key awaiting a scroll+flash once its row has committed (same idiom as
  // use-rule-focus's `scrollTarget`).
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const pendingThreadRef = useRef<string | null>(null);
  const returnKeyRef = useRef(returnKey);
  returnKeyRef.current = returnKey;

  // A new run is new evidence: its threads start collapsed, and whatever jump
  // the previous run's threads sent the reader on is over. A link's requested
  // thread is consumed HERE, inside the same effect, so the reset can never
  // land after it and fold the very thread the link asked for.
  useEffect(() => {
    const pending = pendingThreadRef.current;
    pendingThreadRef.current = null;
    setOpenThreads(pending === null ? NO_THREADS : new Set([pending]));
    setReturnKey(null);
  }, [sim]);

  // The scroll+flash itself. One pass is enough, unlike use-rule-focus: a
  // thread's HEAD renders whether or not the thread is expanded, so nothing
  // can be hiding the target by the time this runs.
  useEffect(() => {
    if (focusKey === null) {
      return;
    }
    const el = document.getElementById(threadHeadId(focusKey));
    if (el) {
      el.scrollIntoView(motionScrollOptions("center"));
      flashTarget(el);
    }
    setFocusKey(null);
  }, [focusKey]);

  // Escape dismisses the pill — but only when it is not the POPOVER's Escape.
  // A rule-evidence card open over the page owns that key first; its own
  // document listener closes it, and React has not yet unmounted the card when
  // this listener runs, which is exactly what the query below tests.
  useEffect(() => {
    if (returnKey === null) {
      return;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && document.querySelector(RULE_POP_SELECTOR) === null) {
        setReturnKey(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [returnKey]);

  const toggleThread = useCallback((key: string, open: boolean) => {
    setOpenThreads((prev) => {
      const next = new Set(prev);
      if (open) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const noteJump = useCallback((key: string) => {
    setReturnKey(key);
  }, []);

  const requestThread = useCallback((key: string | null) => {
    pendingThreadRef.current = key;
  }, []);

  // Reads the current origin through a ref rather than a state updater: a
  // setState updater runs in the render phase, where triggering the other two
  // updates would be a side effect React is free to replay.
  const returnToThread = useCallback(() => {
    const key = returnKeyRef.current;
    if (key === null) {
      return;
    }
    setReturnKey(null);
    setOpenThreads((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    setFocusKey(key);
  }, []);

  return {
    openThreads,
    toggleThread,
    noteJump,
    returnKey,
    returnToThread,
    requestThread,
    // Only unambiguous when ONE thread is open: with two expanded, a link
    // carrying either would be the app choosing for the sender.
    shareThreadKey: openThreads.size === 1 ? [...openThreads][0] : undefined,
  };
}
