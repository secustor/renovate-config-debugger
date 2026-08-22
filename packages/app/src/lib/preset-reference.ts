import type { PresetNode } from "@renovate-config-debugger/engine";
import { computeTreeStats } from "./preset-tree-stats";

/**
 * Roadmap 081: what the standard preset hover card says, derived — the "via"
 * chain that reaches a preset, and the three nesting numbers under the rule.
 *
 * Pure, and in `lib/` rather than beside the card, for the reason every other
 * derivation here is: the card is one renderer of these facts and the numbers
 * have to be testable without a DOM. Everything comes off the one per-run walk
 * (`computeTreeStats`, WeakMap-cached on the tree object), so a token opening
 * its card during a re-render costs a map lookup, not a walk.
 */

/** One link of the "via" chain — an ancestor of the referenced preset. */
export interface PresetViaStep {
  /** The repo's own config (the tree's root) wears the repo hue; the rest are
   *  presets and wear the preset hue. */
  kind: "repo" | "preset";
  label: string;
  nodeId: string;
}

export interface PresetReferenceFacts {
  /** The node these facts describe — what the card's tree link selects. */
  nodeId: string;
  /**
   * Root-first ancestry, ending at the referenced node's PARENT. It never
   * includes the node itself: the card is anchored to a token that already
   * names it, and the design's rule is that the chain ends in an italic "this
   * preset" rather than repeating the name the reader is pointing at.
   */
  via: PresetViaStep[];
  /** `extends` entries this preset declares itself. */
  directExtends: number;
  /** Every preset underneath it, however deep. */
  totalNested: number;
  /** How many levels the deepest chain below it runs. */
  deepestChain: number;
}

/**
 * The facts for one node of a run's resolution tree, or null when there are
 * none to state: an unknown id (a token naming a preset that never resolved
 * into the tree), or the ROOT itself — the repo config is where every chain
 * starts, so it has no "via" of its own and the tree has no row to link to.
 */
export function presetReferenceFacts(
  root: PresetNode,
  nodeId: string,
): PresetReferenceFacts | null {
  const stats = computeTreeStats(root);
  const node = stats.nodesById.get(nodeId);
  if (!node || node === root) {
    return null;
  }
  const via: PresetViaStep[] = [];
  for (let cur = stats.parents.get(node.id); cur; cur = stats.parents.get(cur.id)) {
    via.unshift(
      cur === root
        ? { kind: "repo", label: "repo config", nodeId: cur.id }
        : { kind: "preset", label: cur.name, nodeId: cur.id },
    );
  }
  const own = stats.statsById.get(node.id);
  return {
    nodeId: node.id,
    via,
    directExtends: node.children.length,
    totalNested: own?.descPresets ?? 0,
    deepestChain: own?.subtreeDepth ?? 0,
  };
}
