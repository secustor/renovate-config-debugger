import type { PresetNode } from "./model";

/**
 * How the preset tree is READ — the two shapes every post-hoc reconstruction
 * (provenance, description-provenance) needs, stated once.
 *
 * Both are facts about `resolveConfigPresets`, not about any one consumer:
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
