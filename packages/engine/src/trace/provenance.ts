import { allowStringMembers, isPlainObject } from "../lib";
import { getDefaultConfig, getOptions, mergeChildConfig } from "../renovate-adapter";
import type { PresetNode, TraceResult } from "./model";
import { mergingChildren, walkResolutionOrder } from "./tree";

/**
 * Roadmap 005: per-key merge provenance. Computed post-hoc from the trace data
 * the engine already captures (the preset tree + final config + 008 layer
 * configs) by replaying Renovate's real `mergeChildConfig` over the top-level
 * layers — defaults, then the global and inherited layers (when provided),
 * then each directly-extended preset in order, then the repo config — and
 * attributing every top-level key to the layer(s) that produced its final
 * value.
 *
 * No Renovate instrumentation is involved: `mergeChildConfig` is pure, so the
 * replay reproduces the pipeline's merge exactly. The replay is top-level only
 * (`root.children`, not the whole tree), so it is a handful of merges even for
 * `config:recommended`.
 */

/** How a layer touched a key, in Renovate's merge semantics. */
export type ProvenanceAction =
  | "set"
  | "overwrite"
  | "concat"
  | "shallow-merge"
  | "deep-merge"
  | "forced";

/** Which layer a step is attributed to. */
export type ProvenanceLayer =
  | { kind: "defaults" }
  | { kind: "global" }
  | { kind: "inherited" }
  | { kind: "preset"; nodeId: string; name: string }
  | { kind: "repo" };

export interface ProvenanceStep {
  layer: ProvenanceLayer;
  action: ProvenanceAction;
  /** The value this layer merged onto (the losing value for overwrite/forced). */
  before: unknown;
  /** The key's value after this layer's contribution. */
  after: unknown;
  /** Contribution that did not change the value (empty-array concat, defaulted-then-overridden). */
  noop?: boolean;
  /** The key's value was further expanded by Renovate's nested-`extends` pass. */
  expandedNested?: boolean;
  /**
   * The preset-tree node whose OWN body wrote this step's value — a preset
   * NESTED below the direct extend `layer` names (`docker:pinDigests` writing
   * what `config:best-practices` carries in). Present only when the step's
   * layer is a preset, the writer is not that direct extend itself, and the
   * subtree replay could VERIFY the writer's own value against the extend's
   * ground-truth `resolved` — the same honesty rule `description-provenance`
   * follows: no confident wrong leaf, absence over a guess.
   */
  writtenBy?: { nodeId: string; name: string };
}

export interface KeyProvenance {
  key: string;
  finalValue: unknown;
  /** No global/inherited/preset/repo layer touched this key — a pure untouched default. */
  isDefaultOnly: boolean;
  /** Chronological chain: defaults first (when present), then global/inherited, presets in order, repo. */
  chain: ProvenanceStep[];
}

type Obj = Record<string, unknown>;

/** Structural equality over JSON-shaped values (also used by resolved-config.ts). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return (
      ak.length === bk.length &&
      ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
    );
  }
  return false;
}

interface Layer {
  layer: ProvenanceLayer;
  config: Obj;
  /** The tree node behind a preset layer — what the writer walk descends into. */
  node?: PresetNode;
  /** Keys this layer REPLACES rather than merges, whatever the option's
   *  `mergeable` flag says — `overrideDescription` is the only one. */
  replaces?: ReadonlySet<string>;
}

/**
 * Top-level merge layers, in the order Renovate merges them: the 008 layers
 * (global, then inherited — already assembled by the pipeline, i.e. extends
 * resolved and captured/global-only options stripped), then presets, then repo.
 */
function buildLayers(root: PresetNode, layerConfigs: TraceResult["layerConfigs"]): Layer[] {
  const layers: Layer[] = [];
  if (layerConfigs?.globalResolved) {
    layers.push({ layer: { kind: "global" }, config: layerConfigs.globalResolved });
  }
  if (layerConfigs?.inheritedResolved) {
    layers.push({ layer: { kind: "inherited" }, config: layerConfigs.inheritedResolved });
  }
  for (const child of mergingChildren(root)) {
    layers.push({
      layer: { kind: "preset", nodeId: child.id, name: child.name },
      config: child.resolved as Obj,
      node: child,
    });
  }
  const repo = structuredClone(root.input) as Obj;
  // `overrideDescription` is consumed into `description`, replacing everything
  // the presets appended — so the repo layer contributes it as the OVERWRITE it
  // is, not as the append `description` normally gets. (Which sentence each
  // preset lost is 069's ledger, not this chain's.)
  const override = allowStringMembers(repo.overrideDescription);
  const replaces = override.length > 0 ? new Set(["description"]) : undefined;
  if (replaces) {
    repo.description = override;
  }
  for (const key of RESOLUTION_KEYS) {
    delete repo[key];
  }
  layers.push({ layer: { kind: "repo" }, config: repo, ...(replaces ? { replaces } : {}) });
  return layers;
}

/**
 * Keys `resolveConfigPresets` consumes and deletes — never a body's own
 * contribution to a final value, so a chain that showed one would claim a
 * winner the final config contradicts. `overrideDescription` is consumed into
 * `description`; where its sentences went is the description ledger's story
 * (069), not this key's.
 */
const RESOLUTION_KEYS = new Set(["extends", "ignorePresets", "overrideDescription"]);

interface KeyWriter {
  /** Last node in resolution order whose own body carries the key — the
   *  winner for a non-mergeable key. */
  last: PresetNode;
  /** How many bodies in the subtree carry it. */
  count: number;
}

/**
 * Which body wrote each key of a direct extend's subtree, by walking it in
 * `resolveConfigPresets`' own merge order — so the LAST body to carry a key is
 * that key's winner under `mergeChildConfig`'s overwrite semantics.
 */
function collectWriters(node: PresetNode, index: Map<string, KeyWriter>): void {
  walkResolutionOrder(node, (visited) => {
    const input = visited.input;
    if (!isPlainObject(input)) {
      return;
    }
    for (const key of Object.keys(input)) {
      if (RESOLUTION_KEYS.has(key)) {
        continue;
      }
      const existing = index.get(key);
      if (existing) {
        existing.last = visited;
        existing.count += 1;
      } else {
        index.set(key, { last: visited, count: 1 });
      }
    }
  });
}

/**
 * Computes per-top-level-key provenance for a completed run, or `undefined`
 * when the run lacks the data it needs (no final config, or preset resolution
 * did not finish so the root has no `resolved`/`input`).
 */
export function computeProvenance(result: TraceResult): Map<string, KeyProvenance> | undefined {
  const { finalConfig } = result;
  const root = result.presetTree;
  if (!finalConfig || !root || root.resolved === undefined || root.input === undefined) {
    return undefined;
  }

  const optionMap = new Map<string, { mergeable: boolean; type: string }>();
  for (const opt of getOptions()) {
    optionMap.set(opt.name, { mergeable: Boolean(opt.mergeable), type: opt.type });
  }

  const defaults = getDefaultConfig() as Obj;
  const resolved = root.resolved as Obj;
  const layers = buildLayers(root, result.layerConfigs);
  // 008 layers merge before any preset; their accumulated result is the base
  // the repo-level resolution (ground truth `resolved`) merged onto.
  const baseLayerCount = layers.filter(
    (l) => l.layer.kind === "global" || l.layer.kind === "inherited",
  ).length;

  const chains = new Map<string, ProvenanceStep[]>();
  const lastLayerIndex = new Map<string, number>();

  // The writer walk, one index per direct extend, built on first use. The
  // verification is against the extend's own ground-truth `resolved` — the
  // exact value the layer contributes to the top merge — so a migration,
  // in-subtree merge, or force that reshapes the value simply yields no
  // writer rather than a wrong one.
  const writerIndexes = new Map<string, Map<string, KeyWriter>>();
  const writtenBy = (
    node: PresetNode,
    key: string,
    mergeable: boolean,
  ): ProvenanceStep["writtenBy"] => {
    let index = writerIndexes.get(node.id);
    if (!index) {
      index = new Map();
      collectWriters(node, index);
      writerIndexes.set(node.id, index);
    }
    const writer = index.get(key);
    // The direct extend writing its own key is what the layer already says; a
    // mergeable key with several writers has no single writer to name.
    if (!writer || writer.last.id === node.id || (mergeable && writer.count > 1)) {
      return undefined;
    }
    const own = writer.last.input;
    const truth = node.resolved;
    if (!isPlainObject(own) || !isPlainObject(truth) || !deepEqual(own[key], truth[key])) {
      return undefined;
    }
    return { nodeId: writer.last.id, name: writer.last.name };
  };

  const pushStep = (key: string, step: ProvenanceStep, layerIndex: number): void => {
    let arr = chains.get(key);
    if (!arr) {
      arr = [];
      chains.set(key, arr);
    }
    arr.push(step);
    lastLayerIndex.set(key, layerIndex);
  };

  // Replay the layer/preset/repo merge, attributing each key the incoming
  // layer owns.
  let acc: Obj = {};
  let accBase: Obj = {};
  for (const [layerIndex, { layer, config, node, replaces }] of layers.entries()) {
    const before = acc;
    const after = mergeChildConfig(structuredClone(before), structuredClone(config)) as Obj;
    for (const key of replaces ?? []) {
      after[key] = structuredClone(config[key]);
    }
    if (layerIndex < baseLayerCount) {
      accBase = after;
    }

    for (const key of Object.keys(config)) {
      const opt = optionMap.get(key);
      const parentVal = before[key];
      const childVal = config[key];
      const mergeableBranch =
        !replaces?.has(key) && Boolean(opt?.mergeable) && Boolean(parentVal) && Boolean(childVal);
      let action: ProvenanceAction;
      let noop = false;
      if (mergeableBranch) {
        if (key === "constraints") {
          action = "shallow-merge";
        } else if (opt?.type === "array") {
          action = "concat";
          noop = Array.isArray(childVal) && childVal.length === 0;
        } else {
          action = "deep-merge";
        }
      } else {
        action = parentVal === undefined ? "set" : "overwrite";
      }
      const writer = node ? writtenBy(node, key, Boolean(opt?.mergeable)) : undefined;
      pushStep(
        key,
        {
          layer,
          action,
          before: parentVal,
          after: after[key],
          ...(noop ? { noop: true } : {}),
          ...(writer ? { writtenBy: writer } : {}),
        },
        layerIndex,
      );
    }

    // `mergeChildConfig` re-flattens `config.force` over the top-level keys on
    // every call, so a force-sourced win must be attributed to this layer.
    const force = isPlainObject(after.force) ? after.force : undefined;
    if (force) {
      for (const fkey of Object.keys(force)) {
        const finalVal = after[fkey];
        const arr = chains.get(fkey);
        const last = arr?.at(-1);
        if (last && last.action === "forced" && deepEqual(last.after, finalVal)) {
          continue; // already forced to this exact value by an earlier layer
        }
        if (arr && last && lastLayerIndex.get(fkey) === layerIndex) {
          // this layer just recorded a step for the key — force overrides it
          arr[arr.length - 1] = { layer, action: "forced", before: last.before, after: finalVal };
        } else {
          pushStep(
            fkey,
            { layer, action: "forced", before: before[fkey], after: finalVal },
            layerIndex,
          );
        }
      }
    }

    acc = after;
  }

  // Renovate runs a final nested-`extends` expansion over the combined config,
  // which further resolves repo-supplied nested extends (e.g. packageRules[n].
  // extends) that the plain replay leaves unexpanded. Correct those keys from
  // the ground-truth resolved config and tag the responsible step. With 008
  // layers present the expectation is `resolved` merged onto the layers'
  // accumulated base — a global packageRules entry legitimately makes the
  // replay differ from the repo-only `resolved` without any nested expansion.
  const expected =
    baseLayerCount > 0
      ? (mergeChildConfig(structuredClone(accBase), structuredClone(resolved)) as Obj)
      : resolved;
  for (const key of Object.keys(resolved)) {
    const arr = chains.get(key);
    if (arr && arr.length > 0 && !deepEqual(acc[key], expected[key])) {
      const last = arr[arr.length - 1];
      if (last) {
        arr[arr.length - 1] = { ...last, after: expected[key], expandedNested: true };
      }
      acc[key] = expected[key];
    }
  }

  // Assemble per key of the final config, prepending the defaults layer.
  const provenance = new Map<string, KeyProvenance>();
  for (const key of Object.keys(finalConfig)) {
    const presetRepoChain = chains.get(key) ?? [];
    const chain: ProvenanceStep[] = [];
    if (Object.prototype.hasOwnProperty.call(defaults, key)) {
      const inResolved = Object.prototype.hasOwnProperty.call(resolved, key);
      // The default is a no-op contribution when a later layer produced the
      // final value regardless (overwritten scalar, empty-array concat, null
      // object) — i.e. the final value equals the post-preset value.
      const noop = inResolved && deepEqual(finalConfig[key], resolved[key]);
      chain.push({
        layer: { kind: "defaults" },
        action: "set",
        before: undefined,
        after: defaults[key],
        ...(noop ? { noop: true } : {}),
      });
    }
    chain.push(...presetRepoChain);
    provenance.set(key, {
      key,
      finalValue: finalConfig[key],
      isDefaultOnly: presetRepoChain.length === 0,
      chain,
    });
  }
  return provenance;
}

/**
 * Roadmap 013: per-rule provenance for `packageRules`. `packageRules` is a
 * concatenating array key (`ProvenanceAction.concat`), so — unlike scalar
 * keys — a single `KeyProvenance` chain cannot say which merged INDEX came
 * from which layer, only which layers contributed *an* entry. Renovate's
 * `mergeChildConfig` concatenates arrays in encounter order and is
 * associative (`(a++b)++c === a++(b++c)`), so replaying the same layer order
 * `buildLayers` already establishes — but reading each layer's OWN
 * `packageRules` length instead of merging — reproduces exactly which
 * contiguous slice of the final merged array came from which layer, with no
 * merge needed at all.
 */
export interface RuleAttribution {
  /** 0-based index into the final merged `packageRules` array (the canonical index). */
  index: number;
  /** The layer (global/inherited/preset/repo/defaults) that contributed this entry. */
  layer: ProvenanceLayer;
  /** 0-based index of this entry within that layer's OWN `packageRules` array — e.g. the
   *  repo-config index a validator message like `packageRules[1]` refers to, when `layer.kind === "repo"`. */
  sourceIndex: number;
  /**
   * The preset NESTED below the direct extend `layer` names whose own body
   * wrote this rule (`security:minimumReleaseAgeNpm` writing what
   * `config:best-practices` carries in), with the index the rule has in THAT
   * body. Present only when the layer is a preset, the writer is not that
   * direct extend itself, and the subtree replay tiled the extend's
   * ground-truth array exactly — the same honesty rule
   * {@link ProvenanceStep.writtenBy} follows: absence over a guess.
   */
  writtenBy?: { nodeId: string; name: string; sourceIndex: number };
}

function ownRuleCount(config: Obj): number {
  return Array.isArray(config.packageRules) ? config.packageRules.length : 0;
}

/**
 * Which nested body wrote each rule of a direct extend's slice, by walking the
 * subtree in `resolveConfigPresets`' own merge order — children first, the
 * node's own body last, exactly the order `mergeChildConfig` concatenates in.
 * The visited bodies' `packageRules` therefore tile the extend's resolved
 * array, and position alone identifies the writer; no value matching involved.
 *
 * `undefined` when the tiles don't sum to the extend's ground-truth length (a
 * `packageRules[n].extends` expanded later would do it) — the layer then keeps
 * its coarse attribution rather than gaining a wrong leaf.
 */
function ruleWriters(
  node: PresetNode,
  expected: number,
): (RuleAttribution["writtenBy"] | undefined)[] | undefined {
  const writers: (RuleAttribution["writtenBy"] | undefined)[] = [];
  walkResolutionOrder(node, (visited) => {
    const input = visited.input;
    const own = isPlainObject(input) ? input.packageRules : undefined;
    if (!Array.isArray(own)) {
      return;
    }
    for (let sourceIndex = 0; sourceIndex < own.length; sourceIndex++) {
      // The direct extend writing its own rule is what the layer already says.
      writers.push(
        visited.id === node.id
          ? undefined
          : { nodeId: visited.id, name: visited.name, sourceIndex },
      );
    }
  });
  return writers.length === expected ? writers : undefined;
}

/**
 * Attributes every entry of a completed run's `finalConfig.packageRules` to
 * its contributing layer, or `undefined` when the run lacks the data it needs
 * (mirrors `computeProvenance`'s availability). Returns `undefined` — rather
 * than a partial/incorrect attribution — when the replayed layer lengths
 * don't add up to the ground-truth array length (e.g. a packageRules[n].extends
 * whose nested preset itself unexpectedly reshapes the array), since a wrong
 * cross-link is worse than none.
 */
export function computeRuleProvenance(result: TraceResult): RuleAttribution[] | undefined {
  const { finalConfig } = result;
  const root = result.presetTree;
  if (!finalConfig || !root || root.resolved === undefined || root.input === undefined) {
    return undefined;
  }
  const rules = Array.isArray(finalConfig.packageRules) ? finalConfig.packageRules : [];
  if (rules.length === 0) {
    return [];
  }

  const defaults = getDefaultConfig() as Obj;
  const layers: Layer[] = [];
  if (ownRuleCount(defaults) > 0) {
    layers.push({ layer: { kind: "defaults" }, config: defaults });
  }
  layers.push(...buildLayers(root, result.layerConfigs));

  const attribution: RuleAttribution[] = [];
  let offset = 0;
  for (const { layer, config, node } of layers) {
    const count = ownRuleCount(config);
    const writers = node ? ruleWriters(node, count) : undefined;
    for (let sourceIndex = 0; sourceIndex < count; sourceIndex++) {
      const writtenBy = writers?.[sourceIndex];
      attribution.push({
        index: offset + sourceIndex,
        layer,
        sourceIndex,
        ...(writtenBy ? { writtenBy } : {}),
      });
    }
    offset += count;
  }
  return offset === rules.length ? attribution : undefined;
}
