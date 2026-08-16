import {
  type AppliedBlock,
  appliedUpdateTypeBlock,
  buildNoInputCaveat,
  buildVerdictSegments,
  changedDependencyKeys,
  consumedAuthoredBlocks,
  verdictText,
} from "@renovate-config-debugger/app/headless";
import type {
  FlattenResult,
  RuleAttribution,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { layerLabel } from "./provenance";

/**
 * Roadmap 048: the answer, before the evidence.
 *
 * `simulate` used to hand back rule rows, a per-dependency config and a
 * `flattened` object with no legend, and left the reader to assemble the
 * outcome out of them — while the web app had been rendering that outcome as
 * one sentence since roadmap 012. The sentence is now the shared derivation
 * (`@renovate-config-debugger/app/headless`), so `rcd simulate`, the MCP tool
 * and a screenshot of the verdict card cannot disagree about what a config
 * does.
 *
 * The other half is `flattened`: an empty `merged` meant either "there is no
 * block for this update type" or "the block was there and changed nothing",
 * with no field to tell them apart. `appliedBlock` and `note` say which.
 */

export interface VerdictPayload {
  /** The plain-language outcome, the app's verdict card verbatim. */
  text: string;
  /** Keys the rules changed vs. the pre-rules effective config. */
  changedKeys: string[];
  /** Fail-closed caveat: a rule lost to an unset field, not to your data. */
  caveat?: string;
}

/**
 * `attribution` is what earns the sentence its "— from `:automergeMinor`"
 * clause and the caveat its repo-only scoping; without it both degrade to the
 * uncredited wording rather than guessing. `finalConfig` is the run's effective
 * config, the baseline `changedKeys` is measured against.
 */
export function verdictPayload(
  sim: SimulationResult,
  finalConfig: Record<string, unknown> | undefined,
  attribution: readonly RuleAttribution[] | undefined,
): VerdictPayload {
  const ruleAttribution = attribution ? [...attribution] : null;
  const changedKeys = changedDependencyKeys(sim, finalConfig);
  const caveat = buildNoInputCaveat(sim, ruleAttribution);
  return {
    text: verdictText(
      buildVerdictSegments(sim, sim.flattened.updateType, changedKeys, ruleAttribution),
    ),
    changedKeys,
    ...(caveat ? { caveat } : {}),
  };
}

/** An authored block flattening dropped WITHOUT applying, with its layer
 *  rendered the way every other projection here renders one. */
export interface ConsumedBlockView {
  key: string;
  keys: string[];
  layer: string | null;
}

export interface FlattenedView extends FlattenResult {
  /** The block that was flattened, or `null` — see `appliedUpdateTypeBlock`. */
  appliedBlock: AppliedBlock | null;
  consumedBlocks: ConsumedBlockView[];
  /** Which of the four flattening outcomes this was, in one sentence. */
  note: string;
}

function flattenedNote(sim: SimulationResult, applied: AppliedBlock | null): string {
  const updateType = sim.flattened.updateType;
  if (!updateType) {
    return "this update has no updateType, so no update-type block was flattened";
  }
  if (!applied) {
    return (
      `there is no \`${updateType}\` block on the effective config — nothing was flattened for ` +
      "this update"
    );
  }
  if (applied.changed.length === 0) {
    return (
      `the \`${updateType}\` block was flattened and changed nothing (it was empty, or every key ` +
      "already had that value)" +
      (applied.authored ? "" : ", and it is Renovate's own default block, not one you authored")
    );
  }
  const keys = applied.changed.map((key) => `\`${key}\``).join(", ");
  return `the \`${updateType}\` block merged up and set: ${keys}`;
}

/** `sim.flattened`, additively — every existing field stays where it was, so a
 *  caller that already reads `merged`/`blocks`/`authoredBlocks` is untouched. */
export function flattenedView(
  sim: SimulationResult,
  attribution: readonly RuleAttribution[] | undefined,
): FlattenedView {
  const applied = appliedUpdateTypeBlock(sim);
  return {
    ...sim.flattened,
    appliedBlock: applied,
    consumedBlocks: consumedAuthoredBlocks(sim, attribution ? [...attribution] : null).map(
      (block) => ({
        key: block.key,
        keys: block.keys,
        layer: block.layer ? layerLabel(block.layer) : null,
      }),
    ),
    note: flattenedNote(sim, applied),
  };
}
