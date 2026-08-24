import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useToggleSet } from "@/hooks/use-toggle-set";
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
  /** Go back: expand the origin thread, land on its head — and dismiss the pill
   *  once the landing has actually happened. */
  returnToThread: () => void;
  /** The pill reporting where focus reached IT from (`focusin`'s
   *  `relatedTarget`), and with `null` that it no longer holds focus. Spread as
   *  the pill's own `onFocus`/`onBlur`; nothing else calls it. */
  notePillFocus: (from: EventTarget | null) => void;
  /** A decoded link's `simThread`, applied to the NEXT run's threads. */
  requestThread: (key: string | null) => void;
  /** Exactly one thread open → the key a copied link should carry. */
  shareThreadKey?: string;
}

export function useThreadNav(sim: SimulationResult | null): ThreadNav {
  // Destructured so `exhaustive-deps` can see what the callbacks below depend
  // on: the hook's own are identity-stable, but the rule reads the object.
  const {
    set: openThreads,
    reset: resetThreads,
    add: addThread,
    remove: removeThread,
  } = useToggleSet();
  const [returnKey, setReturnKey] = useState<string | null>(null);
  // The key awaiting a scroll+flash once its row has committed (same idiom as
  // use-rule-focus's `scrollTarget`).
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const pendingThreadRef = useRef<string | null>(null);
  const returnKeyRef = useLatestRef(returnKey);

  // A new run is new evidence: its threads start collapsed, and whatever jump
  // the previous run's threads sent the reader on is over. A link's requested
  // thread is consumed HERE, inside the same effect, so the reset can never
  // land after it and fold the very thread the link asked for.
  useEffect(() => {
    const pending = pendingThreadRef.current;
    pendingThreadRef.current = null;
    resetThreads(pending === null ? undefined : new Set([pending]));
    setReturnKey(null);
  }, [sim, resetThreads]);

  // The landing itself. One pass is enough, unlike use-rule-focus: a thread's
  // HEAD renders whether or not the thread is expanded, so the element EXISTS by
  // the time this runs.
  //
  // Existing is not the same as being reachable, which is what the sentence
  // that used to stand here claimed (roadmap 068 review). All seven results
  // panels stay mounted and six carry `hidden` (`ResultsPanel`), and the pill is
  // `ambient` precisely so the jump layer keeps working under it — so press `4`
  // while it shows and the thread head is sitting inside a hidden panel:
  // `scrollIntoView` scrolls nothing, the flash is invisible, and `.focus()` is
  // a no-op. `document.activeElement` is the only witness (the same question
  // `lib/focus-restore.ts` exists for), and it decides the PILL's fate here.
  //
  // The pill is the affordance for a return that has not happened yet, so it
  // goes when the return has happened and stays when it has not — where
  // clearing it regardless destroyed the only way back in the very gesture that
  // failed to use it, and dropped focus to `<body>` as it unmounted under the
  // ring. What this hook cannot do is MAKE the head reachable: the results tab
  // is App's state and nothing the simulator holds selects it (see
  // `returnToThread`).
  useEffect(() => {
    if (focusKey === null) {
      return;
    }
    setFocusKey(null);
    const el = document.getElementById(threadHeadId(focusKey));
    if (el === null) {
      return;
    }
    landOnTarget(el, "center");
    if (document.activeElement === el) {
      setReturnKey(null);
    }
  }, [focusKey]);

  // Where focus reached the PILL from, or null whenever the pill does not hold
  // focus — reported by the pill itself through `notePillFocus`.
  //
  // Roadmap 068 review: this was a document-wide `focusin` listener recording
  // every focus move the page made while the pill was up, plus a reconciliation
  // (`move.to === document.activeElement`) for the moves that had since been
  // left behind — all to answer one question about one element. The element can
  // answer it directly: its own `focusin` names its predecessor in
  // `relatedTarget`, and its `blur` says the answer no longer applies, which is
  // what the reconciliation was standing in for (focus dropping to `<body>`
  // fires a blur ON THE PILL, where it fired no `focusin` to correct a
  // document-level record).
  const pillFocusFromRef = useRef<HTMLElement | null>(null);
  const notePillFocus = useCallback((from: EventTarget | null) => {
    pillFocusFromRef.current = from instanceof HTMLElement ? from : null;
  }, []);
  // Written by the Escape path alone, and read by the effect that runs once the
  // pill is actually gone.
  const dismissedFromRef = useRef<HTMLElement | null>(null);

  // Escape dismisses the pill — but only when it is not the POPOVER's Escape.
  // Roadmap 068: that precedence is now structural, and it is stated as a RANK
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
    // Read BEFORE the unmount: the record is the pill's own, and removing a
    // focused element is exactly what ends it.
    dismissedFromRef.current = pillFocusFromRef.current;
    setReturnKey(null);
  }, []);
  useEscapeLayer(returnKey !== null, dismissPill, ESCAPE_PRIORITY.ambient);

  // The pill's two exits have to land focus alike. `returnToThread` lands on
  // the thread head through `landOnTarget`; Escape used to just unmount a real,
  // Tab-reachable `<button>` out from under the focus ring, dropping focus to
  // <body> — the one landing 068 forbids, and the next Tab then restarts at the
  // skip link.
  //
  // A record exists only while the pill HOLDS focus, so its presence is what
  // identifies that case: focus was on the pill, the pill is gone, and the stop
  // the user reached it from gets the focus back. Escape pressed anywhere else
  // leaves the record null and this effect moves nothing — including when focus
  // entered the pill from outside the document (the address bar, another
  // window), where the tab order restarts exactly where the user was going to
  // re-enter it anyway.
  useEffect(() => {
    const from = dismissedFromRef.current;
    dismissedFromRef.current = null;
    if (returnKey !== null) {
      return;
    }
    // With no pill there is nothing to hold a record for — and a pill that went
    // with its run (the reset effect above) never blurred, so this is also what
    // keeps a detached node from outliving it.
    pillFocusFromRef.current = null;
    if (from === null) {
      return;
    }
    // Removing the focused element leaves focus on <body>; anything else there
    // was claimed by something in between, which is not this hook's to overrule.
    if (document.activeElement !== null && document.activeElement !== document.body) {
      return;
    }
    // An ASK, not a landing: the stop the user came from can itself be sitting
    // under a results panel the jump hid, and a `hidden` ancestor refuses focus
    // silently. Then focus stays where it is and this hook says nothing further
    // — it holds no other element to aim at, and guessing at one is what
    // `ShortcutSheet`'s restore stops doing at a landmark.
    if (from.isConnected) {
      from.focus({ preventScroll: true });
    }
  }, [returnKey]);

  const toggleThread = useCallback(
    (key: string, open: boolean) => {
      if (open) {
        addThread(key);
      } else {
        removeThread(key);
      }
    },
    [addThread, removeThread],
  );

  const noteJump = useCallback((key: string) => {
    setReturnKey(key);
  }, []);

  const requestThread = useCallback((key: string | null) => {
    pendingThreadRef.current = key;
  }, []);

  // Reads the current origin through a ref rather than a state updater: a
  // setState updater runs in the render phase, where triggering the other two
  // updates would be a side effect React is free to replay.
  //
  // The pill is NOT dismissed here (roadmap 068 review): the landing effect
  // above dismisses it, and only once the landing has happened.
  //
  // What this cannot do is make the thread head visible first. The head lives in
  // the Simulator results panel, the pill is portalled to <body> and shows on
  // every tab, and returning from a jump that switched tabs — the card's own
  // provenance chip is one — should make the Simulator tab current before it
  // lands. The results tab is App's state; nothing this hook or `RuleSimulator`
  // holds can select it, so that half needs a prop from App and is not fixed
  // here. Until it is, the failed return leaves the pill standing rather than
  // spending it.
  const returnToThread = useCallback(() => {
    const key = returnKeyRef.current;
    if (key === null) {
      return;
    }
    addThread(key);
    setFocusKey(key);
    // A stable ref object — listed only because `exhaustive-deps` cannot see
    // the `useRef()` behind `useLatestRef`. The identity stays stable.
  }, [returnKeyRef, addThread]);

  return {
    openThreads,
    toggleThread,
    noteJump,
    returnKey,
    returnToThread,
    notePillFocus,
    requestThread,
    // Only unambiguous when ONE thread is open: with two expanded, a link
    // carrying either would be the app choosing for the sender.
    shareThreadKey: openThreads.size === 1 ? [...openThreads][0] : undefined,
  };
}
