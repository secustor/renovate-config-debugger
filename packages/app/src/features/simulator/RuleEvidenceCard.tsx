import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MergedKey } from "@renovate-config-debugger/engine";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { type AnchorRect, anchoredCardStyle, anchorRectOf } from "@/lib/anchored-card";
import { ESCAPE_PRIORITY, modalKeyboardOwned } from "@/lib/escape-stack";
import { tookFocus } from "@/lib/focus-restore";
import { useEscapeLayer } from "@/hooks/use-escape-layer";
import { ClauseGrid } from "./ClauseGrid";
import { RULE_POP_CLASS, RULE_POP_SELECTOR } from "./rule-pop-dom";
import { ruleAppliedMarkdown, ruleVerdictLabel, writeMark } from "./rule-format";
import type { RuleEvidence, RuleWrite } from "./rule-evidence";
import { WriteRow } from "./WriteRow";

/**
 * Roadmap 054 (variant A), layer 3: the second — and last — disclosure level.
 * A thread names the rules whose values it beat; clicking one of those
 * references opens THIS card, which answers the only question the thread
 * leaves open about a losing rule: what else did it do? Its clause evidence,
 * where it merged, and a per-outcome digest of its writes — the ones that
 * survived plain, the ones a later stop took away struck through, in the same
 * grammar the threads use for a lost value.
 *
 * The card is navigation-free (its footer link is the exception, and that is a
 * jump, not another fold), so it is light-dismiss: Escape or a click outside
 * closes it and focus goes back to the reference that opened it whenever that
 * reference can still take focus — and so does the results panel its anchor
 * lives in going `hidden`, which is the third light dismiss and the one with no
 * event behind it (see `RuleEvidenceAnchor`). Opening ANOTHER reference is the
 * fourth: one card is up at a time, whichever way it was opened (`openCard`).
 */

/** The card's preferred width — the mockup's 36rem, in px, clamped to the
 *  viewport by `anchoredCardStyle`. */
const CARD_WIDTH = 576;
/** Roughly the card's own height: below this much room, it flips above. */
const CARD_FLIP_MARGIN = 320;

/**
 * The tab whose panel is now showing — where focus goes when this card's own
 * anchor can no longer take it back (see `close`). Not the strip's private
 * `data-tab` (`lib/results-tab-dom.ts` owns that one, and everything reading it
 * has a tab in mind already): the question here is which tab is SELECTED, and
 * `aria-selected` is the answer a `role="tablist"` publishes and is obliged to
 * keep true.
 */
const SELECTED_TAB_SELECTOR = '[role="tab"][aria-selected="true"]';

/**
 * The card that is open, as its own `close`. At most one exists, ever.
 *
 * Roadmap 068 review: two could stand at once, and only for a keyboard user.
 * Light dismiss is a document `mousedown` listener, so opening a second
 * reference with the pointer closes the first on the way past; keyboard
 * activation fires no `mousedown` at all, so Enter on `packageRules[0]`'s
 * reference, Shift+Tab, Enter on `packageRules[1]` left both cards up. The
 * ladder pops ONE layer per press by design, so Escape then closed the card the
 * reader was looking at and left the other one registered — and a registered
 * `popover` layer is what makes `overlayKeyboardOwned()` true, so `e`, `r`,
 * `1`–`7` and Home/End all stayed dead until a second press, with the stale
 * card as the only clue. That is the damage the anchor's `hidden` observer
 * below was added to prevent, arrived at by a second route.
 *
 * Fixed here rather than by teaching Escape to pop a whole RANK: one press, one
 * layer is the ladder's contract everywhere else, and two cards is not a state
 * this design has a meaning for — the card is the last disclosure level about
 * ONE losing rule, and the pointer could never produce two of them. Evicting
 * the previous card makes both input modalities the same state, which is also
 * how the glossary keeps a single hover card (`activeHide` in
 * `components/glossary.tsx`).
 */
let openCard: (() => void) | null = null;

/** One key the rule merged, as the shared write row (054 layer 7). A write that
 *  lost keeps this step's add tint — it IS what this step added — and is struck
 *  through, naming the stop that took it away; that pairing is the whole reason
 *  the card exists. */
function RuleWriteRow({ write }: { write: RuleWrite }) {
  return (
    <WriteRow
      name={write.key}
      mark={writeMark(write.hadBefore, write.hadAfter)}
      before={write.hadBefore ? { json: write.before } : undefined}
      after={write.hadAfter ? { json: write.after } : { text: "removed" }}
      struck={!write.survived}
      note={write.survived ? undefined : `· ⊘ overridden in ${write.overriddenAtLabel}`}
    />
  );
}

/**
 * The digest's writes as the engine's own `MergedKey`, whose optional
 * `before`/`after` say exactly what a `RuleWrite`'s presence flags do — so the
 * card exports through the SAME markdown builder the matched-rules drawer uses
 * (roadmap 018), rather than a second rendering of the same rows.
 */
function asMergedKeys(writes: RuleWrite[]): MergedKey[] {
  return writes.map((write) => ({
    key: write.key,
    ...(write.hadBefore ? { before: write.before } : {}),
    ...(write.hadAfter ? { after: write.after } : {}),
  }));
}

/** The rule's name, its verdict, where it came from — and, when it wrote
 *  anything, the copy-as-markdown export of what it wrote. */
function RuleEvidenceHead({
  evidence,
  onSelectPreset,
}: {
  evidence: RuleEvidence;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const verdictLabel = evidence.verdict
    ? ruleVerdictLabel({ verdict: evidence.verdict, clauses: evidence.clauses })
    : undefined;
  const verdict = verdictLabel ? ` — ${verdictLabel}` : "";
  return (
    <p className="sim-rule-pop-head">
      <code
        className="sim-rule-pop-id"
        title="0-based index — the same numbering Renovate's own validator messages use; the last of N rules is packageRules[N−1]"
      >
        packageRules[{evidence.ruleIndex}]
      </code>
      {verdictLabel && evidence.verdict ? (
        <span className={`badge sim-verdict verdict-${evidence.verdict}`}>{verdictLabel}</span>
      ) : null}
      {evidence.layer ? (
        <ProvenanceChip layer={evidence.layer} onSelectPreset={onSelectPreset} />
      ) : null}
      {evidence.writes.length > 0 ? (
        <CopyMarkdownButton
          className="inline"
          header={`\`packageRules[${evidence.ruleIndex}]\`${verdict}${evidence.stopLabel ? ` — merged in ${evidence.stopLabel}` : ""}`}
          code={ruleAppliedMarkdown(asMergedKeys(evidence.writes))}
        />
      ) : null}
    </p>
  );
}

/** "merged in step N — X writes, Y survived": the counts the digest below
 *  then spells out one row at a time. */
function RuleEvidenceSummary({ evidence }: { evidence: RuleEvidence }) {
  if (evidence.stopLabel === undefined) {
    return <p className="sim-rule-pop-line">This rule merged nothing into the config.</p>;
  }
  const { writes, survivedCount } = evidence;
  return (
    <p className="sim-rule-pop-line">
      merged in {evidence.stopLabel} — {writes.length} write{writes.length === 1 ? "" : "s"},{" "}
      {survivedCount} survived
    </p>
  );
}

function RuleEvidenceBody({
  evidence,
  onSelectPreset,
}: {
  evidence: RuleEvidence;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <>
      <RuleEvidenceHead evidence={evidence} onSelectPreset={onSelectPreset} />
      {evidence.clauses.length > 0 ? <ClauseGrid clauses={evidence.clauses} /> : null}
      <RuleEvidenceSummary evidence={evidence} />
      <div className="kv sim-writes">
        {evidence.writes.map((write) => (
          <RuleWriteRow key={write.key} write={write} />
        ))}
      </div>
    </>
  );
}

/**
 * The popover itself: portalled to `<body>` on the app's existing hover-card
 * plane (`.option-card` — raised surface, popover shadow, viewport-clamped
 * placement), because an in-place card would be clipped by the thread's own
 * box and would re-anchor to any ancestor that gains containment (035).
 */
export function RuleEvidenceCard({
  evidence,
  anchor,
  onClose,
  onOpenRule,
  onSelectPreset,
}: {
  evidence: RuleEvidence;
  anchor: AnchorRect;
  onClose: () => void;
  /** The footer's jump into the (demoted) matched-rules drawer. */
  onOpenRule?: (ruleIndex: number) => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  // The card is opened by a click, so focus belongs inside it: its footer link
  // is then the next thing Tab reaches, and Escape hands focus back.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);
  return createPortal(
    <div
      className={`option-card ${RULE_POP_CLASS}`}
      role="dialog"
      aria-label={`packageRules[${evidence.ruleIndex}] — rule evidence`}
      tabIndex={-1}
      ref={cardRef}
      style={anchoredCardStyle(anchor, CARD_WIDTH, CARD_FLIP_MARGIN)}
    >
      <RuleEvidenceBody evidence={evidence} onSelectPreset={onSelectPreset} />
      <p className="sim-rule-pop-foot">
        <button
          type="button"
          className="sim-step-link"
          onClick={() => {
            onClose();
            onOpenRule?.(evidence.ruleIndex);
          }}
        >
          open in matched rules →
        </button>
      </p>
    </div>,
    document.body,
  );
}

/**
 * The `packageRules[N]` reference that opens the card. It owns the open state
 * and the light-dismiss listeners, because it is the one place that knows both
 * boxes: a pointer press inside EITHER the anchor or the card must not close
 * (otherwise the toggle would close and reopen on its own click).
 */
export function RuleEvidenceAnchor({
  ruleIndex,
  evidenceFor,
  onOpenRule,
  onSelectPreset,
}: {
  ruleIndex: number;
  evidenceFor: (ruleIndex: number) => RuleEvidence;
  onOpenRule?: (ruleIndex: number) => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const open = anchor !== null;

  // Closing takes the focus back to the reference that opened the card —
  // except when the click that dismissed it already moved focus somewhere the
  // user picked themselves. Never scrolls: focus is being restored, not given.
  //
  // Roadmap 068 review: "the anchor is still there" is not "the anchor can take
  // focus". The third light dismiss is the anchor's own results panel going
  // `hidden` (the observer below), and a `hidden` ancestor makes every control
  // under it unfocusable while leaving it mounted — so on exactly that dismissal
  // the restore was a no-op, the card unmounted a beat later, and focus fell to
  // `<body>`, where the user's next Tab restarts at the skip link. `tookFocus`
  // asks the honest form of the question (`lib/focus-restore.ts`).
  //
  // When the answer is no, the reader is looking at a different panel from the
  // one this card belonged to, and the tab that selects THAT panel is the
  // nearest thing still on screen worth landing on: their next Tab continues
  // into the panel they are actually on. Silent when there is no strip to find —
  // leaving focus alone is honest, and guessing further is what
  // `ShortcutSheet`'s own restore stops doing at a landmark.
  const close = useCallback(() => {
    const button = buttonRef.current;
    const restore = document.activeElement?.closest(RULE_POP_SELECTOR) != null;
    setAnchor(null);
    if (!restore || !button || tookFocus(button)) {
      return;
    }
    document.querySelector<HTMLElement>(SELECTED_TAB_SELECTOR)?.focus({ preventScroll: true });
  }, []);

  // Roadmap 068: Escape goes through the layer stack — this card is the
  // topmost thing on screen while it is open, and its RANK is what says so
  // (it used to be the return pill querying the DOM for this card's class).
  // Not mount order: a jump out of the thread under this card registers the
  // return pill after it, and the card must still win.
  useEscapeLayer(open, close, ESCAPE_PRIORITY.popover);

  useEffect(() => {
    if (!open) {
      return;
    }
    // The one open card is this one, until it closes or another reference takes
    // the slot (see `openCard`, and the eviction in the button's `onClick`).
    openCard = close;
    function onPointerDown(e: MouseEvent) {
      // Roadmap 068 review: a modal owns the press, the same way it owns the
      // key. `showModal()` makes the page behind the dialog inert, so nothing
      // under this card can be clicked while the `?` sheet is up — but `inert`
      // does not reach a DOCUMENT-level listener any more than it reaches a
      // key one, and a press aimed at the sheet (a row of it, or the backdrop
      // that dismisses it) bubbles past here on its way to the document. Both
      // "inside" tests below then say no and the card the user left open goes
      // with the sheet. Reachable on purpose: `HELP_SHORTCUT` is the one
      // binding that fires under an overlay (`firesUnderOverlay`), so `?` over
      // an open evidence card is a supported gesture, not a corner.
      if (modalKeyboardOwned()) {
        return;
      }
      const target = e.target;
      if (target instanceof Node && wrapRef.current?.contains(target)) {
        return;
      }
      // The card lives in a portal, so "inside" is not a DOM-ancestor test
      // against the anchor — ask the card's own element.
      if (target instanceof Element && target.closest(RULE_POP_SELECTOR)) {
        return;
      }
      close();
    }
    // Re-anchor rather than hide: the card is click-opened, so it has to
    // survive the scroll that reading it may cause. Capture, to also catch
    // scrolling inside the page's own scroll containers.
    function reposition() {
      if (buttonRef.current) {
        setAnchor(anchorRectOf(buttonRef.current));
      }
    }
    // Roadmap 068 review: the card must not outlive the panel its anchor lives
    // in. `ResultsPanel` switches results tabs by toggling `hidden` on panels
    // that all stay mounted, so a tab switch unmounts nothing here, and the
    // card — portalled to `<body>` — is not covered by the `hidden` its anchor
    // now sits under. Left standing it floats over an unrelated panel and, the
    // damage the eye does not catch, keeps `overlayKeyboardOwned()` true for as
    // long as it stands: every bare key (`e`, `r`, `1`–`7`) and Home/End page
    // scroll off, with a card over the wrong panel as the only clue.
    //
    // Closing on the ANCHOR going away, rather than on focus leaving the card,
    // is what settles the whole class in one rule — every way the panel can be
    // hidden is the same event to it, and they have no keystroke in common: the
    // tab strip's arrows and Enter, a click on a tab, `1`–`7`. One of them does
    // not even take focus out of the card, so a focus-out dismiss would have
    // gone on missing it: this card's own provenance chip jumping to the
    // Presets tab.
    //
    // (⌘⏎ from inside the card was a second such case when this was written.
    // It no longer is: `gestureWantsResultsLanding()` now asks whether the
    // gesture came from the CONFIG COLUMN, so a run requested from the card
    // keeps the tab and never hides this anchor. The observer is still what
    // covers the rest.)
    //
    // An observer because there is no event for it: the panel's box stops
    // existing, which fires no scroll, no resize and no blur (focus is in the
    // portal, not in the panel) — and a re-render is not something to fall back
    // on either, since this sits inside the memoised `RuleSimulator` and a tab
    // switch changes none of its props. Attributes only, filtered
    // to `hidden` — a tab switch delivers the two records that matter, and the
    // callback asks one `closest`. That question is the one `jumpDisplacedFocus`
    // already asks about a jump's activator (`lib/focus-landing.ts`).
    function closeIfAnchorHidden() {
      if (buttonRef.current?.closest("[hidden]")) {
        close();
      }
    }
    const anchorWatch = new MutationObserver(closeIfAnchorHidden);
    anchorWatch.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", reposition, { capture: true, passive: true });
    window.addEventListener("resize", reposition, { passive: true });
    return () => {
      // Only ever this instance's own entry: a card evicted by another one has
      // already had the slot taken from it, and clearing it here would drop the
      // incoming card's registration instead.
      if (openCard === close) {
        openCard = null;
      }
      anchorWatch.disconnect();
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
    };
  }, [open, close]);

  return (
    <span className="sim-rule-pop-anchor" ref={wrapRef}>
      <button
        type="button"
        className="sim-rule-pop-link"
        aria-haspopup="dialog"
        aria-expanded={open}
        ref={buttonRef}
        onClick={() => {
          const button = buttonRef.current;
          if (open || !button) {
            setAnchor(null);
            return;
          }
          // Evicted from the CLICK, not from the effect that registers the slot:
          // focus is still on this reference here, so the outgoing card's own
          // restore stands down (`close` restores only from inside a card). From
          // an effect this would run after the incoming card has taken focus —
          // child effects first — and the outgoing card would pull that focus
          // onto its own anchor.
          openCard?.();
          setAnchor(anchorRectOf(button));
        }}
      >
        packageRules[{ruleIndex}]
      </button>
      {anchor ? (
        <RuleEvidenceCard
          evidence={evidenceFor(ruleIndex)}
          anchor={anchor}
          onClose={close}
          onOpenRule={onOpenRule}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
    </span>
  );
}
