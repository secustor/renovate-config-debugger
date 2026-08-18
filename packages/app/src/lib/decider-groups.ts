import type { KeyProvenance, ProvenanceStep } from "@renovate-config-debugger/engine";

/**
 * Roadmap 075 (iteration 5): the effective config, grouped by WHO DECIDED each
 * key's final value.
 *
 * Nothing here recomputes provenance — the decider is read straight off the
 * chain the engine already built: the last step that was not a no-op is the one
 * whose value survives into the final config (that is exactly what
 * {@link winningStep} has always meant for the row's origin chip), so the
 * `kind` of ITS layer is the group. The vocabulary is therefore Renovate's own
 * merge levels, not a UI invention: a run with no 008 layers simply produces no
 * global/inherited groups.
 *
 * Pure and DOM-free, so the grouping can be unit tested (and, if the CLI ever
 * wants the same cut of the provenance map, imported) without React.
 */

/** `ProvenanceLayer["kind"]` — spelled out so a group can be ordered, labelled
 *  and given a hue without importing the engine's union at every use. */
export type DeciderId = "repo" | "preset" | "inherited" | "global" | "defaults";

/**
 * Reading order: the layers the reader can act on first (their own file), then
 * what they pulled in, then the levels a self-hosted bot imposes, and last the
 * defaults nobody in this run touched. It is Renovate's merge order read
 * backwards, which is the order "why is this value what it is?" is answered in.
 */
export const DECIDER_ORDER: readonly DeciderId[] = [
  "repo",
  "preset",
  "inherited",
  "global",
  "defaults",
];

/** The step whose value survives into the final config (skips no-op steps).
 *  `undefined` only for an empty chain, which the provenance builder never
 *  produces — a key exists in this view because some layer set it. */
export function winningStep(entry: KeyProvenance): ProvenanceStep | undefined {
  return entry.chain.findLast((s) => !s.noop) ?? entry.chain.at(-1);
}

/** Which merge level decided this key's final value. The `defaults` fallback is
 *  unreachable for a chain the engine produced (see {@link winningStep}) and is
 *  the honest answer anyway: a key nothing touched is a default. */
export function decidedBy(entry: KeyProvenance): DeciderId {
  return winningStep(entry)?.layer.kind ?? "defaults";
}

export interface DeciderGroup {
  id: DeciderId;
  entries: KeyProvenance[];
}

/** Groups entries by their deciding layer, in {@link DECIDER_ORDER}, keeping
 *  the incoming order within each group and omitting groups with no rows. */
export function groupByDecider(entries: Iterable<KeyProvenance>): DeciderGroup[] {
  const buckets = new Map<DeciderId, KeyProvenance[]>();
  for (const entry of entries) {
    const id = decidedBy(entry);
    const bucket = buckets.get(id);
    if (bucket) {
      bucket.push(entry);
    } else {
      buckets.set(id, [entry]);
    }
  }
  return DECIDER_ORDER.flatMap((id) => {
    const group = buckets.get(id);
    return group ? [{ id, entries: group }] : [];
  });
}

/** How many keys each layer decided, for the "N of M shown" a filtered section
 *  header reports. Counted over the same entries the sections are built from
 *  minus the interactive filters, so the M is the honest size of the group. */
export function countByDecider(entries: Iterable<KeyProvenance>): Map<DeciderId, number> {
  const counts = new Map<DeciderId, number>();
  for (const entry of entries) {
    const id = decidedBy(entry);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
