import {
  computeProvenance,
  type KeyProvenance,
  type ProvenanceLayer,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import { isOverridden, multiContribBadgeKind } from "@renovate-config-debugger/app/headless";
import { CliError } from "../io";

/**
 * Per-key provenance, projected — shared by `rcd provenance` and the MCP
 * server's `get_provenance`.
 *
 * The badge comes from `multiContribBadgeKind`, not from "more than one layer
 * touched it": roadmap 016 established that calling an appended array
 * "overridden" is misleading, and the CLI must not re-learn that lesson
 * separately from the app.
 */

export function layerLabel(layer: ProvenanceLayer): string {
  return layer.kind === "preset" ? `preset ${layer.name}` : layer.kind;
}

export interface ProvenanceView {
  key: string;
  finalValue: unknown;
  isDefaultOnly: boolean;
  winner: string | null;
  badge: string | null;
  chain: {
    layer: string;
    action: string;
    before: unknown;
    after: unknown;
    expandedNested?: true;
  }[];
}

export function entryView(entry: KeyProvenance): ProvenanceView {
  const winner = entry.chain.findLast((s) => !s.noop) ?? entry.chain.at(-1);
  return {
    key: entry.key,
    finalValue: entry.finalValue,
    isDefaultOnly: entry.isDefaultOnly,
    winner: winner ? layerLabel(winner.layer) : null,
    badge: isOverridden(entry) ? multiContribBadgeKind(entry) : null,
    chain: entry.chain
      .filter((step) => !step.noop)
      .map((step) => ({
        layer: layerLabel(step.layer),
        action: step.action,
        before: step.before,
        after: step.after,
        ...(step.expandedNested ? { expandedNested: true as const } : {}),
      })),
  };
}

export interface ProvenanceIndexEntry {
  key: string;
  winner: string | null;
  badge: string | null;
  /** Layers that actually changed the value — the chain's length, unexpanded. */
  contributors: number;
  /** Enough of the final value to recognise it; the chain is one call away. */
  preview: string;
}

/** A value, short enough to scan. */
export function previewValue(value: unknown, max = 60): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length <= max ? text : `${text.slice(0, max)}… (${text.length} chars)`;
}

/**
 * The keyless answer: one line per key instead of every layer's before/after.
 *
 * A `config:recommended` run has ~200 keys with long override chains — the
 * full {@link entryView} of all of them is over half a megabyte, which is not
 * an answer, it is a haystack. This is the index; ask for a key to get its
 * chain.
 */
export function indexView(entry: KeyProvenance): ProvenanceIndexEntry {
  const view = entryView(entry);
  return {
    key: view.key,
    winner: view.winner,
    badge: view.badge,
    contributors: view.chain.length,
    preview: previewValue(entry.finalValue),
  };
}

/**
 * Roadmap 068 (2026-07 persona study, 2 of 9 sessions, plus the review):
 * provenance answers "which LAYER set this option", and two personas read that
 * as "this is the value Renovate will use". For any key a packageRule can also
 * set, it is not: the layer chain produces the repository-wide value, and a
 * rule then overrides it for the dependencies it matches. Both personas
 * reported a static value as the effective one for an update it did not apply
 * to.
 *
 * Cheap and exact: the key appears inside a rule of the run's OWN final
 * `packageRules`, so the count is this config's, not Renovate's option
 * metadata. The clauses of those rules are the simulator's business, which is
 * what the note points at.
 */
export function perDependencyNote(
  key: string,
  finalConfig: Record<string, unknown> | undefined,
): string | undefined {
  if (key === "packageRules" || !Array.isArray(finalConfig?.packageRules)) {
    return undefined;
  }
  const setters = finalConfig.packageRules.filter(
    (rule) => rule !== null && typeof rule === "object" && key in rule,
  ).length;
  if (setters === 0) {
    return undefined;
  }
  return (
    `${setters} packageRule${setters === 1 ? "" : "s"} can set \`${key}\` per-dependency — this ` +
    "chain is the repository-wide value. Simulate a dependency to see the value an actual " +
    "update would get."
  );
}

/** The run's provenance map, or a legible error explaining why there is none. */
export function provenanceOf(result: TraceResult): Map<string, KeyProvenance> {
  const provenance = computeProvenance(result);
  if (!provenance) {
    throw new CliError(
      "provenance needs a completed preset resolution — validate the config to see why it stopped",
    );
  }
  return provenance;
}
