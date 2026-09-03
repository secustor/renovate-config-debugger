import { getDefaultConfig, mergeChildConfig } from "../renovate-adapter";
import type { PresetNode, TraceResult } from "./model";
import { deepEqual } from "./provenance";
import { replayableRun } from "./tree";

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
 * - `"keep-internal"` — hosted/fetched presets inlined AT ANY DEPTH, internal
 *   presets kept as `extends` references wherever they were found: an internal
 *   reference inside an inlined hosted preset is hoisted into the root
 *   `extends` (deduped, encounter order) rather than silently expanded — the
 *   common real-world shape is one org preset wrapping `config:recommended`,
 *   and expanding that would make this mode collapse into `"full"`. Anything
 *   that cannot be inlined (internal, errored, ignored, unclassifiable) stays
 *   referenced. The result is the consolidation people actually paste back
 *   into a renovate.json: their own preset plumbing flattened,
 *   `config:recommended` still readable and still tracking upstream.
 *
 * The keep-internal document necessarily reorders merges: a kept reference
 * resolves BEFORE the emitted body, even when the traced run merged it later
 * (or deeper). `mergeChildConfig` is order-sensitive (overwrites, concat
 * order), so instead of pretending the output is always exact, the same
 * building blocks — internal presets' resolved payloads and every inlined
 * body — are replayed in both the traced order and the emitted order, and
 * every top-level key whose value changes is reported in `divergingKeys` —
 * the UI's honesty note. In the common shape (internal presets ahead of
 * hosted bodies, or touching disjoint keys) the list is empty.
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
   * kept `extends` reference now merges before formerly-earlier inlined
   * content. Empty = the document reproduces the traced resolution exactly.
   */
  divergingKeys: string[];
}

type Obj = Record<string, unknown>;

/** A child the emitted document can safely inline: successfully resolved,
 *  with a migrated body to inline, AND positively known to be non-internal.
 *  Unclassifiable nodes stay referenced — a kept reference is at worst
 *  verbose, a wrongly-inlined one is wrong. */
function inlineable(child: PresetNode): boolean {
  return (
    child.state === "resolved" &&
    child.resolved !== undefined &&
    child.input !== undefined &&
    child.source?.presetSource !== undefined &&
    child.source.presetSource !== "internal"
  );
}

function resolvedOf(child: PresetNode): Obj | undefined {
  return child.state === "resolved" && child.resolved !== undefined
    ? (child.resolved as Obj)
    : undefined;
}

/** The node's own migrated body, without the `extends` its children realize.
 *  `ignorePresets` is deliberately KEPT: a kept-but-ignored reference
 *  re-resolves to "skipped" only while the body still says to ignore it. */
function bodyOf(node: PresetNode): Obj {
  const body = structuredClone(node.input ?? {}) as Obj;
  delete body.extends;
  return body;
}

/** Top-level (non-nested) children. DELIBERATELY weaker than `tree.ts`'s
 *  `mergingChildren`, which also requires a resolved payload: an unresolved
 *  child still belongs in the emitted document — as the `extends` reference it
 *  was, which is exactly what `inlineable()` below decides. Only the nested
 *  ones are dropped here, because they merge inside their parent's value and
 *  ride along with the body. */
function topChildren(node: PresetNode): PresetNode[] {
  return node.children.filter((child) => !child.nested);
}

/**
 * The recursive flatten: inlineable children contribute their own flattened
 * body (their kept references bubbling up in encounter order); everything
 * else contributes its raw `extends` string. Nested extends inside body
 * values (packageRules[n].extends) ride along as written — they re-resolve,
 * and internal ones stay referenced there too.
 */
function flatten(node: PresetNode): { kept: string[]; body: Obj } {
  const kept: string[] = [];
  let acc: Obj = {};
  for (const child of topChildren(node)) {
    if (inlineable(child)) {
      const sub = flatten(child);
      kept.push(...sub.kept);
      acc = mergeChildConfig(acc, sub.body) as Obj;
    } else {
      kept.push(child.name);
    }
  }
  return { kept, body: mergeChildConfig(acc, bodyOf(node)) as Obj };
}

/** The traced-order counterpart built from the SAME building blocks (kept
 *  presets' resolved payloads, inlined bodies) so that comparing it against
 *  the emitted-order replay isolates pure reordering effects. */
function tracedOrder(node: PresetNode): Obj {
  let acc: Obj = {};
  for (const child of topChildren(node)) {
    if (inlineable(child)) {
      acc = mergeChildConfig(acc, tracedOrder(child)) as Obj;
    } else {
      const contribution = resolvedOf(child);
      if (contribution) {
        acc = mergeChildConfig(acc, structuredClone(contribution)) as Obj;
      }
    }
  }
  return mergeChildConfig(acc, bodyOf(node)) as Obj;
}

/** First resolved payload per raw preset name, anywhere in the tree — what a
 *  kept (possibly hoisted) reference will re-resolve to. */
function resolvedByName(root: PresetNode): Map<string, Obj> {
  const byName = new Map<string, Obj>();
  const walk = (node: PresetNode): void => {
    for (const child of node.children) {
      const payload = resolvedOf(child);
      if (payload && !byName.has(child.name)) {
        byName.set(child.name, payload);
      }
      walk(child);
    }
  };
  walk(root);
  return byName;
}

/**
 * Computes the resolved config as a standalone document, or `undefined` when
 * the run lacks the data (see `replayableRun`).
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
  const replay = replayableRun(result);
  if (!replay) {
    return undefined;
  }
  const { root } = replay;

  if (mode === "full") {
    const resolved = structuredClone(root.resolved) as Obj;
    const config = opts?.includeDefaults
      ? (mergeChildConfig(structuredClone(getDefaultConfig()) as Obj, resolved) as Obj)
      : resolved;
    return { config, divergingKeys: [] };
  }

  const { kept, body } = flatten(root);
  // Dedupe hoisted references (the same internal preset commonly recurs at
  // several depths; Renovate resolves each once anyway), keeping first
  // encounter order. Resolved preset payloads never carry `extends`
  // (resolution consumes it), but if one ever does, the entries belong after
  // the kept references.
  const carried = Array.isArray(body.extends) ? (body.extends as unknown[]) : [];
  delete body.extends;
  const extendsList = [...new Set(kept), ...carried];
  const config: Obj = extendsList.length > 0 ? { extends: extendsList, ...body } : body;

  // Order honesty: replay the emitted document's resolution — every kept
  // reference (in extends order) from its resolved payload, then the
  // flattened body — against the traced-order replay of the same pieces, and
  // report every top-level key that changes.
  const byName = resolvedByName(root);
  let emitted: Obj = {};
  for (const name of new Set(kept)) {
    const payload = byName.get(name);
    if (payload) {
      emitted = mergeChildConfig(emitted, structuredClone(payload)) as Obj;
    }
  }
  emitted = mergeChildConfig(emitted, structuredClone(body)) as Obj;
  const traced = tracedOrder(root);
  const divergingKeys: string[] = [];
  for (const key of new Set([...Object.keys(traced), ...Object.keys(emitted)])) {
    // `description` is preset metadata that concatenates once per REFERENCE —
    // deduping a preset kept at several depths legitimately drops the repeat.
    // Not a behavior difference, so it never warrants the caveat.
    if (key !== "extends" && key !== "description" && !deepEqual(traced[key], emitted[key])) {
      divergingKeys.push(key);
    }
  }
  return { config, divergingKeys };
}
