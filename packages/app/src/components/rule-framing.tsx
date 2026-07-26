import type { RuleAttribution } from "@renovate-config-visualizer/engine";
import type { ReactNode } from "react";
import { layerLabel } from "./provenance-layer";

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

const nf = new Intl.NumberFormat();

interface TopContributor {
  label: string;
  count: number;
  isPreset: boolean;
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
  const byOther = new Map<string, { label: string; n: number; isPreset: boolean }>();
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
      byOther.set(key, { label: layerLabel(a.layer), n: 1, isPreset: a.layer.kind === "preset" });
    }
  }
  const sorted = [...byOther.values()].toSorted((a, b) => b.n - a.n);
  const top = sorted[0];
  const otherCount = sorted.slice(1).reduce((n, e) => n + e.n, 0);
  return {
    own,
    top: top ? { label: top.label, count: top.n, isPreset: top.isPreset } : null,
    otherCount,
  };
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
          {nf.format(framing.top.count)} pulled in by{" "}
          {framing.top.isPreset ? <code>{framing.top.label}</code> : framing.top.label}
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
 * `variant: "compact"` — just the number, with a parenthetical breakdown when
 * available: `713 (2 from your config, 711 pulled in by config:recommended)`.
 * `variant: "full"` — a standalone clause with the word "rule(s)":
 * `713 rules — 2 from your config, 711 pulled in by config:recommended`.
 */
export function RuleFramingText({
  total,
  attribution,
  variant,
}: {
  total: number;
  attribution: RuleAttribution[] | null | undefined;
  variant: "compact" | "full";
}) {
  const framing = computeRuleFraming(total, attribution);
  const bare =
    variant === "full" ? `${nf.format(total)} rule${total === 1 ? "" : "s"}` : nf.format(total);
  if (!framing || (framing.own === 0 && !framing.top)) {
    // Nothing to attribute — just the count, as plain text.
    return bare;
  }
  if (variant === "compact") {
    return (
      <>
        {nf.format(total)} (<FramingBreakdown framing={framing} />)
      </>
    );
  }
  return (
    <>
      {bare} — <FramingBreakdown framing={framing} />
    </>
  );
}
