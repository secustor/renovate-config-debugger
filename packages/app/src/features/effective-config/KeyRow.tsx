import type { KeyProvenance, RuleAttribution } from "@renovate-config-debugger/engine";
import { BlameLedger } from "./BlameLedger";
import { Caret } from "@/components/Caret";
import { DeferredRuleProvenance, Step } from "./CascadeStack";
import { type DescriptionLedger, ledgerPreviewText, ledgerWriterText } from "./description-ledger";
import { ExplainedText } from "@/components/glossary";
import { GLOSSARY } from "@/data/glossary-data";
import type { MultiContribBadge } from "@/lib/effective-tally";
import { layerNodeKey } from "@/lib/provenance-layer";
import { OptionKey } from "@/components/option-docs";
import { type RowNote, rowNote } from "./row-notes";
import { RuleFramingText } from "@/components/rule-framing";
import { valuePreview } from "@/lib/value-preview";
import { winningStep } from "./decider-groups";

const MULTI_BADGE_GLOSSARY: Record<MultiContribBadge, keyof typeof GLOSSARY> = {
  overridden: "keyOverridden",
  appended: "keyAppended",
  merged: "keyMerged",
};

/** The key cell of a ledger row: the disclosure caret and the option name,
 *  with its docs hover card intact (`OptionKey` is a span, never a button, so
 *  it nests inside the row's toggle — the same arrangement `ProvenanceChip`
 *  already has there; it is a focusable span, so it is a tab stop of its own
 *  inside that toggle, which is what makes the docs keyboard-reachable). Its
 *  own component so `KeyRow` keeps its cells one level from the row, exactly as
 *  the simulator's thread ledger does. */
function KeyRowKey({ name, expanded }: { name: string; expanded: boolean }) {
  return (
    <span className="prov-key-name">
      <Caret open={expanded} />
      <OptionKey name={name} flagUnknown />
    </span>
  );
}

/** The value cell: what the merged config ends up with — or, for the two rows
 *  whose value is a list, what that list is made of: how many rules came from
 *  where, or (069) how many description strings and how they start. */
function KeyRowPreview({
  entry,
  rules,
  ruleAttribution,
  ledger,
}: {
  entry: KeyProvenance;
  rules: unknown[] | null;
  ruleAttribution?: RuleAttribution[] | null;
  /** Only meaningful for the `description` row. */
  ledger?: DescriptionLedger | null;
}) {
  if (rules) {
    return (
      <span className="prov-key-preview">
        <RuleFramingText total={rules.length} attribution={ruleAttribution ?? null} />
      </span>
    );
  }
  return (
    <span className="prov-key-preview">
      {ledger ? ledgerPreviewText(ledger) : valuePreview(entry.finalValue)}
    </span>
  );
}

/**
 * The third cell — the design's note (082). It replaced two things: the winning
 * layer's chip, which repeated what the band header above the row already says,
 * and the one-word `overridden`/`appended` badge, which said less than the
 * sentence does. The glossary card the badge carried survives on the notes that
 * name a merge behaviour, so the 016/054 "this explains itself" affordance is
 * not lost with the word.
 */
function KeyRowNote({ note }: { note: RowNote | null }) {
  if (!note) {
    return <span className="prov-row-note" />;
  }
  if (!note.badge) {
    return <span className={`prov-row-note${note.warn ? " warn" : ""}`}>{note.text}</span>;
  }
  return (
    <ExplainedText
      entry={GLOSSARY[MULTI_BADGE_GLOSSARY[note.badge]]}
      className="prov-row-note explained"
    >
      {note.text}
    </ExplainedText>
  );
}

/**
 * The expanded row's cascade — WINNER FIRST (082): the design reverses the
 * authored stack so the `✓ final` card leads and the earliest layer (usually
 * the Renovate default) is last, which is the order the question is asked in.
 * No-op steps stay in the stack rather than being filtered out: "the default
 * was false and a preset set it to true" is the answer even when the default
 * changed nothing, and dropping those cards left a two-card cascade claiming to
 * be the whole story.
 *
 * Its own component since 069 gave the `description` row a ledger as well — and
 * the depth ratchet counts the two bodies inside `KeyRow` as one expression.
 */
function KeyRowChain({
  entry,
  rules,
  ruleAttribution,
  onSelectPreset,
}: {
  entry: KeyProvenance;
  rules: unknown[] | null;
  ruleAttribution?: RuleAttribution[] | null;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const winner = winningStep(entry);
  const steps = entry.chain.toReversed();
  return (
    <>
      <div className="prov-chain-title">The cascade, bottom to top</div>
      {/* Each layer contributes at most one step to a key's chain, so the
          layer's NODE identity is a genuine key here (roadmap 041) — and
          the rows are rebuilt per run, so per-run node ids are fine. */}
      {steps.map((step) => (
        <Step
          key={layerNodeKey(step.layer)}
          step={step}
          winning={step === winner}
          onSelectPreset={onSelectPreset}
        />
      ))}
      {rules && rules.length > 0 && ruleAttribution && ruleAttribution.length === rules.length ? (
        <DeferredRuleProvenance
          rules={rules}
          attribution={ruleAttribution}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
    </>
  );
}

export function KeyRow({
  entry,
  expanded,
  onToggle,
  onSelectPreset,
  ruleAttribution,
  ledger,
}: {
  entry: KeyProvenance;
  expanded: boolean;
  onToggle: () => void;
  onSelectPreset?: (nodeId: string) => void;
  /** Only meaningful for the `packageRules` row; undefined/unavailable elsewhere. */
  ruleAttribution?: RuleAttribution[] | null;
  /** Roadmap 069: only for the `description` row — null when the attribution
   *  is unavailable, in which case the row renders exactly as it always did. */
  ledger?: DescriptionLedger | null;
}) {
  const rules =
    entry.key === "packageRules" && Array.isArray(entry.finalValue) ? entry.finalValue : null;
  const note = rowNote(entry, ledger ? ledgerWriterText(ledger) : null);
  return (
    <div className="kv-row prov-row">
      <button
        type="button"
        className="kv-row prov-row-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <KeyRowKey name={entry.key} expanded={expanded} />
        <KeyRowPreview
          entry={entry}
          rules={rules}
          ruleAttribution={ruleAttribution}
          ledger={ledger}
        />
        <KeyRowNote note={note} />
      </button>
      {/* 082 (GAP-17): the two bodies are independent. The `description` row
          has both — the per-line ledger says who wrote each sentence, the
          cascade says how the array was assembled — and gating them against
          each other hid the second answer on the one row that needs both. */}
      {expanded ? (
        <div className="prov-detail">
          {ledger ? <BlameLedger ledger={ledger} onSelectPreset={onSelectPreset} /> : null}
          {entry.chain.length > 0 ? (
            <KeyRowChain
              entry={entry}
              rules={rules}
              ruleAttribution={ruleAttribution}
              onSelectPreset={onSelectPreset}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Roadmap 082 (GAP-6): a row of the defaults band. INERT by design — no caret,
 * no expansion, no cascade — because there is nothing to expand: exactly one
 * layer ever touched these keys, and it is the one the band is named after.
 * The caret slot is kept as an empty spacer so the option names still start on
 * the same edge as every other band's.
 *
 * The note column is deliberately empty. The artboard's per-option prose
 * ("when PRs are opened", "schedules use UTC") is mock copy for a mock config;
 * the run knows nothing of the sort, and the honest sentence about ALL of these
 * rows is the band's own footer.
 */
export function DefaultRow({ entry }: { entry: KeyProvenance }) {
  return (
    <div className="kv-row prov-row prov-row-default">
      <span className="prov-key-name">
        <Caret empty />
        <OptionKey name={entry.key} flagUnknown />
      </span>
      <code className="prov-key-preview">{valuePreview(entry.finalValue)}</code>
      <span className="prov-row-note" />
    </div>
  );
}
