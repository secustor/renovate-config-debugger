import type { ReactNode } from "react";
import type { KeyProvenance, RuleAttribution } from "@renovate-config-debugger/engine";
import { Caret } from "@/components/Caret";
import { COLLAPSE_AFTER } from "@/lib/collapse";
import {
  deciderHeadline,
  type DeciderGroup,
  type DeciderHeadline,
  type DeciderId,
} from "./decider-groups";
import { type DescriptionLedger, ledgerForRow } from "./description-ledger";
import { DefaultRow, KeyRow } from "./KeyRow";
import { ShowAllMore } from "@/components/ShowAllMore";

/** The pill each decided-by section is headed with — the layer's own tone from
 *  the standard pill set, so a section header and the layer chips on its rows
 *  cannot disagree about which hue a level wears. */
const DECIDER_PILL: Record<DeciderId, { tone: string; label: string }> = {
  repo: { tone: "pill-accent", label: "repo config" },
  preset: { tone: "pill-preset", label: "presets" },
  inherited: { tone: "pill-inherited", label: "inherited config" },
  global: { tone: "pill-global", label: "global config" },
  defaults: { tone: "pill-muted", label: "defaults" },
};

/**
 * Roadmap 075 (iteration 5): one decided-by band. A disclosure rather than a
 * plain heading because the defaults band is the one nobody opens by default
 * and it is routinely the largest — and once one band collapses they all must,
 * or the affordance reads as an oddity of that band.
 *
 * `open` is controlled by the view (the description landing has to be able to
 * open the band its row is in), so `summary`'s own toggle is suppressed and the
 * click reported instead — the standard controlled-details idiom.
 */
function DeciderSection({
  id,
  headline,
  open,
  onToggleOpen,
  children,
}: {
  id: DeciderId;
  headline: DeciderHeadline;
  open: boolean;
  onToggleOpen: () => void;
  children: ReactNode;
}) {
  const { tone, label } = DECIDER_PILL[id];
  return (
    <details className={`prov-section prov-section-${id}`} open={open}>
      <summary
        className="prov-section-head"
        onClick={(e) => {
          e.preventDefault();
          onToggleOpen();
        }}
      >
        <Caret open={open} />
        <span className={`pill ${tone}`}>{label}</span>
        <SectionHeadline headline={headline} />
      </summary>
      <div className="kv prov-list">{children}</div>
    </details>
  );
}

/** The header sentence in the design's three emphases: lead in the header's
 *  ink and weight, count in the band's hue, trailing clause muted and regular.
 *  The leading spaces live in the spans so the textContent stays the sentence. */
function SectionHeadline({ headline }: { headline: DeciderHeadline }) {
  return (
    <span className="prov-section-headline">
      {headline.lead}
      {headline.count === null ? null : (
        <span className="prov-headline-count"> {headline.count}</span>
      )}
      {headline.note === null ? null : <span className="prov-headline-note"> {headline.note}</span>}
    </span>
  );
}

/** The defaults band's footer (082 GAP-5): its truncation line, plus the one
 *  honest sentence about every row above it — which is also why those rows
 *  carry no note of their own. */
function DefaultsFooter({ hidden, onShowAll }: { hidden: number; onShowAll: () => void }) {
  return (
    <p className="prov-band-more">
      <ShowAllMore hidden={hidden} noun="default" onShowAll={onShowAll} />
      <span className="prov-band-note">
        {/* The leading space is load-bearing: JSX drops the newline between the
            button and this span, so the separator carries its own gap. */}
        {hidden > 0 ? " · " : ""}hover any key for Renovate’s docs; no cascade to show — only the
        default ever touched these
      </span>
    </p>
  );
}

/** What every band needs to render its rows — one object rather than eight
 *  props threaded through two components. */
export interface BandRowContext {
  expanded: ReadonlySet<string>;
  onToggleRow: (key: string) => void;
  onSelectPreset?: (nodeId: string) => void;
  ruleAttribution: RuleAttribution[] | null | undefined;
  ledger: DescriptionLedger | null;
}

/** The defaults band: inert rows, its own footer, and (082 GAP-4) always here —
 *  collapsed, but never filtered away behind a checkbox. */
function DefaultsBand({
  entries,
  open,
  onToggleOpen,
  showAll,
  onShowAll,
}: {
  entries: KeyProvenance[];
  open: boolean;
  onToggleOpen: () => void;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const shown = showAll ? entries : entries.slice(0, COLLAPSE_AFTER);
  return (
    <DeciderSection
      id="defaults"
      headline={deciderHeadline("defaults", entries.length)}
      open={open}
      onToggleOpen={onToggleOpen}
    >
      {shown.map((entry) => (
        <DefaultRow key={entry.key} entry={entry} />
      ))}
      <DefaultsFooter hidden={entries.length - shown.length} onShowAll={onShowAll} />
    </DeciderSection>
  );
}

/** …and every other band: expandable rows, cascade and all. */
function KeyBand({
  id,
  headline,
  entries,
  open,
  onToggleOpen,
  showAll,
  onShowAll,
  rows,
}: {
  id: DeciderId;
  headline: DeciderHeadline;
  entries: KeyProvenance[];
  open: boolean;
  onToggleOpen: () => void;
  showAll: boolean;
  onShowAll: () => void;
  rows: BandRowContext;
}) {
  const shown = showAll ? entries : entries.slice(0, COLLAPSE_AFTER);
  const hidden = entries.length - shown.length;
  return (
    <DeciderSection id={id} headline={headline} open={open} onToggleOpen={onToggleOpen}>
      {shown.map((entry) => (
        <KeyRow
          key={entry.key}
          entry={entry}
          ruleAttribution={entry.key === "packageRules" ? rows.ruleAttribution : undefined}
          ledger={ledgerForRow(entry, rows.ledger)}
          expanded={rows.expanded.has(entry.key)}
          onToggle={() => rows.onToggleRow(entry.key)}
          onSelectPreset={rows.onSelectPreset}
        />
      ))}
      {hidden > 0 ? (
        <p className="prov-band-more">
          <ShowAllMore hidden={hidden} onShowAll={onShowAll} />
        </p>
      ) : null}
    </DeciderSection>
  );
}

/** The By-key view's body: one band per deciding layer, the defaults one built
 *  differently because its rows are inert (082 GAP-4/GAP-6). */
export function EffectiveBands({
  sections,
  presetName,
  collapsed,
  onToggleSection,
  shownAll,
  onShowAll,
  rows,
}: {
  sections: DeciderGroup[];
  presetName: string | null;
  collapsed: ReadonlySet<DeciderId>;
  onToggleSection: (id: DeciderId) => void;
  shownAll: ReadonlySet<DeciderId>;
  onShowAll: (id: DeciderId) => void;
  rows: BandRowContext;
}) {
  return (
    <>
      {sections.length === 0 ? <p className="empty-note">No keys match.</p> : null}
      {sections.map((section) =>
        section.id === "defaults" ? (
          <DefaultsBand
            key={section.id}
            entries={section.entries}
            open={!collapsed.has(section.id)}
            onToggleOpen={() => onToggleSection(section.id)}
            showAll={shownAll.has(section.id)}
            onShowAll={() => onShowAll(section.id)}
          />
        ) : (
          <KeyBand
            key={section.id}
            id={section.id}
            headline={deciderHeadline(section.id, section.entries.length, presetName)}
            entries={section.entries}
            open={!collapsed.has(section.id)}
            onToggleOpen={() => onToggleSection(section.id)}
            showAll={shownAll.has(section.id)}
            onShowAll={() => onShowAll(section.id)}
            rows={rows}
          />
        ),
      )}
    </>
  );
}
