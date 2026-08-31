import type { DeciderGroup } from "@/features/effective-config/decider-groups";

/**
 * The hand-built provenance chains the effective-config suites feed to the pure
 * derivations (the grouping, the notes, the row mapping). Every one of them had
 * its own copy of these two builders, with defaults that had already drifted
 * apart. Outside the app's `src/` so test scaffolding can never ship.
 */

// The engine's own types, read off the app's — `@renovate-config-debugger/engine`
// does not resolve from here, since tools/ is not a package.
type KeyProvenance = DeciderGroup["entries"][number];
type ProvenanceStep = KeyProvenance["chain"][number];
type ProvenanceLayer = ProvenanceStep["layer"];

/** A preset layer. The node id only matters where two occurrences of the same
 *  preset have to stay apart. */
export function presetLayer(name: string, nodeId = "p1"): ProvenanceLayer {
  return { kind: "preset", nodeId, name };
}

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
