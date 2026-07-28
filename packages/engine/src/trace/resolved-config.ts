import { getDefaultConfig, mergeChildConfig } from "../renovate-adapter";
import type { PresetNode, TraceResult } from "./model";
import { deepEqual } from "./provenance";

/**
 * Roadmap 051: the effective config as a copyable DOCUMENT — the counterpart
 * to `computeProvenance`'s per-key view, built from the same trace data by the
 * same `mergeChildConfig` replay.
 *
 * Two expansion levels:
 *
 * - `"full"` — the repo-level resolution exactly as the pipeline produced it
 *   (`root.resolved`): every preset inlined, no `extends` left. Optionally
 *   hydrated with the defaults underneath, matching how Renovate itself
 *   applies them (defaults first, resolved config on top).
 * - `"keep-internal"` — hosted/fetched presets inlined, internal presets
 *   (and anything that cannot be inlined: errored, ignored, unclassifiable
 *   nodes) kept as `extends` references. The consolidation people actually
 *   paste back into a renovate.json: their own preset plumbing flattened,
 *   `config:recommended` still readable and still tracking upstream.
 *
 * The keep-internal document necessarily reorders merges: a kept reference
 * resolves BEFORE the emitted body, even when it was written after an inlined
 * preset. `mergeChildConfig` is order-sensitive (overwrites, concat order), so
 * instead of pretending the output is always exact, the same replay is run in
 * both orders and every top-level key whose value changes is reported in
 * `divergingKeys` — the UI's honesty note. In the common shape (internal
 * presets listed before hosted ones, or touching disjoint keys) the list is
 * empty.
 *
 * Deliberately repo-scoped: the 008 global/inherited layers are runtime
 * context, not part of a committable repo config, so they never appear here —
 * unlike `finalConfig`, which merges them.
 */

export type ResolvedConfigMode = "full" | "keep-internal";

export interface ResolvedConfigOutput {
  config: Record<string, unknown>;
  /**
   * `keep-internal` only (always empty for `full`): top-level keys whose
   * value would differ when the emitted document is re-resolved, because a
   * kept `extends` reference now merges before formerly-later inlined
   * content. Empty = the document reproduces the traced resolution exactly.
   */
  divergingKeys: string[];
}

type Obj = Record<string, unknown>;

/** A child the emitted document can safely inline: successfully resolved AND
 *  positively known to be non-internal. Unclassifiable nodes stay referenced —
 *  a kept reference is at worst verbose, a wrongly-inlined one is wrong. */
function inlineable(child: PresetNode): boolean {
  return (
    child.state === "resolved" &&
    child.resolved !== undefined &&
    child.source?.presetSource !== undefined &&
    child.source.presetSource !== "internal"
  );
}

function resolvedOf(child: PresetNode): Obj | undefined {
  return child.state === "resolved" && child.resolved !== undefined
    ? (child.resolved as Obj)
    : undefined;
}

/** `mergeChildConfig` folded over the layers, then the body — both cloned,
 *  since Renovate's merge mutates its parent argument. */
function replay(layers: (Obj | undefined)[], body: Obj): Obj {
  let acc: Obj = {};
  for (const layer of layers) {
    if (layer) {
      acc = mergeChildConfig(acc, structuredClone(layer)) as Obj;
    }
  }
  return mergeChildConfig(acc, structuredClone(body)) as Obj;
}

/**
 * Computes the resolved config as a standalone document, or `undefined` when
 * the run lacks the data (mirrors `computeProvenance`'s availability: no final
 * config, or preset resolution did not finish).
 *
 * `includeDefaults` applies to `"full"` only. For `"keep-internal"` it is
 * ignored: explicit defaults in a config body would merge AFTER the kept
 * presets and override them — the hydrated document would not mean what the
 * traced run meant.
 */
export function computeResolvedConfig(
  result: TraceResult,
  mode: ResolvedConfigMode,
  opts?: { includeDefaults?: boolean },
): ResolvedConfigOutput | undefined {
  const root = result.presetTree;
  if (!result.finalConfig || !root || root.resolved === undefined || root.input === undefined) {
    return undefined;
  }

  if (mode === "full") {
    const resolved = structuredClone(root.resolved) as Obj;
    const config = opts?.includeDefaults
      ? (mergeChildConfig(structuredClone(getDefaultConfig()) as Obj, resolved) as Obj)
      : resolved;
    return { config, divergingKeys: [] };
  }

  // Same participant filter as provenance's buildLayers: nested nodes merge
  // inside their parent value, never at the top level.
  const children = root.children.filter((child) => !child.nested);
  const kept = children.filter((child) => !inlineable(child));
  const inlined = children.filter(inlineable);

  // `extends` is consumed by resolution and `ignorePresets` is deliberately
  // KEPT: a kept-but-ignored reference re-resolves to "skipped" only while
  // the body still says to ignore it.
  const body = structuredClone(root.input) as Obj;
  delete body.extends;

  const merged = replay(
    inlined.map((child) => child.resolved as Obj),
    body,
  );
  // Resolved preset payloads never carry `extends` (resolution consumes it),
  // but if one ever does, the entries belong after the kept references.
  const carried = Array.isArray(merged.extends) ? (merged.extends as unknown[]) : [];
  delete merged.extends;
  const extendsList = [...kept.map((child) => child.name), ...carried];
  const config: Obj = extendsList.length > 0 ? { extends: extendsList, ...merged } : merged;

  // Order honesty: the traced run merged the children in tree order; the
  // emitted document resolves kept references first, then the inlined+body
  // content. Replay both sequences (identically nested-unexpanded, so only
  // the reordering can differ) and report every key that changes.
  const original = replay(
    children.map((child) => resolvedOf(child)),
    body,
  );
  const reordered = replay(
    [...kept, ...inlined].map((child) => resolvedOf(child)),
    body,
  );
  const divergingKeys: string[] = [];
  for (const key of new Set([...Object.keys(original), ...Object.keys(reordered)])) {
    if (!deepEqual(original[key], reordered[key])) {
      divergingKeys.push(key);
    }
  }
  return { config, divergingKeys };
}
