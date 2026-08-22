import { nf } from "@/lib/format";
import type { RuleAttribution } from "@renovate-config-debugger/engine";
import type { ReactNode } from "react";
import { PresetName } from "./PresetName";
import { layerLabel } from "@/lib/provenance-layer";

/**
 * Roadmap 016: honest "N rules — M from your config, K pulled in by
 * `preset`" framing for a merged packageRules count, shared by the effective
 * config's packageRules row and the simulator's heading — the two places the
 * number first appears (finding 6 of the persona study: big counts with no
 * origin read as "did I break something?"). Built entirely from 013's
 * per-rule provenance (`computeRuleProvenance`); returns `null` — never a
 * guessed fallback — when attribution is unavailable or doesn't cover every
 * rule, so callers can fall back to the bare count.
 */

interface TopContributor {
  label: string;
  count: number;
  isPreset: boolean;
  /** Roadmap 081: the preset's node, so the name can be the standard token
   *  with the standard card. Absent for the non-preset layers, which are prose
   *  here and have no node to point at. */
  nodeId?: string;
}

export interface RuleFramingData {
  own: number;
  top: TopContributor | null;
  /** Rules from other, smaller contributors beyond the top one (not "your config", not the top). */
  otherCount: number;
}

// Not exported: `RuleFramingText` below is this module's only consumer, and a
// component module that also exports plain functions breaks Fast Refresh.
function computeRuleFraming(
  total: number,
  attribution: RuleAttribution[] | null | undefined,
): RuleFramingData | null {
  if (!attribution || attribution.length !== total || total === 0) {
    return null;
  }
  let own = 0;
  const byOther = new Map<
    string,
    { label: string; n: number; isPreset: boolean; nodeId?: string }
  >();
  for (const a of attribution) {
    if (a.layer.kind === "repo") {
      own++;
      continue;
    }
    const key = a.layer.kind === "preset" ? `preset:${a.layer.name}` : a.layer.kind;
    const existing = byOther.get(key);
    if (existing) {
      existing.n++;
    } else {
      byOther.set(key, {
        label: layerLabel(a.layer),
        n: 1,
        isPreset: a.layer.kind === "preset",
        // Grouped by NAME, so this is the first occurrence's node — which is
        // the one the tree lands on for a preset resolved more than once
        // anyway (the later ones are `duplicate` rows served from its cache).
        nodeId: a.layer.kind === "preset" ? a.layer.nodeId : undefined,
      });
    }
  }
  const sorted = [...byOther.values()].toSorted((a, b) => b.n - a.n);
  const top = sorted[0];
  const otherCount = sorted.slice(1).reduce((n, e) => n + e.n, 0);
  return {
    own,
    top: top
      ? { label: top.label, count: top.n, isPreset: top.isPreset, nodeId: top.nodeId }
      : null,
    otherCount,
  };
}

/**
 * A contributor's name: a preset gets the standard token (081), a layer name
 * stays prose. Inert — the aside is a parenthetical inside a sentence, and a
 * button there would put a second activation into a line whose own control is
 * whatever encloses it; the token's hover card carries the jump instead.
 */
function ContributorLabel({ top }: { top: TopContributor }) {
  return top.isPreset ? <PresetName name={top.label} nodeId={top.nodeId} /> : top.label;
}

/** Renders the "M from your config, K pulled in by `preset`, and R more from
 *  other presets" clause — the part after the em dash. */
function FramingBreakdown({ framing }: { framing: RuleFramingData }) {
  const segs: { key: string; node: ReactNode }[] = [];
  if (framing.own > 0) {
    segs.push({ key: "own", node: `${nf.format(framing.own)} from your config` });
  }
  if (framing.top) {
    segs.push({
      key: "top",
      node: (
        <>
          {nf.format(framing.top.count)} pulled in by <ContributorLabel top={framing.top} />
        </>
      ),
    });
  }
  if (framing.otherCount > 0) {
    segs.push({ key: "rest", node: `${nf.format(framing.otherCount)} more from other presets` });
  }
  return (
    <>
      {segs.map((seg, i) => (
        <span key={seg.key}>
          {i > 0 ? (i === segs.length - 1 ? (segs.length > 2 ? ", and " : " and ") : ", ") : null}
          {seg.node}
        </span>
      ))}
    </>
  );
}

/**
 * The aside's inner clause. The count it frames has already been said, so it
 * must never repeat it: "713 (713 pulled in by config:recommended)" and
 * "713 (713 from your config)" both say the count twice and add nothing. When
 * one source covers every rule, say "all" instead.
 */
function CompactBreakdown({ framing, total }: { framing: RuleFramingData; total: number }) {
  if (framing.own === total && !framing.top) {
    return "all from your config";
  }
  if (framing.own === 0 && framing.top && framing.top.count === total) {
    return (
      <>
        all pulled in by <ContributorLabel top={framing.top} />
      </>
    );
  }
  return <FramingBreakdown framing={framing} />;
}

/**
 * A trailing parenthetical aside for a sentence that already stated the count
 * and its noun: ` (2 from your config and 711 pulled in by config:recommended)`,
 * leading space included. It follows the completed clause — never interrupts
 * it: "see which of the 734 (1 from your config and 733 pulled in by …) rules
 * would apply" buried what the number counted under its own attribution.
 * Renders nothing when attribution is unavailable — the sentence stands alone.
 */
export function RuleFramingAside({
  total,
  attribution,
}: {
  total: number;
  attribution: RuleAttribution[] | null | undefined;
}) {
  const framing = computeRuleFraming(total, attribution);
  if (!framing || (framing.own === 0 && !framing.top)) {
    return null;
  }
  return (
    <>
      {" "}
      (<CompactBreakdown framing={framing} total={total} />)
    </>
  );
}

/**
 * A standalone clause with the word "rule(s)":
 * `713 rules — 2 from your config, 711 pulled in by config:recommended`.
 * Falls back to the bare count when attribution is unavailable.
 */
export function RuleFramingText({
  total,
  attribution,
}: {
  total: number;
  attribution: RuleAttribution[] | null | undefined;
}) {
  const framing = computeRuleFraming(total, attribution);
  const bare = `${nf.format(total)} rule${total === 1 ? "" : "s"}`;
  if (!framing || (framing.own === 0 && !framing.top)) {
    // Nothing to attribute — just the count, as plain text.
    return bare;
  }
  return (
    <>
      {bare} — <FramingBreakdown framing={framing} />
      {/* Replay-02 R6: the one visible anchor tying the 1-based count to the
          0-based `packageRules[N]` citations everywhere else on the page. */}
      {total > 1 ? (
        <> (indexed packageRules[0]–packageRules[{nf.format(total - 1)}], as Renovate cites them)</>
      ) : null}
    </>
  );
}
