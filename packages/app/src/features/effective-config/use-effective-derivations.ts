import type {
  KeyProvenance,
  ResolvedConfigMode,
  ResolvedConfigOutput,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { useEngineDerivation } from "@/hooks/use-engine-derivation";

export type Provenance = Map<string, KeyProvenance>;

/** Loads + computes provenance for a result once the engine chunk is present.
 *  undefined = loading, null = unavailable (e.g. preset resolution failed). */
export function useProvenance(result: TraceResult): Provenance | null | undefined {
  return useEngineDerivation([result], (engine) => engine.computeProvenance(result) ?? null);
}

/**
 * Roadmap 051/082: computes the copyable resolved-config document — used by
 * BOTH the As-JSON view and the toolbar's copy button, so it is NOT gated on
 * the view. `ready` holds it back only until provenance has settled;
 * `undefined` = not ready or computing, `null` = unavailable (same guards as
 * provenance). Cheap enough to recompute per option change: a handful of
 * `mergeChildConfig` calls, and the engine chunk is already resident by then.
 */
export function useResolvedConfig(
  result: TraceResult,
  ready: boolean,
  mode: ResolvedConfigMode,
  includeDefaults: boolean,
): ResolvedConfigOutput | null | undefined {
  return useEngineDerivation(
    [result, ready, mode, includeDefaults],
    ready
      ? (engine) => engine.computeResolvedConfig(result, mode, { includeDefaults }) ?? null
      : null,
  );
}
