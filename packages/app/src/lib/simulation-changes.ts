import type { SimulationResult } from "@renovate-config-debugger/engine";
import { jsonEqual } from "@renovate-config-debugger/engine/json";
import { UPDATE_TYPE_KEYS } from "@/lib/update-type-keys";

/**
 * Keys the packageRules changed for one dependency, vs. the pre-rules
 * effective config — the verdict ledger's spine, the final section's summary,
 * and the input `buildVerdictSegments` needs to tell "no rule touched
 * `automerge`" from "a rule turned it off".
 *
 * Roadmap 046: the base is flattened the same way the engine flattens
 * `finalDependencyConfig` — the update-type blocks Renovate ALWAYS deletes are
 * not "removed by the rules", and listing them as such buried the one real
 * change under seven `removed` rows. A key an update-type block genuinely
 * merged UP still surfaces: it lands top-level on the final config, where the
 * base never had it.
 *
 * Roadmap 048: hoisted out of `RuleSimulator`'s `useMemo` so `rcd simulate`'s
 * verdict sentence is built from the same list the card renders, rather than
 * from an empty one that silently drops the negative clauses.
 */
export function changedDependencyKeys(
  sim: SimulationResult,
  finalConfig: Record<string, unknown> | undefined,
): string[] {
  if (!finalConfig) {
    return [];
  }
  const base: Record<string, unknown> = { ...finalConfig };
  delete base.packageRules;
  for (const key of UPDATE_TYPE_KEYS) {
    delete base[key];
  }
  const keys = new Set([...Object.keys(base), ...Object.keys(sim.finalDependencyConfig)]);
  return [...keys]
    .filter((key) => !jsonEqual(base[key], sim.finalDependencyConfig[key]))
    .toSorted();
}
