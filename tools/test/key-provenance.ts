/**
 * The hand-built provenance chains the effective-config suites feed to the pure
 * derivations (the grouping, the notes, the row mapping). Every one of them had
 * its own copy of these two builders, with defaults that had already drifted
 * apart. Outside the app's `src/` so test scaffolding can never ship.
 */

import type {
  KeyProvenance,
  ProvenanceLayer,
  ProvenanceStep,
} from "@renovate-config-debugger/engine";

/** The preset layer builder lives with the description fixtures; re-exported so
 *  a chain suite gets its whole kit from one import. */
export { presetLayer } from "./description-provenance";

/** One step of a key's chain: `layer` setting `after`, with `extra` for the
 *  fields a case is actually about (`noop`, `action`, `before`). */
export function provStep(
  layer: ProvenanceLayer,
  after: unknown = 1,
  extra: Partial<ProvenanceStep> = {},
): ProvenanceStep {
  return { layer, action: "set", before: undefined, after, ...extra };
}

/** An entry over `chain`; `finalValue` defaults to what the last step left
 *  behind, which is what a real run's entry carries. */
export function provEntry(
  key: string,
  chain: ProvenanceStep[],
  finalValue: unknown = chain.at(-1)?.after,
): KeyProvenance {
  return {
    key,
    finalValue,
    isDefaultOnly: chain.length > 0 && chain.every((s) => s.layer.kind === "defaults"),
    chain,
  };
}
