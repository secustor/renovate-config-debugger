import type {
  ProvenanceLayer,
  RuleAttribution,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { ruleOriginLayer } from "./rule-filters";

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
 *
 * The preset credited is the ORIGINATING body, via `ruleOriginLayer`
 * (rule-filters.ts) — the nested preset that wrote the rule, not the direct
 * extend it arrived through.
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
  const origin = attribution ? ruleOriginLayer(attribution) : undefined;
  return origin?.kind === "preset" ? origin : undefined;
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

/**
 * The update-type block that flattening actually merged up, if any — the other
 * half of the consumed-blocks story, and the one an empty `flattened.merged`
 * cannot tell on its own.
 */
export interface AppliedBlock {
  /** The update-type block flattening merged up, e.g. `minor`. */
  key: string;
  /** The block's own option keys — `[]` when the config carries an empty block. */
  keys: string[];
  /** A human put it there (vs. Renovate's own default block for that key). */
  authored: boolean;
  /** Keys it actually changed on the final config — empty means it contributed
   *  nothing. */
  changed: string[];
}

/**
 * Roadmap 048. `null` = the update has no `updateType`, or the config had no
 * block by that name; non-null with `changed: []` = the block existed and
 * changed nothing (it was empty, or every key already had that value). That
 * distinction is what an empty `flattened.merged` cannot make, and the reason
 * `flattened` read as "nothing happened" when something had.
 */
export function appliedUpdateTypeBlock(sim: SimulationResult): AppliedBlock | null {
  const key = sim.flattened.updateType;
  if (!key) {
    return null;
  }
  const block = sim.flattened.blocks[key];
  if (!block) {
    return null;
  }
  return {
    key,
    keys: Object.keys(block),
    authored: sim.flattened.authoredBlocks.includes(key),
    changed: sim.flattened.merged.map((m) => m.key),
  };
}
