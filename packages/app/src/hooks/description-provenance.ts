import { useEffect, useState } from "react";
import type { DescriptionProvenance, TraceResult } from "@renovate-config-debugger/engine";

/**
 * Roadmap 069: per-string `description` provenance, loaded the way every other
 * post-hoc trace derivation is — through the same dynamic engine import that
 * keeps the renovate chunk off the critical path, with the per-result promise
 * cached on the immutable result object so the walk runs ONCE per run however
 * many consumers ask. Shaped like `rule-provenance.ts`, with the failure path
 * folded into the cached value (see below); PR 3's blame ledger and PR 4's tree
 * annotations are the further consumers this cache is for.
 */
const descriptionProvenanceCache = new WeakMap<
  TraceResult,
  Promise<DescriptionProvenance | null>
>();

function descriptionProvenanceFor(result: TraceResult): Promise<DescriptionProvenance | null> {
  let promise = descriptionProvenanceCache.get(result);
  if (!promise) {
    promise = import("@renovate-config-debugger/engine")
      .then((engine) => engine.computeDescriptionProvenance(result) ?? null)
      // A failed chunk load (offline, a stale deploy) or a throw inside the
      // walk is "unavailable", exactly like a run that lacks the data: the
      // card renders nothing either way. Caught INSIDE the cached chain so the
      // cache never holds a rejected promise — every later consumer of this
      // result would otherwise get its own unhandled rejection and hang on
      // `undefined` (= still loading) forever.
      .catch(() => null);
    descriptionProvenanceCache.set(result, promise);
  }
  return promise;
}

/**
 * `undefined` = loading / no result yet, `null` = unavailable (the run has no
 * final config, or preset resolution never finished).
 *
 * The stale state is discarded DURING RENDER, not in the effect. Effects run
 * after the commit, so a reset made there paints one frame in which the new
 * `result` is paired with the PREVIOUS run's provenance — and that pairing is
 * actively wrong rather than merely stale, because preset node ids (`p1`,
 * `p2`, …) are minted per run: the old attribution's ids resolve against the
 * new tree, and a sentence flashes attributed to whichever preset inherited
 * the id. React's "adjust state when a prop changes" idiom re-renders this
 * component immediately, before anything is committed, so no such frame exists.
 */
export function useDescriptionProvenance(
  result: TraceResult | null | undefined,
): DescriptionProvenance | null | undefined {
  const [state, setState] = useState<DescriptionProvenance | null | undefined>(undefined);
  const [stateOwner, setStateOwner] = useState(result);
  if (stateOwner !== result) {
    setStateOwner(result);
    setState(undefined);
  }
  useEffect(() => {
    if (!result) {
      return;
    }
    let live = true;
    void (async () => {
      const provenance = await descriptionProvenanceFor(result);
      if (live) {
        setState(provenance);
      }
    })();
    return () => {
      live = false;
    };
  }, [result]);
  // Guarded rather than returned raw: React discards the output of the render
  // that called `setState` above, but this component's body still RAN with the
  // pre-reset `state` in hand, and a consumer that reads the return value into
  // something other than JSX (a ref, a log, a callback) would see it.
  return stateOwner === result ? state : undefined;
}
