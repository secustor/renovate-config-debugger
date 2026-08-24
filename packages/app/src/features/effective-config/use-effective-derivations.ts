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
 * Roadmap 051: computes the copyable resolved-config document once the JSON
 * view is active. Mirrors `useProvenance` above — `undefined` = inactive or
 * computing, `null` = unavailable (same guards as provenance). Cheap enough to
 * recompute per option change: a handful of `mergeChildConfig` calls, and the
 * engine chunk is already resident by the time this view can be reached.
 */
export function useResolvedConfig(
  result: TraceResult,
  active: boolean,
  mode: ResolvedConfigMode,
  includeDefaults: boolean,
): ResolvedConfigOutput | null | undefined {
  return useEngineDerivation(
    [result, active, mode, includeDefaults],
    active
      ? (engine) => engine.computeResolvedConfig(result, mode, { includeDefaults }) ?? null
      : null,
  );
}
