import type {
  DescriptionAttribution,
  DescriptionProvenance,
  DroppedDescription,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import { layerId, layerLabel, layerNodeKey } from "@/components/provenance-layer";

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

const nf = new Intl.NumberFormat();

/** A consecutive run of entries that arrived through one top-level layer. */
export interface LedgerGroup {
  /**
   * React key, stable ACROSS RUNS. The runs themselves break on the layer's
   * NODE (a preset reached through two `extends` entries must stay two runs —
   * that repeat is the story this row tells), but node ids are minted per run
   * (`p1`, `p2`, …) and the panel stays mounted across edits, so a node-based
   * key would let a run's "show all" state reattach to a different preset after
   * the next keystroke. Hence the name-based `layerId`, plus an ordinal
   * (`…#2`) for each further run of the same name — the same shape the
   * Overview digest's group keys use.
   */
  key: string;
  layer: ProvenanceLayer;
  entries: DescriptionAttribution[];
}

export interface DescriptionLedger {
  groups: LedgerGroup[];
  /** Strings in the final `description` array — duplicates included. */
  entryCount: number;
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

/** Cuts on a code point, never through one: a UTF-16 slice at `max` can land
 *  between the halves of a surrogate pair and render the emoji it split as
 *  U+FFFD. Checking the last kept unit is enough — only a trailing HIGH
 *  surrogate can be an orphan — and costs nothing on a string of any size. */
function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const last = text.charCodeAt(max - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? max - 1 : max;
  return `${text.slice(0, end)}…`;
}

/**
 * Builds the ledger, or `null` when the run's final `description` is empty —
 * in which case the row falls back to the generic override-chain rendering,
 * because a ledger with no lines would say less than the chain does.
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
  for (const entry of provenance.entries) {
    // Only strings that arrived through a preset — the repo's own sentences are
    // written by the root node, which is a config, not a preset — and counted
    // by name, because a preset reached twice is still one preset. (The runs
    // below BREAK on the node, deliberately: there the second arrival is the
    // whole story.)
    if (entry.node && entry.viaTopLevel.kind === "preset") {
      writers.add(entry.node.name);
    }
    const nodeKey = layerNodeKey(entry.viaTopLevel);
    const open = groups.at(-1);
    if (open && layerNodeKey(open.layer) === nodeKey) {
      open.entries.push(entry);
      continue;
    }
    // A new run: named after the layer, disambiguated by how many runs of that
    // name opened before it — the per-run node id must not reach the key.
    const base = layerId(entry.viaTopLevel);
    const seen = keyUses.get(base) ?? 0;
    keyUses.set(base, seen + 1);
    groups.push({
      key: seen === 0 ? base : `${base}#${seen + 1}`,
      layer: entry.viaTopLevel,
      entries: [entry],
    });
  }
  return {
    groups,
    entryCount: provenance.entries.length,
    writerCount: writers.size,
    dropped: provenance.dropped,
    degraded: provenance.degraded,
  };
}

/**
 * Is this ledger the row's ACTUAL final value, string for string?
 *
 * The engine's walk only ever attributes strings, but `description` is merely
 * `type: array, subType: string` to Renovate — `{"description": ["keep", 42]}`
 * validates with a warning and still merges, so the final array can hold
 * members the ledger has no line for. Rendering it anyway would print "1 entry"
 * over a two-member array and make the `42` invisible, which is strictly worse
 * than the generic override chain the row used to show.
 *
 * So the row asks this first, positionally: same length, and every member
 * strictly equal to the string attributed at that index (strict equality
 * against a string also rejects any non-string member). On `false` the row
 * falls back to the chain — the ledger is an enrichment, never a replacement
 * for the truth.
 */
export function ledgerMatchesFinalValue(ledger: DescriptionLedger, finalValue: unknown): boolean {
  if (!Array.isArray(finalValue) || finalValue.length !== ledger.entryCount) {
    return false;
  }
  for (const group of ledger.groups) {
    for (const entry of group.entries) {
      if (finalValue[entry.index] !== entry.value) {
        return false;
      }
    }
  }
  return true;
}

/** How much of the array fits in a collapsed row's preview cell. The generic
 *  `preview()` would print `[ 24 items ]` here — true, and the single least
 *  useful sentence in the view. */
const PREVIEW_CHARS = 80;

/** The collapsed row's value cell: `24 entries — "Pin Docker digests.", "Use…`. */
export function ledgerPreviewText(ledger: DescriptionLedger): string {
  const count = ledger.entryCount;
  const head = `${nf.format(count)} ${count === 1 ? "entry" : "entries"}`;
  // Runs per keystroke via KeyRowPreview — stop quoting once the cell is full.
  let quoted = "";
  for (const group of ledger.groups) {
    for (const entry of group.entries) {
      quoted += quoted.length > 0 ? `, "${entry.value}"` : `"${entry.value}"`;
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
 */
export function duplicateNoteText(entry: DescriptionAttribution): string {
  const via = entry.viaTopLevel;
  return via.kind === "preset" ? `${via.name} resolves it again` : `${layerLabel(via)} repeats it`;
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

const DROP_REASONS: Record<"wrapper-preset" | "package-list-preset", string> = {
  // Both are `getPreset` deletions, so they are facts about the preset's SHAPE
  // — worth saying, because the two headline presets are the shape.
  "wrapper-preset":
    "wrapper preset — Renovate drops the description of a preset whose body is only `description` + `extends`",
  "package-list-preset":
    "package-name list — Renovate drops the description of a preset that only lists `matchPackageNames`",
};

/** Backtick-marked (the `CodeText` convention), so option names stay mono. */
export function droppedReasonText(drop: DroppedDescription): string {
  const reason = drop.reason;
  if (reason === "ignore-deps-quirk") {
    const by = drop.droppedBy ? `\`${drop.droppedBy.name}\`` : "the extending config";
    return `muted by ${by} — its empty \`ignoreDeps\` deletes every description it extends`;
  }
  return DROP_REASONS[reason];
}

/** Rows hidden by a collapsed list — shared by the runs and the dropped
 *  footer, which collapse the same way at different thresholds. */
export function hiddenCount(total: number, after: number, expanded: boolean): number {
  return expanded ? 0 : Math.max(0, total - after);
}
