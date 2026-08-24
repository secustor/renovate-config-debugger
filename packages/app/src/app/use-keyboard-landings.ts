/**
 * Roadmap 068/078 — where a keystroke takes you, as one hook: the global key
 * bindings the shell owns (⌘⏎, ⌘⇧⏎, `e`, `r`, `?`, `1`–`7`), the `?` sheet
 * they are all inert behind, the two skip links that mean the same thing with
 * a pointer, and every landing those gestures perform — the editor, the
 * results, one named tab, the selected preset row.
 *
 * The pieces are one concept because they are one question: a gesture arrives,
 * and something has to decide where focus ends up and when. `lib/focus-landing.ts`
 * is the pure half of that (the ticket, `landingWanted`, `jumpDisplacedFocus`)
 * and `app/use-focus-landing.ts` is the React half; this is the shell's
 * vocabulary built on top of them, so a skip link and a key can never disagree
 * about where "the results" is.
 *
 * It owns only its own state — the sheet's open flag and the one outstanding
 * ⌘⇧⏎ landing — and reads everything else through refs and callbacks App
 * already had ({@link KeyboardLandingsHost}). Nothing was lifted out of App to
 * make this hook possible, which is the line hooks share logic across and
 * state does not.
 *
 * What deliberately stayed in App: `runFromGesture`. It is the RUN path —
 * `preloadRunChunks` plus the run queue's `onRun`, whose options and folding
 * rules are App's (roadmap 048 measured that coupling and left it alone) — so
 * it is handed in rather than moved, and the half of it that IS a focus
 * question, `gestureWantsResultsLanding`, lives here and is handed back.
 */
import { type MouseEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import type { ConfigEditorHandle } from "@/features/editor/ConfigEditor";
import type { ResultsTabDescriptor } from "@/components/ResultsPanel";
import type { ResultsTabId } from "@/data/results-tabs";
import { type FocusLanding, focusHolder, useFocusLanding } from "@/app/use-focus-landing";
import type { LandingTicket } from "@/lib/focus-landing";
import { flashTarget, motionScrollOptions } from "@/lib/motion";
import { SELECTED_PRESET_ROW } from "@/lib/preset-row-dom";
import { tabButtonSelector } from "@/lib/results-tab-dom";
import {
  FOCUS_EDITOR_SHORTCUT,
  FOCUS_RESULTS_SHORTCUT,
  HELP_SHORTCUT,
  RUN_AND_READ_SHORTCUT,
  RUN_SHORTCUT,
} from "@/lib/shortcuts";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useShortcut } from "@/hooks/use-shortcut";
import { useTabDigits } from "@/app/use-tab-digits";

/**
 * Roadmap 068: the tab the strip currently shows as chosen — where "take me to
 * the results" lands (`focusResults`), and the one element there that announces
 * where you are.
 *
 * Reaching for it by SELECTOR at all, because nothing on this side of the lazy
 * results boundary holds a handle to it. Spelled out here, unlike the other two
 * elements the landings find (`results-tab-dom.ts` for a named tab button,
 * `preset-row-dom.ts` for the selected preset row), because this one is not a
 * class or an attribute anyone chose: `aria-selected="true"` on a `role="tab"`
 * is the ARIA tablist pattern itself, which `ResultsPanel` cannot rename without
 * ceasing to be one.
 */
const SELECTED_RESULTS_TAB = '[role="tab"][aria-selected="true"]';

/** What the bindings and landings need from App. Handed in fresh every render;
 *  nothing here is state this hook owns. */
export interface KeyboardLandingsHost {
  /** The finished run. Gates the bindings that only mean something once results
   *  exist, and IS the commit ⌘⇧⏎'s deferred landing waits for. */
  result: TraceResult | null;
  /** The strip as it currently renders — the digit keys follow whatever it
   *  shows, which is why this is the descriptor list and not a count. */
  resultsTabs: ResultsTabDescriptor[];
  /** A tab was CHOSEN (clears the cross-link back trail) — App owns the state. */
  setTab: (next: ResultsTabId) => void;
  /**
   * "The user asked for a run", App's spelling. Left there because it is the
   * run path: it warms the 031 chunks and goes through the run queue, and it
   * reads {@link KeyboardLandings.gestureWantsResultsLanding} to decide whether
   * 028's tab reset belongs to the gesture. Returns the run's promise — ⌘⇧⏎ is
   * the caller that has to know whether its run ever produced a result.
   */
  runFromGesture: () => Promise<TraceResult | null>;
  /** The config column — the containment test `gestureWantsResultsLanding` is. */
  configColRef: RefObject<HTMLDivElement | null>;
  /** The results column — every landing below looks for its target inside it,
   *  and it is the `tabIndex={-1}` fallback when one never appears. */
  resultsColRef: RefObject<HTMLDivElement | null>;
  /** The editor's imperative handle — `focusEditor` is only its `focus()`. */
  configEditorRef: RefObject<ConfigEditorHandle | null>;
}

/** Everything App's JSX and its other callbacks consume from this cluster. */
export interface KeyboardLandings {
  /** The `?` sheet's open flag, and the two ways it changes. */
  shortcutSheetOpen: boolean;
  showShortcuts: () => void;
  hideShortcuts: () => void;
  /** False while the sheet is open — App passes it on to any binding of its
   *  own, for the reason the flag's declaration below spells out. */
  keysLive: boolean;
  /** The landing machinery itself, for the one caller outside this cluster:
   *  `applyErrorFix` arms its ticket before an await and lands with `focusTab`
   *  seconds later. */
  landing: FocusLanding;
  focusEditor: () => void;
  focusResults: (ticket?: LandingTicket) => void;
  focusTab: (id: ResultsTabId, ticket?: LandingTicket) => void;
  landOnPresetNode: () => void;
  skipToConfig: (event: MouseEvent<HTMLAnchorElement>) => void;
  skipToResults: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Whether 028's results landing belongs to the gesture asking for this run.
   *  Read by App's `runFromGesture` — see its doc comment below. */
  gestureWantsResultsLanding: () => boolean;
}

export function useKeyboardLandings(host: KeyboardLandingsHost): KeyboardLandings {
  const {
    result,
    resultsTabs,
    setTab,
    runFromGesture,
    configColRef,
    resultsColRef,
    configEditorRef,
  } = host;

  /**
   * Roadmap 068: the `?` sheet is a modal dialog, so every global binding is
   * inert while it is open — a key that acted on the page behind it would be
   * acting on something the user cannot see. Declared here, above the first
   * binding, because a binding registered above `keysLive` is a binding that
   * silently opts out of that rule: ⌘⏎ was exactly that, and ran the pipeline,
   * replaced the results and announced itself from behind the dialog.
   *
   * Threaded through every `enabled` rather than replaced by
   * `modalKeyboardOwned()` (eighth review), which answers the same question
   * globally. The two are not interchangeable and the difference is the point:
   * `enabled` UNREGISTERS the listener, so the binding cannot fire, cannot claim
   * the key with `preventDefault`, and cannot hand the browser a chord we own —
   * whereas a module-state query can only decline inside a handler that has
   * already run. It also has to be answered at render time to be a prop at all,
   * which is what puts the rule in one visible place instead of once per
   * listener. `modalKeyboardOwned()` stays the query for the handlers that have
   * no props to be gated by (the Escape ladder, the 016 page scroll, the
   * evidence card's light-dismiss).
   */
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const showShortcuts = useCallback(() => setShortcutSheetOpen(true), []);
  const hideShortcuts = useCallback(() => setShortcutSheetOpen(false), []);
  const keysLive = !shortcutSheetOpen;

  /**
   * Roadmap 068 review: whether 028's landing — reset the results to the first
   * tab, or to Problems when a stage errored — belongs to the gesture asking for this
   * run. The question the reset always depended on and never had to ask, because
   * before 068 the only way to reach Run was to leave the results.
   *
   * ⌘⏎ is global, so it stopped being safe to assume: pressing it while reading
   * Effective config, Presets or Problems replaced that panel with the landing
   * tab a second later, and `setTab` clears `backTab` on its way, so the
   * cross-link that brought the reader there was gone with it.
   *
   * The rule is the one 028 stated: **that landing belongs to the reader of the
   * CONFIG column** — they edited, they asked for a run, and the landing tab is
   * where its answer starts. So this asks whether the gesture was made there,
   * and everything else keeps the tab it was on. Focus genuinely nowhere counts
   * as the config column's: it is the state before anyone has touched anything,
   * where the first run's landing is the whole point, and it is where a click on
   * the Run button leaves Safari.
   *
   * Asked the other way round — "is focus inside the RESULTS column?" — until
   * the eighth review, which is the same question only while the results are
   * entirely inside their column, and they are not: the rule-evidence card
   * (which takes focus in its own effect) and the simulator's return pill are
   * both portalled to `<body>` (035). A ⌘⏎ from inside the evidence card
   * therefore read as "outside the results" and threw the reader to the landing
   * tab, back affordance cleared, card left explaining a rule that was no
   * longer rendered. Enumerating those overlays here would work exactly until
   * the next one is added — the failure mode the deleted request-fold key was
   * retired for — while the config column has no portals and is one containment
   * test that cannot go stale.
   *
   * What changed for gestures made in neither column (the header, a skip link):
   * they now keep the tab instead of resetting it. That is the honest reading of
   * the rule — nobody in the header is reading the config — and it is the safe
   * direction besides: a run that errors under a reader who stayed put still
   * says so through the Problems badge and the banner above the panels.
   */
  function gestureWantsResultsLanding(): boolean {
    // `focusHolder`, not a second reading of `document.activeElement`: "holds
    // nothing" is `<body>` as often as it is null (the browser drops focus to
    // the body when the element holding it is hidden, Safari leaves it there
    // after a click on a button), and the landings' own `from` is that same
    // collapse — one spelling, in `app/use-focus-landing.ts`.
    const active = focusHolder();
    if (active === null) {
      return true;
    }
    const column = configColRef.current;
    return column !== null && column.contains(active);
  }

  /**
   * Roadmap 068: ⌘⏎ (Ctrl+Enter) runs the pipeline from anywhere on the page.
   * Inside the editor the same chord is handled by CodeMirror instead
   * (`run-keymap.ts`) — it has to be, or Renovate's config would gain a blank
   * line every time someone ran it — and that handler marks the event handled,
   * which is what keeps the two from both firing.
   */
  useShortcut(
    RUN_SHORTCUT,
    () => void runFromGesture(),
    // Not gated on `running` any more, and that is the point of the fix above:
    // ⌘⏎ has to mean the same thing wherever it is pressed, and inside the
    // editor it cannot decline (declining hands the chord back to
    // `insertBlankLine`). A second press after an edit therefore queues a run
    // from the page exactly as it does from the editor, and the button's
    // `disabled={running}` stays what it always was — the visible half, for the
    // pointer. Auto-repeat is declined a layer lower, by `useShortcut`'s
    // `KeyboardEvent.repeat` test; a deliberate second press is a second run,
    // queued behind the first (`onRun` explains why it is no longer folded into
    // it).
    { enabled: keysLive },
  );

  /**
   * Roadmap 068: the landing machinery every jump below goes through — the
   * ticket a gesture takes, the animation-frame wait for a target that does not
   * exist yet, and the question each landing has to answer before it moves
   * anyone (`lib/focus-landing.ts`, where it is unit-tested).
   */
  const landing = useFocusLanding();

  /**
   * Roadmap 068: the app's two jump targets, defined once.
   *
   * The skip links and the tier-1 `e` / `r` keys both land through these, so a
   * link and a key can never disagree about where "the editor" or "the results"
   * is.
   *
   * The config target is the EDITOR, not the column: landing on the column
   * (what the bare fragment jump did) put the reader on the pre-run welcome
   * blurb with the editor still two tab stops away, which reads as the link
   * having done nothing. Safe to drop someone into a text box now, because 068
   * also stopped the editor from trapping Tab.
   */
  function focusEditor() {
    configEditorRef.current?.focus();
  }

  /**
   * The results equivalent: the tab strip is the first thing worth acting on
   * there, and a focused tab announces which one is selected. This is the "take
   * me to the results" gesture — it scrolls the column to the top of the
   * window, which is the point of it. `focusTab` below is the half without the
   * scroll, for the gestures that only meant to change tabs.
   *
   * `ticket` is passed in by the one caller whose gesture is older than this
   * call: ⌘⇧⏎ arms the landing and the run commits it seconds later, so it is
   * the press that has to be judged, not the commit. The immediate callers (the
   * skip link, the `r` key) take their ticket here and land on the same frame,
   * where nothing can have happened yet — they carry one only for the first
   * run, when the strip is still a download away.
   */
  function focusResults(ticket: LandingTicket = landing.arm()) {
    // The results half is a lazy chunk (031), so on the FIRST run neither the
    // column nor its tab strip exists yet when ⌘⇧⏎ asks for them — hence the
    // wait, and hence the fallback: once the budget is spent, land on the bare
    // column rather than nowhere, because a chunk that never arrives is a
    // failed run, not a focus problem. Looks on THIS frame first, so the
    // ordinary case (a strip that already exists) lands without a flicker.
    landing.whenReady({
      ticket,
      find: () => resultsColRef.current?.querySelector<HTMLElement>(SELECTED_RESULTS_TAB) ?? null,
      land: (selectedTab) => {
        const column = resultsColRef.current;
        if (!column) {
          return;
        }
        column.scrollIntoView(motionScrollOptions("start"));
        (selectedTab ?? column).focus({ preventScroll: true });
      },
      // 600 ms: the chunk fetch plus React's ~300 ms suspended-fallback reveal
      // (the field's doc in `use-focus-landing.ts` — on a machine fast enough
      // to commit the result before the chunk resolves, the strip enters the
      // DOM only when that reveal fires).
      budgetMs: 600,
      thisFrame: true,
    });
  }

  /**
   * Roadmap 068: focus one NAMED tab, without moving the page. The digit jump
   * and the apply-fix landing both switch tabs and want focus to follow the
   * switch — but neither asked to be taken anywhere: on a side-by-side viewport
   * both columns are already fully visible, and `focusResults`' scroll would
   * push the config the user is reading off the top of the screen for a
   * keystroke that only meant "show me tab 3". The strip is scrolled only when
   * it is genuinely off screen, since focus landing somewhere invisible is the
   * one thing worse than a scroll nobody asked for.
   *
   * The button is found by `data-tab`, not by `aria-selected`, so this does not
   * depend on the selection having committed — but it still starts on the next
   * frame, because a tab that announces itself before the commit announces the
   * selection it is about to lose. Same lazy-chunk retry budget as
   * `focusResults`, and the same reason to give up rather than spin.
   *
   * And it stands down if the user has moved on in the meantime (the ticket —
   * see `landingWanted`): `applyErrorFix` calls this after an AWAITED re-run, so
   * the poll can start a second after the click, by which time a keyboard user
   * has routinely Tabbed on or clicked into the editor. A landing that arrives
   * late has no business overruling that. A newer landing is the exception it
   * DOES yield to rather than fight: two digit keys inside one frame are one
   * gesture chain, and the strip must end up selecting the tab that focus is on.
   *
   * Which is why the ticket is a PARAMETER (eighth review). Arming it in here
   * made the gesture "whatever was going on when the poll started", and for the
   * caller that waits a whole run that is the wrong moment by seconds: click
   * Apply fix, click into the editor while it resolves, and the ticket's `from`
   * was the editor the user had just moved to, so `landingWanted` saw nobody
   * move and yanked focus out onto the Problems tab. Callers that land
   * immediately keep the default and are unaffected; the one that waits arms
   * before its `await`, the way ⌘⇧⏎ always did.
   *
   * It does NOT ask whether the jump displaced the focus it is taking, the way
   * `landOnPresetNode` does: both callers are a request to be taken somewhere
   * (a digit key names a tab; applying a fix asks "did the error go away?"),
   * not a request to be shown something.
   */
  function focusTab(id: ResultsTabId, ticket: LandingTicket = landing.arm()) {
    landing.whenReady({
      ticket,
      find: () => resultsColRef.current?.querySelector<HTMLElement>(tabButtonSelector(id)) ?? null,
      land: (button) => {
        if (!button) {
          // The strip never appeared inside the budget. Rare but reachable: the
          // results half is a lazy chunk (031), the digit keys go live the
          // moment a result exists, and on a first run that chunk can still be
          // downloading. Land on the column (`tabIndex={-1}`), the same fallback
          // and the same reason as `focusResults`: every caller here has just
          // switched tabs, and for the two whose activator lived in the panel
          // that switch marked `hidden` (applying a fix, a preset cross-link)
          // "no landing" means focus dropped on `<body>`, with the user's next
          // Tab restarting at the top of the document. No scroll: this landing
          // moves the page only when its target is off screen, and it has no
          // target.
          resultsColRef.current?.focus({ preventScroll: true });
          return;
        }
        button.focus({ preventScroll: true });
        const box = button.getBoundingClientRect();
        if (box.top < 0 || box.bottom > window.innerHeight) {
          button.scrollIntoView(motionScrollOptions("nearest"));
        }
      },
      // Same budget and same reason as `focusResults`: the digit keys go live
      // the moment a result exists, which on a first run can be before the
      // lazy strip has been revealed.
      budgetMs: 600,
      thisFrame: false,
    });
  }

  /**
   * Roadmap 068: the preset tree's half of "every cross-link focuses its
   * target" (App's `selectPresetNode` is the caller). It waits longer than the
   * other landings because the row takes three commits to exist: the tab
   * switch, the ancestor expansion the new selection triggers, and the
   * windowed list (011) scrolling the row into its rendered slice. Until all
   * three have happened there is no element to focus at all — which is also
   * why this asks the DOM for "the selected row" rather than being handed one.
   *
   * The row's name IS a button, so nothing needs `tabIndex={-1}` here. When the
   * node never appears — a filter is applied, the flat list has no matching row
   * — the budget runs out and a landing that is taking focus (see below) falls
   * back to the Presets TAB. It
   * cannot fall back to "where the user left it": the chip they activated was
   * inside a panel `jumpToTab("presets")` marked `hidden` in the same commit, so
   * that place stopped existing half a second ago and the focus with it. The tab
   * is where `applyErrorFix` lands for the same reason — a real control, naming
   * where you are, at the top of the panel's tab order.
   *
   * The 068 review split the landing in two, because its three activators do
   * not all displace the focus they would be taking (`jumpDisplacedFocus`): the
   * SHOWING half — scroll and flash — is what every activator asked for, while
   * the FOCUS half is only for the ones whose own home the tab switch just hid.
   * Spelled out rather than `landOnTarget`, which bundles all three together.
   */
  function landOnPresetNode() {
    // Half a second is long enough for the user to have moved on; if they have,
    // `whenReady` never calls this back — and not even the scroll is welcome
    // then (068 review: a page that scrolls and flashes half a second after a
    // click on some unrelated prose).
    const ticket = landing.arm();
    landing.whenReady({
      ticket,
      find: () => resultsColRef.current?.querySelector<HTMLElement>(SELECTED_PRESET_ROW) ?? null,
      land: (row) => {
        const takeFocus = landing.displaced(ticket);
        if (!row) {
          if (takeFocus) {
            // The SAME ticket: this is still the one gesture the user made, and
            // arming a second one here would only make this landing outrank
            // itself (`armSeq`).
            focusTab("presets", ticket);
          }
          return;
        }
        // "nearest", not "center": the tree already scrolled its own box to the
        // row, so this is only about the card being on the page.
        row.scrollIntoView(motionScrollOptions("nearest"));
        flashTarget(row);
        if (takeFocus) {
          row.focus({ preventScroll: true });
        }
      },
      budgetMs: 500,
      thisFrame: false,
    });
  }

  function skipToConfig(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    focusEditor();
  }

  function skipToResults(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    focusResults();
  }

  /**
   * Roadmap 068 tier 1. Bare `e` / `r` because the modified space is a
   * minefield (⌘⇧E is Firefox's network panel, ⌘⇧C/I/J are devtools) while
   * single letters are free — and `useShortcut` refuses to fire a bare key
   * while the user is typing, which includes a focused `<select>`.
   *
   * Everything here is inert while the shortcut sheet is open, `keysLive`
   * being declared above the first binding so it cannot be forgotten.
   */
  useShortcut(FOCUS_EDITOR_SHORTCUT, focusEditor, { enabled: keysLive });
  useShortcut(FOCUS_RESULTS_SHORTCUT, () => focusResults(), {
    enabled: keysLive && Boolean(result),
  });
  useShortcut(HELP_SHORTCUT, showShortcuts, { enabled: keysLive });

  /**
   * Roadmap 068: `⌘⇧⏎`'s landing, deferred to the commit the run itself
   * produces. Focusing in the microtask right after `await onRun(…)` looked
   * right and was not: React has not committed that run's own `setTab` yet, so
   * on every re-run the "selected" tab the DOM still shows is the one from
   * BEFORE the run — focus ended up on a button that a moment later was no
   * longer `aria-selected` (a screen reader announcing a panel that is now
   * hidden, and the strip's arrows moving from somewhere else entirely).
   * `focusResults`' retry budget is no help there: it is spent only when there
   * is no selected tab at all, and there always is one.
   *
   * ONE ticket, and it is the NEWEST press's — not a flag, and no longer a queue
   * consumed one per commit.
   *
   * A flag was the first shape, and a review found what breaks it: press ⌘⇧⏎ on
   * a config whose run will fail, fix it, press again while the first is still
   * resolving, and the failed run cleared the flag its successor was relying on,
   * so the second press silently degraded to a plain run. What that needed was
   * IDENTITY — a run that never commits may withdraw its own request and no
   * other — and the queue supplied it by carrying one ticket per press.
   *
   * The queue's other half — pairing the OLDEST ticket with the next commit —
   * is gone, and the shape it left behind is the right one on its own terms.
   * Position was never load-bearing: `landingWanted` rejects any ticket that is
   * not the newest landing armed (`armSeq`), so an older one in the queue could
   * only ever be consumed and thrown away, and pairing by position merely
   * decided WHICH commit threw it away. Keeping only the newest says that
   * outright; the identity check that mattered survives as `=== ticket` below.
   */
  const pendingResultLanding = useRef<LandingTicket | null>(null);
  // The 032 latest-ref idiom, for the reason the dependency list below spells
  // out: `focusResults` is redeclared every render, and an effect that depended
  // on it would consume a pending landing on every render instead of on the
  // commit the run produced.
  const focusResultsFnRef = useLatestRef(focusResults);
  useEffect(() => {
    const ticket = pendingResultLanding.current;
    if (ticket) {
      pendingResultLanding.current = null;
      focusResultsFnRef.current(ticket);
    }
    // `result` alone IS the run's commit: `executeRun` dispatches `setResult`
    // and the `setTab` beside it from the same continuation, so React commits
    // them together and there is no state in between to wait for. `tab` was in
    // this list too, which made ANY tab change consume the request — press
    // ⌘⇧⏎, then a digit key or a tab while the engine was still resolving, and
    // the landing fired against the run BEFORE it and was already spent by the
    // time the one it belonged to committed.
  }, [result, focusResultsFnRef]);

  /**
   * `⌘⇧⏎` — run AND go read it. Plain ⌘⏎ deliberately leaves focus alone, so
   * this is the explicit "take me there" variant; the focus move waits for the
   * run to actually produce a result.
   *
   * Where the line is (068 review), since this chord is the one gesture that
   * asks to be taken somewhere it cannot go for seconds: **waiting is not
   * moving on, typing is.** A user who pressed it and watched the spinner still
   * wants the results when they arrive, caret in the editor and all — that IS
   * what they asked for, and standing down would make the chord's whole
   * difference from ⌘⏎ evaporate on a cold network. A user who has typed a
   * character since has plainly gone back to editing, and the results now
   * describe the text as it was before that character. So the ticket taken here
   * is judged by `landingWanted`, whose typing test reads `input` events rather
   * than focus — the caret never moved, which is exactly why nothing else can
   * see it.
   */
  useShortcut(
    RUN_AND_READ_SHORTCUT,
    () => {
      // Armed for the next result to COMMIT, which — if a run was already in
      // flight when this was pressed — is that run's rather than this one's.
      // Deliberate: both commits land in the same place, this chord's own run
      // arrives there a moment later, and the alternative is the swallowed
      // keypress `onRun` was just cured of.
      const ticket = landing.arm();
      pendingResultLanding.current = ticket;
      void (async () => {
        const traceResult = await runFromGesture();
        if (!traceResult && pendingResultLanding.current === ticket) {
          // This run will never commit, so its request has to go — otherwise it
          // fires on whatever run comes next. Only if the outstanding request is
          // still THIS press's: `onRun` refuses a run whose layers would not
          // parse (`blockedByLayerErrors`) and returns null synchronously, ahead
          // of everything already queued, so press ⌘⇧⏎, break the global-config
          // JSON while it resolves, press it again, and clearing unconditionally
          // would cancel the SECOND press's landing on the first press's
          // failure.
          pendingResultLanding.current = null;
        }
      })();
    },
    // Ungated for the same reason as ⌘⏎ above: a chord that silently declines
    // is the defect, not the fix.
    { enabled: keysLive },
  );

  /** `1`–`5` — straight to that results tab, by position in the strip. */
  useTabDigits(
    resultsTabs.length,
    (index) => {
      const target = resultsTabs[index];
      if (!target) {
        return;
      }
      setTab(target.id);
      focusTab(target.id);
    },
    { enabled: keysLive && Boolean(result) },
  );

  return {
    shortcutSheetOpen,
    showShortcuts,
    hideShortcuts,
    keysLive,
    landing,
    focusEditor,
    focusResults,
    focusTab,
    landOnPresetNode,
    skipToConfig,
    skipToResults,
    gestureWantsResultsLanding,
  };
}
