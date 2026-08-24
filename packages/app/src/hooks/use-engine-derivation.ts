import { useEffect, useState } from "react";
import type * as EngineModule from "@renovate-config-debugger/engine";
import { loadEngine } from "@/platform/engine-chunk";

/** The derivation itself: everything it reads is declared in `deps` beside it. */
type Derive<Value> = (engine: typeof EngineModule) => Value | null | PromiseLike<Value | null>;

/**
 * The one shape every post-hoc trace derivation loads through: the engine
 * arrives via the same dynamic `import()` that keeps the renovate chunk off the
 * critical path, and the result is reported as `undefined` = loading / not
 * applicable yet, `null` = unavailable (the run lacks the data, preset
 * resolution never finished, or the chunk itself failed to load).
 *
 * Typed off a type-only import declaration (erased at build time, so the engine
 * still arrives only via the dynamic `import()` in `platform/engine-chunk`).
 *
 * A failed chunk load (offline, a stale deploy) or a throw inside the
 * derivation is "unavailable", exactly like a run that lacks the data: the
 * surface renders nothing either way. Caught here rather than at each call
 * site, because the alternative is an unhandled rejection plus a consumer
 * wedged on `undefined` — "still loading" — forever.
 *
 * `deps` is the FULL identity of the derivation — the values `derive` reads.
 * `derive` itself is never a dependency: it closes over this render's props and
 * is therefore redeclared every render, so depending on it would re-run the
 * derivation on every keystroke. It is CAPTURED ALONGSIDE the deps instead, in
 * the same piece of state, so the effect's one dependency carries the closure it
 * is going to run rather than reaching outside itself for it. Which closure that
 * is never differs from "the latest": the capture happens in the render that
 * observed the new deps, and by the contract above the deps are the whole
 * identity of what `derive` reads.
 *
 * The stale state is discarded DURING RENDER, not in the effect. Effects run
 * after the commit, so a reset made there paints one frame in which the new
 * inputs are paired with the PREVIOUS run's derivation — and that pairing is
 * actively wrong rather than merely stale, because preset node ids (`p1`, `p2`,
 * …) are minted per run: the old attribution's ids resolve against the new
 * tree, and a row flashes attributed to whichever preset inherited the id.
 * React's "adjust state when a prop changes" idiom re-renders the component
 * immediately, before anything is committed, so no such frame exists.
 *
 * Pass `derive: null` for "nothing to derive right now" (no result yet, an
 * inactive view): the hook holds `undefined` and never touches the engine.
 */
export function useEngineDerivation<Value>(
  deps: readonly unknown[],
  derive: Derive<Value> | null,
): Value | null | undefined {
  const [state, setState] = useState<Value | null | undefined>(undefined);
  const [owner, setOwner] = useState<{ deps: readonly unknown[]; derive: Derive<Value> | null }>({
    deps,
    derive,
  });
  const fresh = sameDeps(owner.deps, deps);
  if (!fresh) {
    setOwner({ deps, derive });
    setState(undefined);
  }
  // `owner` — not `deps` — is the dependency: it is the same object identity
  // until the render-time comparison above swaps it, which makes this a literal
  // one-element list whose churn is exactly "the derivation's inputs changed",
  // and whose one element is also where the effect reads the derivation from.
  useEffect(() => {
    const run = owner.derive;
    if (!run) {
      return;
    }
    let live = true;
    void (async () => {
      let value: Value | null;
      try {
        value = await run(await loadEngine());
      } catch {
        value = null;
      }
      if (live) {
        setState(value);
      }
    })();
    return () => {
      live = false;
    };
  }, [owner]);
  // Guarded rather than returned raw: React discards the output of the render
  // that called `setState` above, but this component's body still RAN with the
  // pre-reset `state` in hand, and a consumer that reads the return value into
  // something other than JSX (a ref, a log, a callback) would see it.
  return fresh ? state : undefined;
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}
