import type * as EngineModule from "@renovate-config-debugger/engine";
import type { PresetNode } from "@renovate-config-debugger/engine";

/**
 * The root node's id — the input config itself, the one node the tree has no
 * row for (`flattenTree` starts at the root's CHILDREN). Anything offering
 * "show this node in the preset tree" must check for it first, or promise a
 * jump that lands nowhere.
 *
 * An app-local copy typed against the engine's `ROOT_NODE_ID` so drift fails
 * the build, without a static VALUE import that would pull the renovate chunk
 * into the initial bundle (the same pattern as 033's `STAGE_IDS`).
 */
export const ROOT_NODE_ID: typeof EngineModule.ROOT_NODE_ID = "root";

/**
 * The preset tree's derived facts: per-node/per-subtree contribution stats,
 * structural identities and the whole-expansion summary — one walk, reused by
 * the tree view, the flat table, the Presets tab badge and the Overview
 * digest. Pure computation, so it lives outside `PresetTree.tsx`: a component
 * module that also exports plain functions breaks Fast Refresh
 * (react/only-export-components), and App.tsx reads three of these directly.
 *
 * It sits in `lib/` rather than `components/` because nothing here is React or
 * DOM. `run-facts`, `tree-descriptions`, `description-attribution` and the
 * headless entry point (`headless.ts`, which promises the CLI "no React, no
 * DOM") all read it, and a shared derivation should not make its `lib/`
 * consumers reach up into the component layer.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** packageRules keys whose string contents feed the search index. */
const RULE_MATCH_KEYS = [
  "matchPackageNames",
  "matchDepNames",
  "matchPackagePatterns",
  "matchPackagePrefixes",
];

/**
 * Roadmap 029: does this preset change how Renovate behaves, or does it only
 * describe a group of packages? Nearly every internal preset carries a
 * `description`, and hundreds of them (every `monorepo:*`, every rule fragment
 * pulled into a `packageRules[n].extends`) consist purely of matchers — so
 * without both exclusions the digest's "only N of which set options" would
 * count a clear majority and its grouping-rules framing would read as false.
 */
const META_KEYS = new Set(["description", "$schema"]);
const GROUPING_KEYS = new Set(["groupName", "groupSlug"]);

/**
 * One key, under the same test: does setting it CHANGE how Renovate behaves?
 * Exported since 075 (iteration 5b) because the Presets ledger lists exactly
 * these keys per source — and a ledger that counted `description` among the
 * options a preset "set" would disagree with the digest's own count of
 * option-setting presets, which is this predicate applied to a whole node.
 */
export function isRealOptionKey(key: string): boolean {
  return (
    !META_KEYS.has(key) &&
    !GROUPING_KEYS.has(key) &&
    !key.startsWith("match") &&
    !key.startsWith("exclude")
  );
}

function setsRealOption(optionKeys: string[]): boolean {
  return optionKeys.some(isRealOptionKey);
}

/** Per-node contribution + search facts, all derived from the node's `input`. */
export interface NodeStats {
  /** Top-level option keys this preset sets (excludes extends/ignorePresets/packageRules). */
  ownOptions: number;
  optionKeys: string[];
  /** packageRules entries this preset contributes itself. */
  ownRules: number;
  /** Sets no top-level option and no packageRules of its own — a pure `extends` router. */
  zero: boolean;
  /** Lowercased name/source/option-key/package-string haystack for the filter box. */
  search: string;
  depth: number;
  /** Stable structural identity (name-path from root) for expansion persistence. */
  identity: string;
  /** Descendants (excluding self). */
  descResolved: number;
  descRules: number;
  /** Descendants that are contributing or non-resolved — i.e. would render something. */
  descContrib: number;
}

export interface TreeStats {
  statsById: Map<string, NodeStats>;
  nodesById: Map<string, PresetNode>;
  parents: Map<string, PresetNode>;
  identityById: Map<string, string>;
  idByIdentity: Map<string, string>;
  /** All occurrences of each preset name, in pre-order, for dedup cycling. */
  occurrencesByName: Map<string, PresetNode[]>;
  summary: TreeSummary;
}

export interface TreeSummary {
  resolved: number;
  fetched: number;
  internal: number;
  /** Distinct top-level option KEYS set across the whole expansion. */
  options: number;
  /** Roadmap 029: how many of the resolved presets set a real option (see
   *  `META_KEYS`) — the "only N of which set options, the rest are grouping
   *  rules" number. */
  optionSetting: number;
  rules: number;
  maxDepth: number;
  duplicates: number;
  errors: number;
}

function ownContribution(node: PresetNode): {
  ownOptions: number;
  optionKeys: string[];
  ownRules: number;
  search: string;
} {
  const parts: string[] = [node.name];
  const src = node.source;
  if (src) {
    for (const v of [src.presetSource, src.repo, src.presetPath, src.presetName, src.tag]) {
      if (v) {
        parts.push(v);
      }
    }
    if (src.params) {
      parts.push(...src.params);
    }
  }
  let ownOptions = 0;
  let ownRules = 0;
  const optionKeys: string[] = [];
  const input = node.input;
  if (isPlainObject(input)) {
    for (const key of Object.keys(input)) {
      if (key === "extends" || key === "ignorePresets" || key === "packageRules") {
        continue;
      }
      ownOptions++;
      optionKeys.push(key);
      parts.push(key);
    }
    const rules = input.packageRules;
    if (Array.isArray(rules)) {
      ownRules = rules.length;
      for (const rule of rules) {
        if (!isPlainObject(rule)) {
          continue;
        }
        for (const mk of RULE_MATCH_KEYS) {
          const arr = rule[mk];
          if (Array.isArray(arr)) {
            for (const s of arr) {
              if (typeof s === "string") {
                parts.push(s);
              }
            }
          }
        }
      }
    }
  }
  return { ownOptions, optionKeys, ownRules, search: parts.join(" ").toLowerCase() };
}

/**
 * Roadmap 032: one walk per RESULT, not per caller. The tree object is
 * immutable once a run produces it, and App (tab badge + digest via
 * `presetTreeSummary`, identity lookups for share links) and PresetTree all
 * need the same facts for the same tree — so the walk is cached on the tree
 * object itself. This also structurally enforces the 029 invariant that the
 * Presets badge and the digest quote one number: previously upheld by
 * re-running the same function, now they literally read one `TreeStats`.
 */
const treeStatsCache = new WeakMap<PresetNode, TreeStats>();

/** Single walk: per-node/per-subtree stats, identities, occurrences and totals. */
export function computeTreeStats(root: PresetNode): TreeStats {
  const cached = treeStatsCache.get(root);
  if (cached) {
    return cached;
  }
  const stats = computeTreeStatsUncached(root);
  treeStatsCache.set(root, stats);
  return stats;
}

function computeTreeStatsUncached(root: PresetNode): TreeStats {
  const statsById = new Map<string, NodeStats>();
  const nodesById = new Map<string, PresetNode>();
  const parents = new Map<string, PresetNode>();
  const identityById = new Map<string, string>();
  const idByIdentity = new Map<string, string>();
  const occurrencesByName = new Map<string, PresetNode[]>();
  let maxDepth = 0;

  // Returns subtree aggregates INCLUDING self so the parent can roll them up.
  const visit = (
    node: PresetNode,
    identity: string,
    depth: number,
  ): { resolved: number; rules: number; contrib: number } => {
    nodesById.set(node.id, node);
    identityById.set(node.id, identity);
    if (!idByIdentity.has(identity)) {
      idByIdentity.set(identity, node.id);
    }
    if (node !== root) {
      const list = occurrencesByName.get(node.name);
      if (list) {
        list.push(node);
      } else {
        occurrencesByName.set(node.name, [node]);
      }
    }
    maxDepth = Math.max(maxDepth, depth);

    const { ownOptions, optionKeys, ownRules, search } = ownContribution(node);
    const zero = ownOptions === 0 && ownRules === 0;
    const selfResolved = node.state === "resolved" ? 1 : 0;
    const selfContrib = node.state !== "resolved" || !zero ? 1 : 0;

    let aggResolved = selfResolved;
    let aggRules = ownRules;
    let aggContrib = selfContrib;

    // Disambiguate identical-named siblings by occurrence index.
    const nameCounts = new Map<string, number>();
    for (const child of node.children) {
      const seen = nameCounts.get(child.name) ?? 0;
      nameCounts.set(child.name, seen + 1);
      const childIdentity = `${identity}>${child.name}${seen > 0 ? `#${seen}` : ""}`;
      parents.set(child.id, node);
      const sub = visit(child, childIdentity, depth + 1);
      aggResolved += sub.resolved;
      aggRules += sub.rules;
      aggContrib += sub.contrib;
    }

    statsById.set(node.id, {
      ownOptions,
      optionKeys,
      ownRules,
      zero,
      search,
      depth,
      identity,
      descResolved: aggResolved - selfResolved,
      descRules: aggRules - ownRules,
      descContrib: aggContrib - selfContrib,
    });

    return { resolved: aggResolved, rules: aggRules, contrib: aggContrib };
  };

  visit(root, "", 0);

  // Totals attributed per UNIQUE resolved preset name (duplicates served from
  // cache do not re-contribute), so the header reads as the honest cost.
  const seen = new Set<string>();
  const optionUnion = new Set<string>();
  let fetched = 0;
  let internal = 0;
  let optionSetting = 0;
  let rules = 0;
  let duplicates = 0;
  let errors = 0;
  for (const node of nodesById.values()) {
    if (node === root) {
      continue;
    }
    if (node.duplicate) {
      duplicates++;
    }
    if (node.state === "error") {
      errors++;
    }
    if (node.state !== "resolved" || seen.has(node.name)) {
      continue;
    }
    seen.add(node.name);
    const st = statsById.get(node.id);
    if (!st) {
      continue;
    }
    const kind = node.source?.presetSource ?? "internal";
    if (kind === "internal") {
      internal++;
    } else {
      fetched++;
    }
    rules += st.ownRules;
    if (setsRealOption(st.optionKeys)) {
      optionSetting++;
    }
    for (const k of st.optionKeys) {
      optionUnion.add(k);
    }
  }

  return {
    statsById,
    nodesById,
    parents,
    identityById,
    idByIdentity,
    occurrencesByName,
    summary: {
      resolved: seen.size,
      fetched,
      internal,
      options: optionUnion.size,
      optionSetting,
      rules,
      maxDepth,
      duplicates,
      errors,
    },
  };
}

/**
 * Structural identity (`>`-joined name-path) of a node id in this result's
 * tree, or null. Identities are stable across re-runs of the same config, so
 * they are what a shareable link (007) stores for the selected node. Reuses the
 * same single-walk machinery the tree renders with.
 */
export function identityForNodeId(root: PresetNode, id: string): string | null {
  return computeTreeStats(root).identityById.get(id) ?? null;
}

/** The current run's node id for a stored structural identity, or null. */
export function nodeIdForIdentity(root: PresetNode, identity: string): string | null {
  return computeTreeStats(root).idByIdentity.get(identity) ?? null;
}

/**
 * Roadmap 028/029: the expansion totals the Presets tab badge and the Overview
 * digest report — derived from the same single walk (and therefore always the
 * same numbers) as the tree's own summary header. Null when the run resolved
 * no tree at all.
 */
export function presetTreeSummary(root: PresetNode | null | undefined): TreeSummary | null {
  return root ? computeTreeStats(root).summary : null;
}
