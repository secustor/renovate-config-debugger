/**
 * The `DescriptionProvenance` record the description card, its digest, the
 * blame ledger, the per-node index and the hover cards are all built from
 * (roadmap 069/083) — and the two layers and the `entries` builder that feed
 * it. Four suites in three layers used to carry their own kit, with the
 * `entries` half already drifted into four incompatible variants of the same
 * duplicate-index algorithm.
 *
 * Under `tools/test` like the discovery fixtures: test scaffolding can never
 * ride into the production build, and a fixture three layers share has no home
 * inside any of them.
 */
import type {
  DescriptionAttribution,
  DescriptionProvenance,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";

/** The repo config's own layer — the default an entry is attributed to. */
export const REPO_LAYER: ProvenanceLayer = { kind: "repo" };

/** A preset layer. The name defaults to the id, which matters wherever a test
 *  compares the two. */
export function presetLayer(nodeId: string, name = nodeId): ProvenanceLayer {
  return { kind: "preset", nodeId, name };
}

/** One member of the final `description` array, as a test states it. */
export interface DescriptionEntrySpec {
  value: string;
  /** The top-level layer the sentence arrived through; defaults to the repo. */
  via?: ProvenanceLayer;
  /** The writing node: an id (whose name defaults to it, or to `nodeName`), or
   *  the whole `{ nodeId, name }` record. Absent = a layer with no preset tree. */
  node?: string | { nodeId: string; name: string };
  nodeName?: string;
  approximate?: boolean;
  /** The engine's REAL index, for an array whose earlier slots are held by
   *  members no preset wrote (a non-string the validator kept). */
  index?: number;
}

function specNode(spec: DescriptionEntrySpec): { nodeId: string; name: string } | undefined {
  if (spec.node === undefined) {
    return undefined;
  }
  return typeof spec.node === "string"
    ? { nodeId: spec.node, name: spec.nodeName ?? spec.node }
    : spec.node;
}

/**
 * Builds `entries` with the indices and duplicate markers the engine assigns:
 * the first occurrence of a value owns it, and every later one points back at
 * that index.
 *
 * `startAt` shifts the first index, for an array whose earlier positions are
 * held by non-string members; a spec's own `index` overrides both.
 */
export function descriptionEntries(
  specs: DescriptionEntrySpec[],
  startAt = 0,
): DescriptionAttribution[] {
  const firstByValue = new Map<string, number>();
  return specs.map((spec, offset) => {
    const index = spec.index ?? startAt + offset;
    const duplicateOfIndex = firstByValue.get(spec.value);
    if (duplicateOfIndex === undefined) {
      firstByValue.set(spec.value, index);
    }
    const node = specNode(spec);
    return {
      index,
      value: spec.value,
      viaTopLevel: spec.via ?? REPO_LAYER,
      ...(node ? { node } : {}),
      ...(duplicateOfIndex === undefined ? {} : { duplicateOfIndex }),
      ...(spec.approximate ? { approximate: true } : {}),
    };
  });
}

/** The engine guarantees `entries.length + unattributed.length ===
 *  finalLength`; the fixture keeps that unless a test overrides it on purpose. */
export function descriptionProvenance(
  overrides: Partial<DescriptionProvenance> = {},
): DescriptionProvenance {
  const attributed = overrides.entries ?? [];
  const nonText = overrides.unattributed ?? [];
  return {
    dropped: [],
    ruleDescriptions: [],
    degraded: false,
    finalLength: attributed.length + nonText.length,
    ...overrides,
    entries: attributed,
    unattributed: nonText,
  };
}
