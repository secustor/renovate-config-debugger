import type {
  ProvenanceLayer,
  RuleAttribution,
  SimulationResult,
} from "@renovate-config-debugger/engine";

/**
 * Roadmap 047: an update-type block the USER authored (per the engine's
 * `flattened.authoredBlocks`) that flattening consumed WITHOUT applying — the
 * only case where the consumed-blocks aside earns its place on the verdict
 * card. Renovate's defaults declare all seven blocks on every config, so
 * "blocks were consumed" is true on virtually every run; naming only the
 * authored ones turns furniture back into signal. The block that actually
 * merged up is excluded — it applied, so there is nothing to explain.
 */
export interface ConsumedBlock {
  /** The update-type key, e.g. `minor`. */
  key: string;
  /** The block's own option keys, e.g. `["automerge"]`. */
  keys: string[];
  /** The preset that contributed it, when a single matched rule set it. */
  layer?: ProvenanceLayer;
}

/**
 * Which layer contributed an update-type block, for the aside's attribution
 * chip — the same best-effort reading `automergeScopeSource` does, generalized
 * to the whole block: only when EXACTLY ONE matched rule merged that key, and
 * only when that rule traces to a preset. A block that came from the base
 * config, or one several rules touched, is left uncredited rather than guessed.
 */
function blockSourceLayer(
  sim: SimulationResult,
  blockKey: string,
  ruleAttribution: RuleAttribution[] | null | undefined,
): ProvenanceLayer | undefined {
  const setters = sim.rules.filter(
    (r) => r.verdict === "matched" && r.merged?.some((m) => m.key === blockKey),
  );
  if (setters.length !== 1) {
    return undefined;
  }
  const attribution = ruleAttribution?.find((a) => a.index === setters[0]?.index);
  return attribution?.layer.kind === "preset" ? attribution.layer : undefined;
}

export function consumedAuthoredBlocks(
  sim: SimulationResult,
  ruleAttribution: RuleAttribution[] | null | undefined,
): ConsumedBlock[] {
  const applied = sim.flattened.merged.length > 0 ? sim.flattened.updateType : undefined;
  return sim.flattened.authoredBlocks
    .filter((key) => key !== applied)
    .map((key) => ({
      key,
      keys: Object.keys(sim.flattened.blocks[key] ?? {}),
      layer: blockSourceLayer(sim, key, ruleAttribution),
    }));
}
