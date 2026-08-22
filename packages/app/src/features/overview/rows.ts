import type { DescriptionSource, ProvenanceLayer } from "@renovate-config-debugger/engine";
import { type DescriptionDigest, type DigestGroup, ruleNoteText } from "./description-digest";

/**
 * Roadmap 083 — the Overview's rows: 069's per-extend digest flattened back
 * into one list, so the topic classifier can regroup it by subject.
 *
 * The digest is still the model. What this adds is only the flattening and the
 * two decisions the flattening forces, both of which are about what the card's
 * count means:
 *
 * - **Repeated sentences are dropped.** The digest keeps them (its groups are
 *   per-extend, and "this extend contributed nothing new" is a fact it exists to
 *   report); grouped by TOPIC there is no such fact left to state, and the same
 *   sentence printed twice under one heading is exactly the noise this tab
 *   exists to remove. The raw array, repeats included, is one click away in the
 *   Effective config's `description` row.
 * - **The repo's own `packageRules` sentences are rows like any other.** They
 *   are behaviors the reader wrote, they have no other home in the app, and the
 *   design puts every sentence on the same footing — a blue `repo config` chip
 *   and the prose. Their `packageRules[i] — …` provenance survives as the row's
 *   tooltip rather than as a second column of mono text.
 *
 * Pure and DOM-free so the classifier and the count can be unit-tested without
 * a render.
 */

export interface OverviewRow {
  /** React key. Stable across runs: entry rows key on the final array index,
   *  rule rows on the digest group's own cross-run-stable key plus the merged
   *  rule index. */
  key: string;
  /** The sentence, as its author wrote it. What the classifier reads. */
  text: string;
  /** The top-level layer it arrived through — the row's dot hue, and its chip
   *  wherever no preset node can be named. */
  layer: ProvenanceLayer;
  /** The preset whose body actually wrote it, when the engine could name one. */
  node?: DescriptionSource;
  /** The engine fell back to an enclosing subtree (069 PR 1) — the row carries
   *  the shared `≈`. */
  approximate: boolean;
  /** Repo rule rows only: `packageRules[0] — matchUpdateTypes → automerge`. */
  note?: string;
}

function entryRows(group: DigestGroup): OverviewRow[] {
  const rows: OverviewRow[] = [];
  for (const entry of group.entries) {
    if (entry.duplicateOfIndex !== undefined) {
      continue;
    }
    rows.push({
      key: `e${entry.index}`,
      text: entry.value,
      layer: group.layer,
      ...(entry.node ? { node: entry.node } : {}),
      approximate: entry.approximate ?? false,
    });
  }
  return rows;
}

function ruleRows(group: DigestGroup): OverviewRow[] {
  return group.rules.map((rule) => ({
    key: `r${group.key}:${rule.ruleIndex}`,
    // The digest keeps a rule's `description` as the array Renovate resolved
    // it to; the card prints one sentence per row, so a multi-string rule
    // description reads as the one sentence it is meant to be.
    text: rule.values.join(" "),
    layer: group.layer,
    approximate: false,
    note: ruleNoteText(rule),
  }));
}

/**
 * Every sentence the card lists, in Renovate's own merge order.
 *
 * Merge order is the digest's group order, which means the rows arrive
 * defaults → global → inherited → each extend → the repo's own. The classifier
 * preserves that inside each topic, so a topic still reads oldest-layer-first
 * even though the topics themselves are the design's order.
 */
export function overviewRows(digest: DescriptionDigest): OverviewRow[] {
  return digest.groups.flatMap((group) => [...entryRows(group), ...ruleRows(group)]);
}
