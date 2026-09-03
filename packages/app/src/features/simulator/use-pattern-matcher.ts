import { useEngineDerivation } from "@/hooks/use-engine-derivation";
import type { PatternMatcher } from "./pattern-tests";

/** Keyed on nothing — the matcher is the engine's, the same for the life of
 *  the page (the `useEngineModule` idiom). */
const NO_INPUTS: readonly unknown[] = [];

/**
 * Roadmap 094: Renovate's own list matcher, as the pattern-test cards need it.
 * A cache hit in practice — the Tests tab only renders after a run, which has
 * already pulled the engine chunk in. `null` until then.
 */
export function usePatternMatcher(): PatternMatcher | null {
  return (
    useEngineDerivation(NO_INPUTS, (engine) => ({
      explain: engine.explainPatternMatch,
      parse: engine.parsePattern,
      options: engine.patternListOptionNames(),
    })) ?? null
  );
}
