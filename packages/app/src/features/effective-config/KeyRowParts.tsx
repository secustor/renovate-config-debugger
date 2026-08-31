import type { KeyProvenance, RuleAttribution } from "@renovate-config-debugger/engine";
import { BlameLedger } from "./BlameLedger";
import { DeferredRuleProvenance, Step } from "./CascadeStack";
import type { DescriptionLedger } from "./description-ledger";
import { ExplainedText } from "@/components/glossary";
import { GLOSSARY } from "@/data/glossary-data";
import { layerNodeKey } from "@/lib/provenance-layer";
import type { MultiContribBadge } from "@/lib/effective-tally";
import type { RowNote } from "./row-notes";
import { winningStep } from "./decider-groups";

/**
 * Roadmap 092: the two parts of an effective-config row that are more than a
 * string — the note cell's rich rendering, and the block an open row reveals.
 * They are what `effective-rows.tsx` hands the standard data table as a row's
 * `cellNodes` and `detail`, and they live in a module of their own because a
 * file that exports components may export nothing else
 * (`react/only-export-components`).
 */

const MULTI_BADGE_GLOSSARY: Record<MultiContribBadge, keyof typeof GLOSSARY> = {
  overridden: "keyOverridden",
  appended: "keyAppended",
  merged: "keyMerged",
};

/**
 * The note cell, when the note has more to give than its words: the glossary
 * card the one-word badge used to carry (016/054) on the notes that are prose
 * for a merge behaviour, and the warn tone on the one thing in this column a
 * reader can act on — some other layer already set exactly this value.
 */
export function NoteCell({ note }: { note: RowNote }) {
  if (note.badge) {
    return (
      <ExplainedText
        entry={GLOSSARY[MULTI_BADGE_GLOSSARY[note.badge]]}
        className="prov-row-note explained"
      >
        {note.text}
      </ExplainedText>
    );
  }
  return <span className={note.warn ? "prov-row-note warn" : "prov-row-note"}>{note.text}</span>;
}

/**
 * The expanded row's cascade — WINNER FIRST (082): the design reverses the
 * authored stack so the `✓ final` card leads and the earliest layer (usually
 * the Renovate default) is last, which is the order the question is asked in.
 * No-op steps stay in the stack rather than being filtered out: "the default
 * was false and a preset set it to true" is the answer even when the default
 * changed nothing, and dropping those cards left a two-card cascade claiming to
 * be the whole story.
 */
function KeyCascade({
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
  return (
    <>
      {/* One card is not a cascade: a single-step chain — every defaults row,
          and a key only the repo ever set — shows its card without a heading
          claiming there is a stack to read. */}
      {entry.chain.length > 1 ? (
        <div className="prov-chain-title">The cascade, bottom to top</div>
      ) : null}
      {/* Each layer contributes at most one step to a key's chain, so the
          layer's NODE identity is a genuine key here (roadmap 041) — and
          the rows are rebuilt per run, so per-run node ids are fine. */}
      {entry.chain.toReversed().map((step) => (
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

/**
 * What the open row draws. 082 (GAP-17): the two bodies are independent — the
 * `description` row has both, the per-line ledger saying who wrote each
 * sentence and the cascade saying how the array was assembled — and gating them
 * against each other hid the second answer on the one row that needs both.
 */
export function KeyDetail({
  entry,
  rules,
  ruleAttribution,
  ledger,
  onSelectPreset,
}: {
  entry: KeyProvenance;
  rules: unknown[] | null;
  /** Only meaningful for the `packageRules` row. */
  ruleAttribution?: RuleAttribution[] | null;
  /** Roadmap 069: only for the `description` row; null everywhere else, and
   *  when the attribution is unavailable. */
  ledger: DescriptionLedger | null;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <>
      {ledger ? <BlameLedger ledger={ledger} onSelectPreset={onSelectPreset} /> : null}
      {entry.chain.length > 0 ? (
        <KeyCascade
          entry={entry}
          rules={rules}
          ruleAttribution={ruleAttribution}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
    </>
  );
}
