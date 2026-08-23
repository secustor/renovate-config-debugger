import { isPlainObject } from "../lib";
import { getDefaultConfig, internalPresetGroups } from "../renovate-adapter";
import type { PresetNode, TraceResult } from "./model";
import { computeRuleProvenance, type ProvenanceLayer } from "./provenance";

/**
 * Roadmap 069: per-string `description` provenance.
 *
 * `description` is an ordinary mergeable array option (`type: "array"`,
 * `subType: "string"`, `allowString: true`), so every preset's author-written
 * sentence is concatenated — never deduplicated — into one flat top-level
 * array. The link back to the preset that wrote each sentence is lost the
 * moment the merge happens. This module restores it.
 *
 * The reconstruction is POSITIONAL, not value-matching: `resolveConfigPresets`
 * resolves each entry of `extends` in order (each subtree already flattened)
 * and merges the node's OWN body LAST, and `mergeChildConfig` concatenates
 * arrays in encounter order. Replaying that depth-first order over the preset
 * tree therefore reproduces the exact index of every string, so two nodes that
 * happen to write the same sentence still attribute to their own node.
 *
 * Three Renovate quirks silently delete descriptions before they ever reach
 * the merge — all three are reported in `dropped` rather than left unexplained:
 *
 * - **wrapper-preset** — `getPreset` deletes the description of a preset whose
 *   keys are exactly `{description, extends}` (e.g. `config:best-practices`).
 * - **package-list-preset** — same, for a preset whose keys are a subset of
 *   `{description, matchPackageNames}`.
 * - **ignore-deps-quirk** — a config carrying `ignoreDeps: []` (length zero)
 *   makes `resolveConfigPresets` delete the WHOLE resolved description of every
 *   preset it extends.
 *
 * The first two happen inside `getPreset`, i.e. before the node's `input` is
 * captured, so they are detected from the node's raw pre-migration body — not
 * predicted. Which body that is takes some care, because Renovate mutates its
 * own preset table; see `INTERNAL_DROPS` below.
 *
 * Correctness is self-checked: at every node the replayed sequence is compared
 * against that node's ground-truth `resolved.description`. Where they disagree
 * the subtree degrades to the enclosing node — every string of the ground truth
 * is attributed to that node with `approximate: true` — rather than throwing or
 * guessing a leaf. An honest "contributed by subtree X" beats a confident wrong
 * leaf, and because the fallback re-seeds from ground truth, one bad subtree
 * cannot desynchronise its parent's indices.
 *
 * A `description` array may also hold non-strings: Renovate only WARNS about
 * `{"description": ["a", 42]}`, so the `42` survives into the final array and
 * occupies a real index. The replay pairs string members only, but every
 * `index` reported here is the member's position in the REAL final array, and
 * the non-strings are listed separately in `unattributed` — no preset wrote
 * them, and skipping them silently would shift every position after them.
 */

/** The preset-tree node a string (or a drop) is attributed to. */
export interface DescriptionSource {
  /** `PresetNode.id`; `ROOT_NODE_ID` for the repo config itself. */
  nodeId: string;
  /** Raw preset string as written in `extends`; `"(input config)"` for the root. */
  name: string;
}

export interface DescriptionAttribution {
  /** 0-based index into the final top-level `description` array (the canonical index). */
  index: number;
  value: string;
  /**
   * The node whose OWN body wrote this string. Absent for strings contributed
   * by layers that have no preset tree (defaults / global / inherited).
   */
  node?: DescriptionSource;
  /** The top-level layer this string arrived through (same identity `computeProvenance` uses). */
  viaTopLevel: ProvenanceLayer;
  /** Index of the first value-equal entry, when this entry repeats an earlier one. */
  duplicateOfIndex?: number;
  /**
   * The exact writing node could not be determined; `node` names the nearest
   * enclosing subtree instead (see the fallback semantics above).
   */
  approximate?: boolean;
}

export type DroppedDescriptionReason =
  | "wrapper-preset"
  | "package-list-preset"
  | "ignore-deps-quirk";

export interface DroppedDescription {
  value: string;
  /** The node that authored the string. */
  node: DescriptionSource;
  reason: DroppedDescriptionReason;
  /** `ignore-deps-quirk` only: the extending node whose `ignoreDeps: []` deleted it. */
  droppedBy?: DescriptionSource;
  /**
   * The authoring node is a guess: the drop came out of a subtree that had
   * already degraded to its enclosing node (see the fallback semantics above),
   * so `node` names that subtree rather than the exact writer. Never set on the
   * two `getPreset` drops, which are read off a pristine body.
   */
  approximate?: boolean;
}

/**
 * A member of the final top-level `description` array that is not a string.
 * Renovate warns about these but keeps them, so they hold a real index; no
 * preset attribution exists for them, hence the separate list.
 */
export interface UnattributedDescription {
  /** 0-based index into the final top-level `description` array. */
  index: number;
  value: unknown;
}

/**
 * `packageRules[n].description` is never hoisted to the top level, so it is
 * attributed separately — and only to the LAYER that contributed the rule
 * (which is all `computeRuleProvenance` knows), not to the exact node.
 */
export interface RuleDescriptionAttribution {
  /** 0-based index into the final merged `packageRules` array. */
  ruleIndex: number;
  /** 0-based index within the contributing layer's own `packageRules` array. */
  sourceIndex: number;
  layer: ProvenanceLayer;
  values: string[];
}

export interface DescriptionProvenance {
  /** Every string of the final top-level `description`, in order. */
  entries: DescriptionAttribution[];
  /** Non-string members of that same array, which carry no attribution. */
  unattributed: UnattributedDescription[];
  /**
   * Length of the real final `description` array — `entries.length +
   * unattributed.length` — so "position N of M" needs no re-derivation.
   */
  finalLength: number;
  /** Descriptions Renovate deleted before they could merge. */
  dropped: DroppedDescription[];
  /** Descriptions living on merged `packageRules` entries. */
  ruleDescriptions: RuleDescriptionAttribution[];
  /** At least one entry needed the enclosing-node fallback. */
  degraded: boolean;
}

/**
 * A config body's `description` as the array Renovate holds. `input`/`resolved`
 * are already massaged (so `allowString` has coerced `"x"` to `["x"]`), but raw
 * `fetched` bodies are not — and a hand-injected preset may be anything — so
 * the string form is still coerced here. Members are returned untouched,
 * non-strings included: they are real positions in the array.
 */
function descriptionMembersOf(body: unknown): unknown[] {
  if (!isPlainObject(body)) {
    return [];
  }
  const value = body.description;
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value : [];
}

/**
 * The description STRINGS of a config body — the only members a preset can be
 * held responsible for, and the sequence the positional replay works in.
 * Non-strings are excluded here and accounted for separately against the final
 * array (`unattributed`), so excluding them never shifts a reported index.
 */
function descriptionsOf(body: unknown): string[] {
  return descriptionMembersOf(body).filter((item): item is string => typeof item === "string");
}

function sourceOf(node: PresetNode): DescriptionSource {
  return { nodeId: node.id, name: node.name };
}

/** Same participant filter `buildLayers` uses: nested nodes merge inside their
 *  parent's value, and unresolved ones never merged at all. */
function mergingChildren(node: PresetNode): PresetNode[] {
  return node.children.filter(
    (child) => !child.nested && child.state === "resolved" && child.resolved !== undefined,
  );
}

/** Renovate's `inputConfig?.ignoreDeps?.length === 0` guard, on a node's own body. */
function dropsChildDescriptions(node: PresetNode): boolean {
  const input = node.input;
  return isPlainObject(input) && Array.isArray(input.ignoreDeps) && input.ignoreDeps.length === 0;
}

/**
 * Renovate's two `getPreset` deletions, evaluated on the same keys Renovate
 * evaluates them on: the fetched body after parameter substitution, before
 * migration. Returns the reason, or undefined when the body keeps its
 * description.
 */
function getPresetDropReason(raw: unknown): DroppedDescriptionReason | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const keys = Object.keys(raw);
  if (!keys.includes("description")) {
    return undefined;
  }
  if (keys.length === 2 && keys.includes("extends")) {
    return "wrapper-preset";
  }
  if (keys.every((key) => key === "description" || key === "matchPackageNames")) {
    return "package-list-preset";
  }
  return undefined;
}

interface DropInfo {
  reason: DroppedDescriptionReason;
  values: string[];
}

/**
 * Renovate's internal preset table hands out its module-level objects BY
 * REFERENCE (`internal/index.js`'s `getPreset` is a two-level lookup, no
 * clone), so `getPreset`'s `delete presetConfig.description` permanently
 * removes the description from the table. Renovate resolves a config once per
 * process and never notices; this app resolves one on every keystroke, so from
 * the second run on the deleted description is simply gone — including from
 * the `fetched` body the trace records.
 *
 * Hence this index, built ONCE at module load (i.e. when the engine chunk is
 * imported, always before a run) from the pristine table: the authoritative
 * answer to "which internal preset lost its own description, and what did it
 * say". Nothing is mutated — Renovate's behavior is left exactly as it is.
 *
 * Presets reached with parameters are not in here and do not need to be:
 * `replaceArgs` clones before the delete, so their `afterParams` body is
 * pristine on every run.
 */
const INTERNAL_DROPS: ReadonlyMap<string, DropInfo> = buildInternalDropIndex();

function buildInternalDropIndex(): Map<string, DropInfo> {
  const index = new Map<string, DropInfo>();
  for (const [group, presets] of Object.entries(internalPresetGroups)) {
    for (const [name, body] of Object.entries(presets)) {
      const reason = getPresetDropReason(body);
      if (!reason) {
        continue;
      }
      const info: DropInfo = { reason, values: descriptionsOf(body) };
      // `default:` presets are written both ways in `extends`.
      for (const alias of group === "default"
        ? [`:${name}`, `default:${name}`]
        : [`${group}:${name}`]) {
        index.set(alias, info);
      }
    }
  }
  return index;
}

/**
 * The description `getPreset` deleted from a node's own body, if any. Sources,
 * in order of trustworthiness: a node that still HAS a description lost
 * nothing; `afterParams` is a pristine clone; the internal index survives
 * re-runs; a hosted preset's `fetched` body is pristine because the preset
 * cache is re-initialised per run.
 */
function droppedOwnDescription(node: PresetNode): DropInfo | undefined {
  if (descriptionsOf(node.input).length > 0) {
    return undefined;
  }
  if (node.afterParams === undefined) {
    const internal = INTERNAL_DROPS.get(node.name);
    if (internal) {
      return internal;
    }
  }
  const raw = node.afterParams ?? node.fetched;
  const reason = getPresetDropReason(raw);
  return reason ? { reason, values: descriptionsOf(raw) } : undefined;
}

/** One string contributed by one node, before it is placed in the final array.
 *  `node` is absent only for the defaults/global/inherited layers, which have
 *  no preset tree of their own. */
interface Contribution {
  value: string;
  node?: DescriptionSource;
  approximate?: boolean;
}

interface WalkResult {
  contributions: Contribution[];
  degraded: boolean;
}

function recordOwnDrop(node: PresetNode, dropped: DroppedDescription[]): void {
  const info = droppedOwnDescription(node);
  if (!info) {
    return;
  }
  for (const value of info.values) {
    dropped.push({ value, node: sourceOf(node), reason: info.reason });
  }
}

function valuesMatch(contributions: Contribution[], truth: string[]): boolean {
  return (
    contributions.length === truth.length && contributions.every((c, i) => c.value === truth[i])
  );
}

/**
 * Everything one merging child of `parent` contributes: its own `getPreset`
 * drop, its subtree, and — when `quirk` says the parent carries
 * `ignoreDeps: []` — the diversion of that whole subtree into `dropped`,
 * leaving nothing to merge. Shared by `walk` and the root level, which differ
 * only in what they do with the returned contributions.
 */
function processChild(
  parent: PresetNode,
  child: PresetNode,
  quirk: boolean,
  dropped: DroppedDescription[],
): WalkResult {
  recordOwnDrop(child, dropped);
  const sub = walk(child, dropped);
  if (!quirk) {
    return sub;
  }
  for (const contribution of sub.contributions) {
    dropped.push({
      value: contribution.value,
      node: contribution.node ?? sourceOf(child),
      reason: "ignore-deps-quirk",
      droppedBy: sourceOf(parent),
      // a guessed author stays labelled as a guess once it is a drop
      ...(contribution.approximate ? { approximate: true } : {}),
    });
  }
  return { contributions: [], degraded: sub.degraded };
}

/**
 * Replays one `resolveConfigPresets` invocation: every merging child in
 * `extends` order (each already flattened), then the node's own body last —
 * then checks the result against the node's ground-truth `resolved`.
 */
function walk(node: PresetNode, dropped: DroppedDescription[]): WalkResult {
  const contributions: Contribution[] = [];
  let degraded = false;
  const quirk = dropsChildDescriptions(node);

  for (const child of mergingChildren(node)) {
    const sub = processChild(node, child, quirk, dropped);
    degraded ||= sub.degraded;
    contributions.push(...sub.contributions);
  }

  for (const value of descriptionsOf(node.input)) {
    contributions.push({ value, node: sourceOf(node) });
  }

  if (node.resolved === undefined) {
    return { contributions, degraded };
  }
  const truth = descriptionsOf(node.resolved);
  if (valuesMatch(contributions, truth)) {
    return { contributions, degraded };
  }
  // Re-seed from ground truth so the parent's indices stay aligned.
  return {
    contributions: truth.map((value) => ({ value, node: sourceOf(node), approximate: true })),
    degraded: true,
  };
}

/**
 * The `defaults` layer's descriptions (none, in every Renovate to date, but
 * read rather than assumed). `getDefaultConfig()` rebuilds the whole option
 * table on every call, so — like `INTERNAL_DROPS` — it is paid for once and
 * cached at module level; the defaults cannot change within a process.
 */
let cachedDefaultDescriptions: string[] | undefined;

function defaultDescriptions(): string[] {
  cachedDefaultDescriptions ??= descriptionsOf(getDefaultConfig());
  return cachedDefaultDescriptions;
}

/** A top-level layer's contribution, before indices are assigned. */
interface LayerContribution {
  layer: ProvenanceLayer;
  contributions: Contribution[];
}

function ruleDescriptions(result: TraceResult): RuleDescriptionAttribution[] {
  const attribution = computeRuleProvenance(result);
  if (!attribution) {
    return [];
  }
  const rules = result.finalConfig?.packageRules;
  if (!Array.isArray(rules)) {
    return [];
  }
  const out: RuleDescriptionAttribution[] = [];
  for (const { index, layer, sourceIndex } of attribution) {
    const values = descriptionsOf(rules[index]);
    if (values.length > 0) {
      out.push({ ruleIndex: index, sourceIndex, layer, values });
    }
  }
  return out;
}

/**
 * Attributes every string of a completed run's final top-level `description`
 * array to the preset-tree node that wrote it, or `undefined` when the run
 * lacks the data it needs (mirrors `computeProvenance`'s availability: no final
 * config, or preset resolution did not finish so the root has no
 * `resolved`/`input`).
 *
 * Unlike `computeRuleProvenance` this never returns `undefined` for a
 * misaligned replay — a description is prose, so a conservative
 * "contributed by subtree X" is still useful; `degraded` (and per-entry
 * `approximate`) say when that happened.
 */
export function computeDescriptionProvenance(
  result: TraceResult,
): DescriptionProvenance | undefined {
  const { finalConfig } = result;
  const root = result.presetTree;
  if (!finalConfig || !root || root.resolved === undefined || root.input === undefined) {
    return undefined;
  }

  const dropped: DroppedDescription[] = [];
  let degraded = false;

  // Layers merging ahead of the repo's own resolution (008). Neither has a
  // preset tree of its own here, so their strings carry no node.
  const layered: LayerContribution[] = [];
  const prefix: [ProvenanceLayer, string[]][] = [
    [{ kind: "defaults" }, defaultDescriptions()],
    [{ kind: "global" }, descriptionsOf(result.layerConfigs?.globalResolved)],
    [{ kind: "inherited" }, descriptionsOf(result.layerConfigs?.inheritedResolved)],
  ];
  for (const [layer, values] of prefix) {
    if (values.length > 0) {
      layered.push({ layer, contributions: values.map((value) => ({ value })) });
    }
  }
  const externalLayerCount = layered.length;

  // The root level is walked here rather than through `walk` so that each
  // string keeps the direct-extend layer it arrived through.
  const rootQuirk = dropsChildDescriptions(root);
  const rootContributions: Contribution[] = [];
  for (const child of mergingChildren(root)) {
    const sub = processChild(root, child, rootQuirk, dropped);
    degraded ||= sub.degraded;
    if (rootQuirk) {
      continue;
    }
    layered.push({
      layer: { kind: "preset", nodeId: child.id, name: child.name },
      contributions: sub.contributions,
    });
    rootContributions.push(...sub.contributions);
  }
  const ownContributions: Contribution[] = descriptionsOf(root.input).map((value) => ({
    value,
    node: sourceOf(root),
  }));
  rootContributions.push(...ownContributions);
  layered.push({ layer: { kind: "repo" }, contributions: ownContributions });

  // Ground truth for the repo's own resolution: if the per-preset split does
  // not reproduce it, collapse the whole repo level onto the root node.
  const rootTruth = descriptionsOf(root.resolved);
  if (!valuesMatch(rootContributions, rootTruth)) {
    degraded = true;
    layered.length = externalLayerCount;
    layered.push({
      layer: { kind: "repo" },
      contributions: rootTruth.map((value) => ({
        value,
        node: sourceOf(root),
        approximate: true,
      })),
    });
  }

  const flat: { layer: ProvenanceLayer; contribution: Contribution }[] = [];
  for (const { layer, contributions } of layered) {
    for (const contribution of contributions) {
      flat.push({ layer, contribution });
    }
  }

  // Ground truth for the whole run. Post-resolution re-migration (052) and the
  // 008 layers both act between `root.resolved` and `finalConfig`, so the final
  // array — not the replay — decides how many members there are. Its non-string
  // members (Renovate warns, but keeps them) take no part in the replay yet
  // still hold their index, so the replay is consumed by a separate cursor and
  // every reported index is the member's REAL position.
  const finalMembers = descriptionMembersOf(finalConfig);
  const entries: DescriptionAttribution[] = [];
  const unattributed: UnattributedDescription[] = [];
  const firstIndexByValue = new Map<string, number>();
  let replayCursor = 0;
  for (const [index, member] of finalMembers.entries()) {
    if (typeof member !== "string") {
      unattributed.push({ index, value: member });
      continue;
    }
    const aligned = flat[replayCursor];
    replayCursor += 1;
    const matched = aligned?.contribution.value === member ? aligned : undefined;
    if (!matched) {
      degraded = true;
    }
    const contribution = matched?.contribution;
    const approximate = contribution?.approximate ?? !matched;
    const node = contribution?.node;
    const firstIndex = firstIndexByValue.get(member);
    entries.push({
      index,
      value: member,
      ...(node ? { node } : {}),
      viaTopLevel: matched?.layer ?? { kind: "repo" },
      ...(approximate ? { approximate: true } : {}),
      ...(firstIndex === undefined ? {} : { duplicateOfIndex: firstIndex }),
    });
    if (firstIndex === undefined) {
      firstIndexByValue.set(member, index);
    }
  }

  return {
    entries,
    unattributed,
    finalLength: finalMembers.length,
    dropped,
    ruleDescriptions: ruleDescriptions(result),
    degraded,
  };
}
