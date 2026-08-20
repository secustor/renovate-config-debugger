import { nf } from "@/lib/format";
import type {
  DescriptionAttribution,
  DescriptionProvenance,
  DroppedDescription,
  ProvenanceLayer,
  UnattributedDescription,
} from "@renovate-config-debugger/engine";
import { layerLabel, layerNodeKey, stableLayerKey } from "@/components/provenance-layer";
import { truncate } from "@/lib/truncate";

/**
 * Roadmap 069 (PR 3): the view-model behind the Effective config's blame
 * ledger — the `description` row's answer to "who wrote this sentence".
 *
 * Where the Overview's digest (PR 2) REGROUPS the strings by what each
 * `extends` entry bought, this keeps the one order that is a fact: the final
 * array's. That is the order Renovate produced and the order the row's own
 * "Final value" would print, so the ledger can claim to be the same array with
 * the authorship put back — nothing reordered, nothing folded away, duplicates
 * still in place (struck through, not removed, the way DevTools shows an
 * overridden CSS declaration).
 *
 * "The same array" is meant literally, which is why a row exists for every
 * member and not only for the attributed ones: `description` is `type: array,
 * subType: string` to Renovate, so `{"description": ["keep", 42]}` merges with a
 * warning and the `42` holds index 1 (069 PR 1's `unattributed`/`finalLength`).
 * A ledger that silently skipped it would print an array one member short of the
 * one above it — so it gets a line of its own saying that nobody wrote it.
 *
 * The only structure imposed on top is blame-style grouping: CONSECUTIVE runs
 * of entries that arrived through the same top-level layer get a hairline
 * between them, exactly as `git blame` groups consecutive lines by commit.
 * Runs, not a keyed grouping — a layer that appears twice in the array must
 * stay two runs, because the second appearance is the duplicate story this
 * row exists to tell.
 *
 * Pure and DOM-free, so the wording of every note is unit-testable and the
 * component below it only decides where things sit.
 */

/** An attributed string: one line of prose and the preset that wrote it. */
export interface LedgerEntryRow {
  kind: "entry";
  /** Position in the final `description` array — the engine's own index. */
  index: number;
  entry: DescriptionAttribution;
}

/** A member of that array that is not a string, and therefore has no author to
 *  name (069 PR 1's `unattributed`). */
export interface LedgerUnattributedRow {
  kind: "unattributed";
  index: number;
  value: unknown;
}

export type LedgerRow = LedgerEntryRow | LedgerUnattributedRow;

/** A consecutive run of rows that arrived through one top-level layer. */
export interface LedgerGroup {
  /**
   * React key, stable ACROSS RUNS. The runs themselves break on the layer's
   * NODE (a preset reached through two `extends` entries must stay two runs —
   * that repeat is the story this row tells), but node ids are minted per run
   * (`p1`, `p2`, …) and the panel stays mounted across edits, so a node-based
   * key would let a run's "show all" state reattach to a different preset after
   * the next keystroke. Hence `stableLayerKey`, the same name-plus-ordinal key
   * the Overview digest's groups use.
   */
  key: string;
  layer: ProvenanceLayer;
  rows: LedgerRow[];
}

export interface DescriptionLedger {
  groups: LedgerGroup[];
  /** Attributed strings in the final `description` array — duplicates included. */
  entryCount: number;
  /** Members of that array that are not text, so no preset can be credited. */
  unattributedCount: number;
  /** Members of the final array all told: `entryCount + unattributedCount`, and
   *  the number of rows the ledger renders. */
  finalLength: number;
  /** Distinct presets that wrote at least one of them, counted by NAME: two
   *  tree nodes of the same preset are one preset, and the repo config's own
   *  sentences are not a preset at all. */
  writerCount: number;
  /** Descriptions Renovate deleted before they could merge (069 PR 1). */
  dropped: readonly DroppedDescription[];
  /** At least one string needed the engine's enclosing-node fallback. */
  degraded: boolean;
}

/** Entries shown before a run collapses. Larger than the Overview card's five:
 *  this list IS the detail view, and the run it most often applies to —
 *  `config:best-practices` with twenty-odd sentences — is what the reader
 *  expanded the row to read. It only has to stop one extend from burying the
 *  ones after it. */
export const LEDGER_COLLAPSE_AFTER = 8;

/** Dropped descriptions shown before the footer's own list collapses. The
 *  `ignoreDeps: []` mute alone drops 135 sentences on a `config:best-practices`
 *  run — a footnote must not become the page. */
export const DROPPED_COLLAPSE_AFTER = 8;

/**
 * The array's members in index order, strings and non-strings interleaved.
 * Both engine lists are already ascending and disjoint (`entries.length +
 * unattributed.length === finalLength`), so one merge pass reconstructs the
 * real array's shape without trusting either list to be complete on its own.
 */
function rowsInOrder(
  entries: readonly DescriptionAttribution[],
  unattributed: readonly UnattributedDescription[],
): LedgerRow[] {
  const rows: LedgerRow[] = [
    ...entries.map((entry): LedgerRow => ({ kind: "entry", index: entry.index, entry })),
    ...unattributed.map((member): LedgerRow => ({
      kind: "unattributed",
      index: member.index,
      value: member.value,
    })),
  ];
  rows.sort((a, b) => a.index - b.index);
  return rows;
}

/**
 * Builds the ledger, or `null` when the run's final `description` holds no
 * attributed string at all — in which case the row falls back to the generic
 * override-chain rendering, because a ledger of nothing but "nobody wrote this"
 * lines would say less than the chain does. (Same empty state the Overview's
 * digest card takes for `{"description": [42]}`.)
 */
export function buildDescriptionLedger(
  provenance: DescriptionProvenance,
): DescriptionLedger | null {
  if (provenance.entries.length === 0) {
    return null;
  }
  const groups: LedgerGroup[] = [];
  const writers = new Set<string>();
  const keyUses = new Map<string, number>();
  // Non-strings before the first attributed string: they belong to the ledger
  // (they hold a real index) but cannot open a run, since no layer is known to
  // have carried them. Held until the first run exists and prepended to it, so
  // index order survives — see the placement note in the loop.
  const leading: LedgerRow[] = [];

  for (const row of rowsInOrder(provenance.entries, provenance.unattributed)) {
    if (row.kind === "unattributed") {
      // Placed INSIDE the surrounding run rather than breaking one: the run is
      // a visual grouping only (each row carries its own source cell, and this
      // row's says plainly that nobody can be credited), so keeping the index
      // order intact is worth more than a hairline nobody could interpret.
      const open = groups.at(-1);
      if (open) {
        open.rows.push(row);
      } else {
        leading.push(row);
      }
      continue;
    }
    const { entry } = row;
    // Only strings that arrived through a preset — the repo's own sentences are
    // written by the root node, which is a config, not a preset — and counted
    // by name, because a preset reached twice is still one preset. (The runs
    // below BREAK on the node, deliberately: there the second arrival is the
    // whole story.)
    if (entry.node && entry.viaTopLevel.kind === "preset") {
      writers.add(entry.node.name);
    }
    const open = groups.at(-1);
    if (open && layerNodeKey(open.layer) === layerNodeKey(entry.viaTopLevel)) {
      open.rows.push(row);
      continue;
    }
    groups.push({
      key: stableLayerKey(entry.viaTopLevel, keyUses),
      layer: entry.viaTopLevel,
      rows: [...leading, row],
    });
    leading.length = 0;
  }

  return {
    groups,
    entryCount: provenance.entries.length,
    unattributedCount: provenance.unattributed.length,
    finalLength: provenance.finalLength,
    writerCount: writers.size,
    dropped: provenance.dropped,
    degraded: provenance.degraded,
  };
}

/**
 * Is this ledger the row's ACTUAL final value, member for member?
 *
 * The ledger claims to BE the final array with the authorship put back, and the
 * row prints it in place of the generic chain — so the claim is checked before
 * it is made, positionally: same length, every attributed index holding exactly
 * the string the ledger credits, every unattributed index holding exactly the
 * member it lists. On `false` the row falls back to the chain; the ledger is an
 * enrichment, never a replacement for the truth.
 *
 * Unattributed members are compared with `Object.is` rather than structurally.
 * They are `unknown` and the engine took them straight out of this same array,
 * so reference identity is what "the ledger is that array" means — a deep
 * compare would additionally accept a different-but-equal member, which is a
 * weaker claim than the one being made (and `Object.is` gets `NaN` right, which
 * `===` does not).
 */
export function ledgerMatchesFinalValue(ledger: DescriptionLedger, finalValue: unknown): boolean {
  if (!Array.isArray(finalValue) || finalValue.length !== ledger.finalLength) {
    return false;
  }
  let rows = 0;
  for (const group of ledger.groups) {
    for (const row of group.rows) {
      rows++;
      const member = finalValue[row.index];
      if (row.kind === "entry" ? member !== row.entry.value : !Object.is(member, row.value)) {
        return false;
      }
    }
  }
  // One row per index, so a ledger missing a member (or claiming one twice)
  // cannot pass by having every row it does carry line up.
  return rows === ledger.finalLength;
}

/** How much of the array fits in a collapsed row's preview cell. The generic
 *  `preview()` would print `[ 24 items ]` here — true, and the single least
 *  useful sentence in the view. */
const PREVIEW_CHARS = 80;

/** How much of a non-string member fits in its own row's value cell. Short: it
 *  is there to be identified, not read — the row's point is that it is not
 *  prose. */
const UNATTRIBUTED_PREVIEW_CHARS = 60;

/** The head of the collapsed row's value cell — and the ledger's own count of
 *  what the array holds. Plain `24 entries` while every member is a sentence;
 *  once one is not, the two kinds are counted apart rather than summed, because
 *  "3 entries" over two sentences and a number is the under-reporting the
 *  unattributed rows exist to prevent. */
export function ledgerCountText(ledger: DescriptionLedger): string {
  if (ledger.unattributedCount === 0) {
    return `${nf.format(ledger.finalLength)} ${ledger.finalLength === 1 ? "entry" : "entries"}`;
  }
  const sentences = `${nf.format(ledger.entryCount)} sentence${ledger.entryCount === 1 ? "" : "s"}`;
  const others = `${nf.format(ledger.unattributedCount)} other member${ledger.unattributedCount === 1 ? "" : "s"}`;
  return `${sentences} + ${others}`;
}

/** The collapsed row's value cell: `24 entries — "Pin Docker digests.", "Use…`. */
export function ledgerPreviewText(ledger: DescriptionLedger): string {
  const head = ledgerCountText(ledger);
  // Runs per keystroke via KeyRowPreview — stop quoting once the cell is full.
  let quoted = "";
  for (const group of ledger.groups) {
    for (const row of group.rows) {
      if (row.kind !== "entry") {
        continue;
      }
      quoted += quoted.length > 0 ? `, "${row.entry.value}"` : `"${row.entry.value}"`;
      if (quoted.length > PREVIEW_CHARS) {
        return `${head} — ${truncate(quoted, PREVIEW_CHARS)}`;
      }
    }
  }
  return quoted.length > 0 ? `${head} — ${quoted}` : head;
}

/** The origin cell's compact summary of how many presets had a hand in this
 *  one key — `null` when nothing in the array came from a preset (a repo-only
 *  description, where the winning-layer chip already says everything). */
export function ledgerWriterText(ledger: DescriptionLedger): string | null {
  if (ledger.writerCount === 0) {
    return null;
  }
  return `${nf.format(ledger.writerCount)} preset${ledger.writerCount === 1 ? "" : "s"}`;
}

/**
 * The muted note after a source chip: the top-level `extends` entry the string
 * ARRIVED through, when that is not the preset that wrote it. Nested presets
 * are the common case — `docker:pinDigests` writes the sentence, but
 * `config:best-practices` is the line you delete to stop it.
 */
export function viaNoteText(entry: DescriptionAttribution): string | undefined {
  const via = entry.viaTopLevel;
  if (via.kind !== "preset" || entry.node?.nodeId === via.nodeId) {
    return undefined;
  }
  return `via ${via.name}`;
}

/** The warn-tinted pill on a repeated sentence, pointing at the occurrence
 *  that already said it (1-based, like every index this view prints). */
export function duplicatePillText(entry: DescriptionAttribution): string {
  return `duplicate of #${(entry.duplicateOfIndex ?? 0) + 1}`;
}

/**
 * Why the repeat happened, named after the layer that caused it: extending a
 * preset some other extend already pulled in concatenates its sentence a
 * second time. Renovate never deduplicates `description`, so this is the whole
 * explanation — and the actionable one, since the named layer is the line to
 * remove.
 *
 * Hedged for an `approximate` entry, where naming a layer confidently would be
 * the one thing this view must not do: the engine reached that entry through
 * its enclosing-node fallback, so `viaTopLevel` is the layer the fallback
 * assigned rather than one it verified — and for a whole-run fallback it is the
 * fabricated `repo` layer, which would otherwise have the repo config
 * confidently blamed for a repeat a preset caused. The row carries the shared
 * `≈` next to it (069 PR 2's mark), so the hedge and the mark say one thing.
 */
export function duplicateNoteText(entry: DescriptionAttribution): string {
  const via = entry.viaTopLevel;
  if (entry.approximate) {
    return via.kind === "preset"
      ? `probably resolved again by ${via.name}`
      : `probably repeated by ${layerLabel(via)}`;
  }
  return via.kind === "preset" ? `${via.name} resolves it again` : `${layerLabel(via)} repeats it`;
}

/** A non-string member's value cell — compact JSON, so `{"a":1}` and `"1"` are
 *  distinguishable from `1` at a glance. */
export function unattributedValueText(value: unknown): string {
  return truncate(JSON.stringify(value) ?? String(value), UNATTRIBUTED_PREVIEW_CHARS);
}

/**
 * …and its source cell. The same fact the digest card footnotes (069 PR 2's
 * `unattributedNoteText`), said per row because here the row IS the member:
 * Renovate warns about a wrong-typed member and keeps it, so it is genuinely
 * part of the config and genuinely authorless.
 */
export function unattributedNoteText(): string {
  return "not text — Renovate accepted it, but no preset can be credited";
}

/** The collapse toggle inside one run. */
export function moreEntriesText(hidden: number, layer: ProvenanceLayer): string {
  return `${nf.format(hidden)} more from ${layerLabel(layer)} — show all`;
}

/** …and the dropped footer's, which has no single layer to name. */
export function moreDroppedText(hidden: number): string {
  return `${nf.format(hidden)} more — show all`;
}

/** The quiet footer's own line — "where did my preset's description go". */
export function droppedSummaryText(dropped: readonly DroppedDescription[]): string {
  const count = dropped.length;
  return `Not included: ${nf.format(count)} description${count === 1 ? "" : "s"} Renovate dropped`;
}

/** Rows hidden by a collapsed list — shared by the runs and the dropped
 *  footer, which collapse the same way at different thresholds. */
export function hiddenCount(total: number, after: number, expanded: boolean): number {
  return expanded ? 0 : Math.max(0, total - after);
}
