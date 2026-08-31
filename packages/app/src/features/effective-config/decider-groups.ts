import type { KeyProvenance, PresetNode, ProvenanceStep } from "@renovate-config-debugger/engine";
import type { DataTableGroupPill, DataTablePillTone } from "@/components/data-table";

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
const DECIDER_ORDER: readonly DeciderId[] = ["repo", "preset", "inherited", "global", "defaults"];

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

/**
 * Roadmap 082 (GAP-3): the top-level `extends` entries of a run, in the order
 * the reader wrote them — the only presets that can DECIDE a key, since the
 * provenance replay merges exactly these (`buildLayers` walks `root.children`).
 * Nested presets are excluded for the same reason, and so are the ones that
 * failed to resolve: a preset Renovate could not fetch decided nothing.
 */
export function topLevelPresetNames(root: PresetNode | undefined): string[] {
  if (!root) {
    return [];
  }
  return root.children.filter((c) => !c.nested && c.state === "resolved").map((c) => c.name);
}

/**
 * …and the name the presets band is headed with: the design writes
 * `config:recommended decided 24 options`, i.e. the band is named after the
 * line the reader would delete to undo it.
 *
 * With several top-level extends there is no single such line, and inventing
 * one would be a lie about which preset decided what — so the first is named
 * and the rest are counted (`config:recommended +2 more`). `null` when the run
 * has no resolved top-level preset at all, which is where the generic
 * "Presets decided …" wording stays.
 */
export function presetDeciderName(names: readonly string[]): string | null {
  const [first, ...rest] = names;
  if (first === undefined) {
    return null;
  }
  return rest.length === 0 ? first : `${first} +${rest.length} more`;
}

/**
 * Roadmap 092: the header of a decided-by group in the standard data table —
 * the title the design writes in PROSE (a group headed "Your repo config" is a
 * sentence, not a path) and the one toned pill beside it, in the layer's own
 * hue from the app's existing pill set. The count is the table's own, off the
 * rows it is actually showing.
 *
 * This replaces 082's three-emphasis band headline: the table states the count
 * itself, so a header that also spelled it ("decided 4 options") would be
 * saying the same number twice in one line.
 */
export interface DeciderHead {
  title: string;
  /** The table's own pill shape, with the tone made REQUIRED: every layer here
   *  has a hue, and a head that forgot one would silently render muted. */
  pill: DataTableGroupPill & { tone: DataTablePillTone };
}

const DECIDER_HEADS: Record<DeciderId, DeciderHead> = {
  repo: { title: "Your repo config", pill: { label: "repo config", tone: "accent" } },
  preset: { title: "Presets", pill: { label: "presets", tone: "preset" } },
  inherited: {
    title: "The inherited config",
    pill: { label: "inherited config", tone: "inherited" },
  },
  global: { title: "The global config", pill: { label: "global config", tone: "global" } },
  defaults: { title: "Renovate defaults", pill: { label: "defaults", tone: "muted" } },
};

/** …with the presets group named after the reader's own `extends` when the run
 *  has one (082 GAP-3), so the group is headed by the line they would delete to
 *  undo it. */
export function deciderHead(id: DeciderId, presetName?: string | null): DeciderHead {
  const head = DECIDER_HEADS[id];
  return id === "preset" && presetName ? { ...head, title: presetName } : head;
}
