import { type CSSProperties, useState } from "react";
import type { LedgerFamily, LedgerRule } from "./ledger";
import { PresetName } from "@/components/PresetName";
import { nf, plural } from "@/lib/format";
import { pluralWord } from "./tree-shared";

/**
 * Roadmap 075 (iteration 5b): the "Grouping rules" section — the other half of
 * what `extends` brings in. Most of a big built-in is not configuration at all:
 * it is families of package-matching rules, and a reader who knows that
 * `group:monorepos` is 464 rules about which packages ship together has
 * understood the expansion without opening a single node.
 *
 * A source that declares packageRules ITSELF (the usual shape of a hosted
 * preset) gets those listed instead, one selector summary per rule — the same
 * one-liner the effective config's per-rule provenance prints.
 */

/** How wide the mini-bar can get, in percent of the row's bar track. */
const BAR_MAX = 100;

function FamilyBar({ rules, max }: { rules: number; max: number }) {
  const style: CSSProperties = { width: `${max > 0 ? (rules / max) * BAR_MAX : 0}%` };
  return (
    <span className="ledger-bar">
      <span className="ledger-bar-fill" style={style} />
    </span>
  );
}

function FamilySamples({
  family,
  onOpenNode,
}: {
  family: LedgerFamily;
  onOpenNode: (nodeId: string) => void;
}) {
  return (
    <div className="ledger-family-samples">
      {family.samples.map((sample) => (
        <PresetName
          key={sample.nodeId}
          name={sample.name}
          nodeId={sample.nodeId}
          onClick={() => onOpenNode(sample.nodeId)}
        />
      ))}
      <button type="button" className="btn-quiet" onClick={() => onOpenNode(family.nodeId)}>
        open in tree →
      </button>
    </div>
  );
}

function FamilyRow({
  family,
  max,
  expanded,
  highlighted,
  onToggle,
  onOpenNode,
}: {
  family: LedgerFamily;
  max: number;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onOpenNode: (nodeId: string) => void;
}) {
  return (
    <li className={`ledger-family${highlighted ? " highlighted" : ""}`}>
      <button
        type="button"
        className="ledger-family-head"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="caret">{expanded ? "▾" : "▸"}</span>
        {/* Inert inside the row's own toggle — a nested button is invalid
            HTML, and the row already activates on click. */}
        <PresetName name={family.name} nodeId={family.nodeId} />
        <span className="ledger-family-note">{family.note ?? ""}</span>
        <FamilyBar rules={family.rules} max={max} />
        <span className="ledger-family-count">{plural(family.rules, "rule")}</span>
      </button>
      {expanded ? <FamilySamples family={family} onOpenNode={onOpenNode} /> : null}
    </li>
  );
}

function OwnRules({ rules }: { rules: LedgerRule[] }) {
  return (
    <ul className="ledger-rule-list">
      {rules.map((rule) => (
        <li key={rule.index}>
          <span className="ledger-rule-index">#{rule.index + 1}</span>
          <span className="ledger-rule-selectors">{rule.selectors}</span>
        </li>
      ))}
    </ul>
  );
}

export function LedgerFamilies({
  families,
  ownRules,
  totalRules,
  active,
  activeFamilyId,
  onOpenNode,
}: {
  families: LedgerFamily[];
  /** packageRules this source declares itself. */
  ownRules: LedgerRule[];
  /** packageRules in the whole subtree — what the section is about. */
  totalRules: number;
  /** A tile pointing at this section is selected. */
  active: boolean;
  /** …and, when that tile was a family's, which family it named. */
  activeFamilyId: string | null;
  onOpenNode: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  if (families.length === 0 && ownRules.length === 0) {
    return null;
  }
  const max = families.reduce((m, family) => Math.max(m, family.rules), 0);
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }
  return (
    <section className={`ledger-section${active ? " active" : ""}`}>
      <h4 className="ledger-section-title">
        Grouping rules
        <span className="ledger-section-hint">
          {" "}
          — {nf.format(totalRules)} packageRules {pluralWord(totalRules, "rule")} in this expansion
        </span>
      </h4>
      <ul className="ledger-family-list">
        {families.map((family) => (
          <FamilyRow
            key={family.nodeId}
            family={family}
            max={max}
            expanded={expanded.has(family.nodeId)}
            highlighted={family.nodeId === activeFamilyId}
            onToggle={() => toggle(family.nodeId)}
            onOpenNode={onOpenNode}
          />
        ))}
      </ul>
      {ownRules.length > 0 ? <OwnRules rules={ownRules} /> : null}
    </section>
  );
}
