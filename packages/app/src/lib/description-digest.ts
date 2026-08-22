import { nf } from "./format";
import type {
  DescriptionProvenance,
  DescriptionSource,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import { layerNodeKey, stableLayerKey } from "@/components/provenance-layer";
import { ruleWrittenKeys, summarizeRuleSelectors } from "./rule-selectors";

/**
 * Roadmap 069 (PR 2): the view-model behind the Overview's "What this config
 * does" card — the engine's per-string `description` attribution regrouped from
 * "the final array, in order" into "who contributed what".
 *
 * The engine hands back one flat, positionally-correct list (069 PR 1); that
 * order is the honest one and the Effective config's blame ledger keeps it. The
 * Overview asks a different question — *what did each `extends` entry buy me* —
 * so this groups the same strings by the top-level layer they arrived through,
 * in merge order, without reordering anything inside a group.
 *
 * What falls out of the grouping that the flat list cannot say: the repo's own
 * `packageRules` descriptions have no top-level presence whatsoever (Renovate
 * never hoists them), so they are carried alongside the repo group — the first
 * surface in the app to show them. Duplicate strings are tracked per entry
 * (`duplicateOfIndex` → the `behaviors` count), which is how the Overview drops
 * repeats and the preset tree wears its `duplicate ×N` badge.
 *
 * Pure and DOM-free (`lib/`), so `packages/cli` can quote the same digest.
 */

/** One string of the final top-level `description`, as the card renders it. */
export interface DigestEntry {
  /** Index into the final `description` array — the canonical id (069 PR 1). */
  index: number;
  value: string;
  /** The preset whose own body wrote it; absent for the defaults/global/inherited layers. */
  node?: DescriptionSource;
  /** Set when this string repeats an earlier one, pointing at that first occurrence. */
  duplicateOfIndex?: number;
  /** The exact writer is unknown; `node` names the enclosing subtree instead. */
  approximate?: boolean;
}

/** A description written on one of the repo config's OWN `packageRules`. */
export interface DigestRule {
  /** Index into the final merged `packageRules` array — where the rule BODY is
   *  read from, and the id Renovate's own validator messages cite. */
  ruleIndex: number;
  /** Index within the repo config's own `packageRules` array — the only one of
   *  the two the reader can find in their editor, so the one the card cites.
   *  (Presets extend ahead of the repo, so the merged index of a user rule is
   *  routinely in the hundreds.) */
  sourceIndex: number;
  values: string[];
  /** `matchUpdateTypes + matchManagers`, or the honest "no selectors" note. */
  selectors: string;
  /** The option keys the rule sets. */
  writes: string[];
}

/** Everything one top-level layer contributed. */
export interface DigestGroup {
  /**
   * React key, stable ACROSS RUNS. The grouping itself keys on the preset NODE
   * (extending the same preset twice is exactly the case this card exists to
   * flag, so the two extends must stay two groups), but node ids are minted per
   * run — and the card stays mounted across runs, so a node-based key would let
   * a group's expansion state reattach to a different preset after an edit.
   * Hence `stableLayerKey`: the name-based `layerId` plus an ordinal for the
   * repeated extend the node grouping deliberately kept separate.
   */
  key: string;
  layer: ProvenanceLayer;
  entries: DigestEntry[];
  /** Repo group only — user-written `packageRules` descriptions. */
  rules: DigestRule[];
  /** Entries that are not duplicates of an earlier string: what this layer ADDED. */
  behaviors: number;
}

export interface DescriptionDigestTotals {
  /** Distinct behaviors — duplicated strings counted once. */
  behaviors: number;
  /** Top-level `extends` entries that contributed at least one string. */
  extendsCount: number;
  hasUserRules: boolean;
}

export interface DescriptionDigest {
  /** Groups in merge order: the external layers, each direct extend, the repo config. */
  groups: DigestGroup[];
  totals: DescriptionDigestTotals;
  /** At least one string needed the engine's enclosing-node fallback (069 PR 1). */
  degraded: boolean;
  /**
   * Members of the final `description` array that are not text. Renovate only
   * WARNS about `{"description": ["a sentence", 42]}` — the `42` survives into
   * the array and holds a real index — so no preset can be credited with it and
   * no group can show it. Counted here so the card can say so rather than let a
   * summary titled "What this config does" quietly drop a member.
   */
  unattributed: number;
  /** Length of the real final `description` array (069 PR 1's `finalLength`):
   *  the strings shown across all groups PLUS {@link unattributed}. */
  finalLength: number;
}

interface MutableGroup extends Omit<DigestGroup, "behaviors" | "key"> {
  behaviors: number;
}

/** The group a layer belongs to, created on first sight. Keyed by
 *  `layerNodeKey` — the node identity, so the same preset extended twice is
 *  two groups; the React key is derived separately (see {@link DigestGroup}). */
function groupFor(groups: Map<string, MutableGroup>, layer: ProvenanceLayer): MutableGroup {
  const key = layerNodeKey(layer);
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }
  const created: MutableGroup = { layer, entries: [], rules: [], behaviors: 0 };
  groups.set(key, created);
  return created;
}

/**
 * Builds the digest, or `null` when this run has nothing to say — no top-level
 * descriptions and no user rule descriptions. `null` rather than an empty
 * digest because the card's empty state is *no card*: a config that extends
 * nothing has no author prose to show, and an empty "What this config does"
 * would be a promise the run cannot keep. A `description` holding ONLY
 * non-strings (`{"description": [42]}`) is that same empty state — there is no
 * prose to summarize, so no card is shown and nothing claims otherwise; the
 * under-reporting that {@link DescriptionDigest.unattributed} exists to prevent
 * only arises once a card IS shown.
 *
 * `rules` is the final merged `packageRules` array (`result.finalConfig`), used
 * only to summarize a described rule's matchers.
 */
export function buildDescriptionDigest(
  provenance: DescriptionProvenance,
  rules?: readonly unknown[] | null,
): DescriptionDigest | null {
  const groups = new Map<string, MutableGroup>();

  // Insertion order IS merge order: the engine emits `entries` in final-array
  // order, and the final array is built layer by layer.
  for (const entry of provenance.entries) {
    const group = groupFor(groups, entry.viaTopLevel);
    group.entries.push({
      index: entry.index,
      value: entry.value,
      ...(entry.node ? { node: entry.node } : {}),
      ...(entry.duplicateOfIndex === undefined ? {} : { duplicateOfIndex: entry.duplicateOfIndex }),
      ...(entry.approximate ? { approximate: true } : {}),
    });
    if (entry.duplicateOfIndex === undefined) {
      group.behaviors++;
    }
  }

  // Only the REPO's own rules. A preset's rule descriptions are attributed to
  // the layer, not the writing node (069 PR 1's weaker granularity), and
  // `config:best-practices` alone carries hundreds of them — they belong to PR
  // 5's simulator annotation, where a rule is shown because it MATCHED. Here
  // they would bury the six sentences a reader came for.
  for (const rule of provenance.ruleDescriptions) {
    if (rule.layer.kind !== "repo") {
      continue;
    }
    const body = rules?.[rule.ruleIndex];
    groupFor(groups, rule.layer).rules.push({
      ruleIndex: rule.ruleIndex,
      sourceIndex: rule.sourceIndex,
      values: rule.values,
      selectors: summarizeRuleSelectors(body),
      writes: ruleWrittenKeys(body),
    });
  }

  const built: DigestGroup[] = [];
  const keyUses = new Map<string, number>();
  let behaviors = 0;
  let extendsCount = 0;
  let hasUserRules = false;
  for (const group of groups.values()) {
    behaviors += group.behaviors;
    if (group.layer.kind === "preset" && group.entries.length > 0) {
      extendsCount++;
    }
    hasUserRules ||= group.rules.length > 0;
    built.push({
      // Name-based key, disambiguated by how many groups of that name came
      // before it in merge order — stable across runs, unlike the node id.
      key: stableLayerKey(group.layer, keyUses),
      ...group,
    });
  }

  if (built.length === 0) {
    return null;
  }
  return {
    groups: built,
    totals: { behaviors, extendsCount, hasUserRules },
    degraded: provenance.degraded,
    unattributed: provenance.unattributed.length,
    finalLength: provenance.finalLength,
  };
}

/**
 * Does this digest have anything in the final top-level `description` array?
 *
 * A config whose only prose sits on its own `packageRules` still produces a
 * digest — those rule descriptions have no other home in the app — but it
 * produces no `description` key, so anything offering "see these in the
 * Effective config's description row" has to ask first, or promise a row that
 * does not exist.
 */
export function hasTopLevelDescriptions(digest: DescriptionDigest): boolean {
  return digest.groups.some((group) => group.entries.length > 0);
}

/**
 * The card's quiet footnote about the members no group can show: `2 members of
 * the description array are not text, so no preset can be credited with them`.
 * Empty when there are none — which is every well-formed config.
 *
 * Renovate accepts a wrong-typed member with a warning rather than a refusal
 * (069 PR 1), so this really does happen to real configs; the card summarizes
 * strings, and a summary that silently omits part of the array it is
 * summarizing is the thing this line exists to prevent.
 */
export function unattributedNoteText(digest: DescriptionDigest): string {
  const count = digest.unattributed;
  if (count === 0) {
    return "";
  }
  const members = count === 1 ? "member" : "members";
  const them = count === 1 ? "it" : "them";
  return `${nf.format(count)} ${members} of the description array ${count === 1 ? "is" : "are"} not text, so no preset can be credited with ${them}.`;
}

/**
 * The muted note under a user rule: `packageRules[0] — matchUpdateTypes →
 * minimumReleaseAge`.
 *
 * Cited by `sourceIndex`, NOT the merged `ruleIndex`: these are the repo's own
 * rules, and presets merge ahead of the repo — a config extending
 * `config:best-practices` puts the user's first rule at merged index ~297, a
 * number that appears nowhere in their editor. The repo-local index is the one
 * they can act on, and the one the editor cross-links use (App's
 * `packageRules[repoIndex]` jump).
 */
export function ruleNoteText(rule: DigestRule): string {
  const note = `packageRules[${rule.sourceIndex}] — ${rule.selectors}`;
  return rule.writes.length > 0 ? `${note} → ${rule.writes.join(", ")}` : note;
}
