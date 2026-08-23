import type * as EngineModule from "@renovate-config-debugger/engine";
import type { RuleAttribution, TraceResult } from "@renovate-config-debugger/engine";
import { makeResultCache } from "./result-cache";
import { useEngineDerivation } from "./use-engine-derivation";

/**
 * Roadmap 032: `computeRuleProvenance` replays the layer merge over every
 * `packageRules` entry, and three consumers mount per run (App for the
 * message cross-links, EffectiveConfig's `packageRules` row, the simulator's
 * rule rows). `makeResultCache` keys the promise on the immutable result, so
 * the replay runs ONCE per run no matter how many consumers ask — and every
 * consumer settles on the same attribution array identity, which is what lets
 * their memoized derivations agree. It also ends the chain with the `.catch`
 * this side used to lack: a throw inside the replay is "unavailable", not an
 * unhandled rejection in whichever consumer happened to arrive last.
 */
const ruleProvenanceFor = makeResultCache((engine: typeof EngineModule, result: TraceResult) =>
  engine.computeRuleProvenance(result),
);

/**
 * Roadmap 013: loads + computes per-`packageRules`-entry provenance for a
 * result, once the engine chunk is present — shared by the effective config's
 * `packageRules` row, the simulator's rule rows, and the validation-message
 * cross-links (App). Mirrors EffectiveConfig's `useProvenance` hook shape:
 * `undefined` = loading/no result yet, `null` = unavailable (e.g. preset
 * resolution failed, or the replayed layer lengths didn't add up).
 */
export function useRuleProvenance(
  result: TraceResult | null | undefined,
): RuleAttribution[] | null | undefined {
  return useEngineDerivation(
    [result],
    result ? (engine) => ruleProvenanceFor(engine, result) : null,
  );
}
