import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulationResult } from "@renovate-config-debugger/engine";
import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { landOnTarget } from "@/lib/motion";
import { useEscapeLayer } from "@/hooks/use-escape-layer";

/**
 * Roadmap 054 (layer 4): thread expansion and the way back from a jump, as one
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
      landOnTarget(el, "center");
    }
    setFocusKey(null);
  }, [focusKey]);

  // The last focus MOVE, tracked only while the pill is showing: a `focusin`
  // describes the transition it is — `relatedTarget` is the element that lost
  // focus, `target` the one that gained it — and keeping both halves is what
  // lets the Escape path below use a move only when it is the one that put
  // focus where focus is standing now. `relatedTarget` alone was recorded as
  // "the stop before the pill" while meaning "the stop before whatever gained
  // focus last", and the two part company as soon as focus drops to <body>
  // (a click on dead space fires no `focusin` to correct the record).
  const lastFocusMoveRef = useRef<{ to: EventTarget | null; from: HTMLElement | null } | null>(
    null,
  );
  // Written by the Escape path alone, and read by the effect that runs once the
  // pill is actually gone.
  const dismissedRef = useRef<{ focused: Element | null; from: HTMLElement | null } | null>(null);

  useEffect(() => {
    if (returnKey === null) {
      return;
    }
    function onFocusIn(event: FocusEvent) {
      lastFocusMoveRef.current = {
        to: event.target,
        from: event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null,
      };
    }
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      // Nothing is listening to keep it current, and the pair would otherwise
      // hold two detached nodes alive until the next pill appears.
      lastFocusMoveRef.current = null;
    };
  }, [returnKey]);

  // Escape dismisses the pill — but only when it is not the POPOVER's Escape.
  // Roadmap 067: that precedence is now structural, and it is stated as a RANK
  // rather than left to mount order. The pill is the bottom of the ladder even
  // when it registers last, which it does whenever a jump starts from a thread
  // body that already has a rule-evidence card open — the case the deleted
  // `document.querySelector(RULE_POP_SELECTOR)` check used to cover.
  //
  // The ladder also declines a press something else already acted on, which
  // the pill's own listener never did: the shared listener bails on
  // `defaultPrevented` (`hooks/use-escape-layer.ts`), the claim an
  // element-scoped handler owes it (`lib/escape-stack.ts`). That is the point,
  // not a loss — a glossary card claims exactly that way, and a check-free
  // listener hides the card and destroys the pill in one press, which is the
  // two-layer press the ladder exists to prevent. Nothing strands the pill
  // either: a handler only claims a press it acted on (the editor included,
  // verified in `use-escape-layer.ts`), so the press after it is the pill's.
  const dismissPill = useCallback(() => {
    const focused = document.activeElement;
    const move = lastFocusMoveRef.current;
    // Only the move that landed on the currently focused element says where
    // that focus came from; any older one describes a stop the user has left.
    const from = move !== null && move.to === focused ? move.from : null;
    dismissedRef.current = { focused, from };
    setReturnKey(null);
  }, []);
  useEscapeLayer(returnKey !== null, dismissPill, ESCAPE_PRIORITY.ambient);

  // The pill's two exits have to land focus alike. `returnToThread` lands on
  // the thread head through `landOnTarget`; Escape used to just unmount a real,
  // Tab-reachable `<button>` out from under the focus ring, dropping focus to
  // <body> — the one landing 067 forbids, and the next Tab then restarts at the
  // skip link.
  //
  // "The element that was focused when Escape arrived is no longer in the
  // document" is what identifies that case, and identifies it without this hook
  // recognising the pill's markup — the pill is portalled to <body> and nothing
  // here ever holds its element. Escape pressed anywhere else leaves its target
  // connected, so it never moves focus.
  //
  // Neither half names the pill, and neither needs to: focus was on something
  // that arrived there from `from`, that something is gone, so `from` gets the
  // focus back. Whatever vanished under the ring in this dismissal, that is
  // the landing — the pill is only the one this hook can make vanish.
  useEffect(() => {
    const dismissed = dismissedRef.current;
    dismissedRef.current = null;
    if (returnKey !== null || dismissed === null) {
      return;
    }
    if (dismissed.focused === null || dismissed.focused.isConnected) {
      return;
    }
    if (document.activeElement !== null && document.activeElement !== document.body) {
      return;
    }
    // Nothing to aim at when focus entered the pill from outside the document
    // (the address bar, another window): the tab order restarts exactly where
    // the user was going to re-enter it anyway.
    if (dismissed.from?.isConnected === true) {
      dismissed.from.focus({ preventScroll: true });
    }
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
