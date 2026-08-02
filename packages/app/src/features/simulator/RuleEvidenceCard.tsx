import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MergedKey } from "@renovate-config-visualizer/engine";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { type AnchorRect, anchoredCardStyle, anchorRectOf } from "@/lib/anchored-card";
import { ClauseGrid } from "./ClauseGrid";
import { RULE_POP_CLASS, RULE_POP_SELECTOR } from "./rule-pop-dom";
import { ruleAppliedMarkdown, VERDICT_LABEL, writeMark } from "./rule-format";
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
 * closes it and focus goes back to the reference that opened it.
 */

/** The card's preferred width — the mockup's 36rem, in px, clamped to the
 *  viewport by `anchoredCardStyle`. */
const CARD_WIDTH = 576;
/** Roughly the card's own height: below this much room, it flips above. */
const CARD_FLIP_MARGIN = 320;

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
  const verdict = evidence.verdict ? ` — ${VERDICT_LABEL[evidence.verdict]}` : "";
  return (
    <p className="sim-rule-pop-head">
      <code className="sim-rule-pop-id">packageRules[{evidence.ruleIndex}]</code>
      {evidence.verdict ? (
        <span className={`badge sim-verdict verdict-${evidence.verdict}`}>
          {VERDICT_LABEL[evidence.verdict]}
        </span>
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
  const close = useCallback(() => {
    const restore = document.activeElement?.closest(RULE_POP_SELECTOR) != null;
    setAnchor(null);
    if (restore) {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
      }
    }
    function onPointerDown(e: MouseEvent) {
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
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", reposition, { capture: true, passive: true });
    window.addEventListener("resize", reposition, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
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
        onClick={() =>
          setAnchor(open || !buttonRef.current ? null : anchorRectOf(buttonRef.current))
        }
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
