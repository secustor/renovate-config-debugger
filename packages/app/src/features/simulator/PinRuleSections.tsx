import { type ReactNode, useState } from "react";
import { PresetName } from "@/components/PresetName";
import { nf } from "@/lib/format";
import { ClauseGrid } from "./ClauseGrid";
import type { PinFailedRule, PinMatchedRule, PinRuleRef } from "./pin-outcome";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { RuleDescriptionQuote } from "./RuleDescriptionQuote";
import { ruleRef } from "@/lib/rule-ref";

/**
 * The funnel's two named-rule sections (Proposal F / "Skip Reason Funnel"):
 * the rules that MATCHED — each expandable to "why it matched · what it
 * wrote" — and the reader's OWN rules that didn't, each expandable to the
 * matcher checklist that stopped it. Both wear the design's grammar: a mark,
 * a toned pill with the count, a framing sentence, and a colored rail down
 * the list.
 */

/** The two optional jumps a rule's evidence can offer — to the preset that
 *  declared it, or to the repo config that did. Exported because `PinCard`
 *  threads the same object down to these sections and so takes the same
 *  contract; it is stated once, here, where the links are actually rendered. */
export interface CrossLinks {
  onSelectPreset?: (nodeId: string) => void;
  onJumpToEditor?: (repoIndex: number) => void;
}

/** The pill tones (075). */
type SectionTone = "ok" | "accent" | "warn" | "muted";

/** The glyph tones. `accent` is deliberately NOT one: there is no `.mark-accent`
 *  style — the design colors an accent section's glyph red, so the "your rules"
 *  section wears a red ✗ beside an accent pill — so the map below translates it
 *  rather than emitting a class with no rule behind it. */
type MarkTone = "ok" | "warn" | "muted" | "error";

export function PinSectionHead({
  mark,
  tone,
  pill,
  text,
}: {
  mark: string;
  tone: SectionTone;
  pill: string;
  text: string;
}) {
  const glyphTone: MarkTone = tone === "accent" ? "error" : tone;
  return (
    <div className="pin-section-head">
      <span className={`pin-section-mark mark-${glyphTone}`} aria-hidden="true">
        {mark}
      </span>
      <span className={`pill pill-${tone}`}>{pill}</span>
      <span className="pin-section-text">{text}</span>
    </div>
  );
}

/** The row's lead: the `packageRules[N]` reference as the expand toggle, then
 *  the preset that declared the rule. The standard `PresetName` token (081),
 *  not `RuleRow`'s bare chip: "from ⟨X⟩" names a preset inside a sentence,
 *  where the chip answers which LAYER a value arrived through. */
function RuleRefLead({
  rule,
  expanded,
  onToggle,
  onSelectPreset,
}: {
  rule: PinRuleRef;
  expanded: boolean;
  onToggle: () => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const layer = rule.layer;
  return (
    <>
      <button type="button" className="pin-rule-index" aria-expanded={expanded} onClick={onToggle}>
        {ruleRef(rule.index)}
      </button>
      {layer?.kind === "preset" ? (
        <>
          <span className="pin-rule-from">from</span>
          <PresetName
            name={layer.name}
            nodeId={layer.nodeId}
            onClick={onSelectPreset ? () => onSelectPreset(layer.nodeId) : undefined}
          />
        </>
      ) : null}
    </>
  );
}

/** What the row calls the rule: the reader's own rule is theirs, a described
 *  rule speaks its author's first line, anything else gets the clause label. */
function ruleNote(rule: PinRuleRef, description: RuleDescriptionNote | undefined): string {
  if (rule.layer?.kind === "repo") {
    return "your rule";
  }
  const firstLine = description?.values[0];
  return firstLine ?? rule.label;
}

function EditorJumpLink({
  rule,
  onJumpToEditor,
}: {
  rule: PinRuleRef;
  onJumpToEditor?: (repoIndex: number) => void;
}) {
  if (rule.repoIndex === undefined || onJumpToEditor === undefined) {
    return null;
  }
  const repoIndex = rule.repoIndex;
  return (
    <button type="button" className="btn-quiet" onClick={() => onJumpToEditor(repoIndex)}>
      edit {ruleRef(repoIndex)} in your config →
    </button>
  );
}

function MatchedDetail({
  rule,
  description,
  onJumpToEditor,
}: {
  rule: PinMatchedRule;
  description: RuleDescriptionNote | undefined;
  onJumpToEditor?: (repoIndex: number) => void;
}) {
  return (
    <div className="pin-evidence">
      <p className="pin-evidence-title">Why it matched · what it wrote</p>
      <ClauseGrid clauses={rule.clauses} />
      {rule.writes.length > 0 ? (
        <pre className="pin-evidence-writes">
          {`{ ${rule.writes.map((w) => `"${w.key}": ${w.valueText}`).join(",\n  ")} }`}
        </pre>
      ) : null}
      {rule.conflictNote === undefined ? null : (
        <p className="pin-evidence-note">{rule.conflictNote}</p>
      )}
      {description ? <RuleDescriptionQuote note={description} /> : null}
      <EditorJumpLink rule={rule} onJumpToEditor={onJumpToEditor} />
    </div>
  );
}

/**
 * One expandable rule row: the reference lead, its note, an optional trailing
 * fact, and the evidence the caret reveals.
 *
 * `MatchedRow` and `FailedRow` were the same nine lines of skeleton differing
 * only in their small print — one extra span, and what the body is (structure
 * review, finding 21). The disclosure state and the markup are shared here;
 * each caller keeps only what it actually says.
 *
 * `body` is a plain node. An earlier draft made it a function to avoid "paying"
 * for collapsed rows, which was simply wrong: JSX builds a descriptor, not a
 * render, so the child component never runs until it is mounted. The function
 * form also read as a component definition to `no-unstable-nested-components`.
 *
 * `RuleRow` (the simulator's own list) deliberately does NOT use this. It looks
 * similar and is not: it carries an id, a tabIndex and a flash class because a
 * cross-link LANDS on it, and folding those affordances in here would push a
 * concern that belongs to one caller into all of them.
 */
function PinDisclosureRow({
  rule,
  note,
  trailing,
  defaultExpanded,
  onSelectPreset,
  body,
}: {
  rule: PinRuleRef;
  note: string;
  /** The right-hand fact, when the row has one (matched rows say what they wrote). */
  trailing?: string;
  defaultExpanded: boolean;
  onSelectPreset?: (nodeId: string) => void;
  body: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div>
      <div className="pin-rule-line">
        <RuleRefLead
          rule={rule}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
          onSelectPreset={onSelectPreset}
        />
        <span className="pin-rule-label">{note}</span>
        {trailing === undefined ? null : <span className="pin-rule-wrote">{trailing}</span>}
      </div>
      {expanded ? body : null}
    </div>
  );
}

function MatchedRow({
  rule,
  description,
  links,
}: {
  rule: PinMatchedRule;
  description: RuleDescriptionNote | undefined;
  links: CrossLinks;
}) {
  return (
    <PinDisclosureRow
      rule={rule}
      note={ruleNote(rule, description)}
      trailing={rule.wroteSummary}
      defaultExpanded={false}
      onSelectPreset={links.onSelectPreset}
      body={
        <MatchedDetail
          rule={rule}
          description={description}
          onJumpToEditor={links.onJumpToEditor}
        />
      }
    />
  );
}

export function PinMatchedSection({
  rules,
  descriptions,
  links,
}: {
  rules: PinMatchedRule[];
  descriptions: Map<number, RuleDescriptionNote>;
  links: CrossLinks;
}) {
  if (rules.length === 0) {
    return (
      <PinSectionHead
        mark="⚠"
        tone="warn"
        pill="0 matched"
        text="no rule wrote to this update — standalone PR with Renovate defaults"
      />
    );
  }
  return (
    <div>
      <PinSectionHead
        mark="✓"
        tone="ok"
        pill={`${nf.format(rules.length)} matched`}
        text="wrote to this update’s config"
      />
      <div className="pin-section-rail rail-ok">
        {rules.map((rule) => (
          <MatchedRow
            key={rule.index}
            rule={rule}
            description={descriptions.get(rule.index)}
            links={links}
          />
        ))}
      </div>
    </div>
  );
}

function ClosestMissNote({
  rule,
  onJumpToEditor,
}: {
  rule: PinFailedRule;
  onJumpToEditor?: (repoIndex: number) => void;
}) {
  const miss = rule.closestMiss;
  if (miss === undefined) {
    return null;
  }
  const repoIndex = rule.repoIndex;
  return (
    <p className="pin-closest-miss">
      Closest miss: change <code>{miss.clauseKey}</code> to <code>{miss.suggestion}</code> and this
      rule matches.{" "}
      {repoIndex !== undefined && onJumpToEditor !== undefined ? (
        <button
          type="button"
          className="btn-quiet"
          title="Jump to this rule in your config"
          onClick={() => onJumpToEditor(repoIndex)}
        >
          Try it →
        </button>
      ) : null}
    </p>
  );
}

function FailedRow({
  rule,
  description,
  links,
  defaultOpen,
}: {
  rule: PinFailedRule;
  description: RuleDescriptionNote | undefined;
  links: CrossLinks;
  /** The design opens the reader's first missed rule by itself — that row is
   *  the likeliest reason the tab is open at all. */
  defaultOpen: boolean;
}) {
  return (
    <PinDisclosureRow
      rule={rule}
      note={ruleNote(rule, description)}
      defaultExpanded={defaultOpen}
      onSelectPreset={links.onSelectPreset}
      body={
        <div className="pin-evidence">
          <p className="pin-evidence-title">Matcher checklist — first failure stops the rule</p>
          <ClauseGrid clauses={rule.clauses} />
          <ClosestMissNote rule={rule} onJumpToEditor={links.onJumpToEditor} />
        </div>
      }
    />
  );
}

export function PinFailedSection({
  rules,
  descriptions,
  links,
}: {
  rules: PinFailedRule[];
  descriptions: Map<number, RuleDescriptionNote>;
  links: CrossLinks;
}) {
  if (rules.length === 0) {
    return null;
  }
  return (
    <div>
      <PinSectionHead
        mark="✗"
        tone="accent"
        pill={`${nf.format(rules.length)} of your rules`}
        text="didn’t match — always shown by name, never bucketed"
      />
      <div className="pin-section-rail rail-accent">
        {rules.map((rule, i) => (
          <FailedRow
            key={rule.index}
            rule={rule}
            description={descriptions.get(rule.index)}
            links={links}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
