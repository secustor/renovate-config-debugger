import type { PresetNode, TraceResult } from "./model";

/**
 * How the preset tree is READ — the shapes every post-hoc reconstruction
 * (provenance, description-provenance) needs, stated once.
 *
 * They are facts about `resolveConfigPresets`, not about any one consumer:
 * which children take part in a merge, and in what order the bodies land. They
 * were spelled out at each call site, at slightly different strengths, with
 * comments pointing at each other — which is how a filter drifts.
 */

/**
 * The children of `node` that take part in ITS merge.
 *
 * - `nested` children merge inside their parent's own VALUE (a preset reached
 *   through `packageRules[n].extends`), never at this level.
 * - a child that is not `resolved`, or carries no `resolved` payload, never
 *   merged at all — it errored, was ignored, or resolution stopped short.
 */
export function mergingChildren(node: PresetNode): PresetNode[] {
  return node.children.filter(
    (child) => !child.nested && child.state === "resolved" && child.resolved !== undefined,
  );
}

/**
 * One `resolveConfigPresets` invocation replayed as a walk: every merging
 * child's subtree first, in `extends` order, then the node's OWN body LAST —
 * which is the order upstream merges them.
 *
 * The consequence callers rely on: the last visited body carrying a key is
 * that key's winner under `mergeChildConfig`'s overwrite semantics, and the
 * visit order of the bodies is the concatenation order of an array key.
 */
export function walkResolutionOrder(node: PresetNode, visit: (node: PresetNode) => void): void {
  for (const child of mergingChildren(node)) {
    walkResolutionOrder(child, visit);
  }
  visit(node);
}

/**
 * The two things every post-hoc reconstruction needs before it can replay a
 * run: a final config, and a root whose preset resolution actually finished
 * (so it carries both `input` and `resolved`). `undefined` when either is
 * missing — stated once here rather than at each compute* entry point.
 */
export function replayableRun(
  result: TraceResult,
): { root: PresetNode; finalConfig: Record<string, unknown> } | undefined {
  const { finalConfig, presetTree: root } = result;
  if (!finalConfig || !root || root.resolved === undefined || root.input === undefined) {
    return undefined;
  }
  return { root, finalConfig };
}
