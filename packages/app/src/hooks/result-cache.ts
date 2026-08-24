/**
 * The per-result promise cache every post-hoc trace derivation wants.
 *
 * A derivation (rule provenance, description provenance) is a pure function of
 * one `TraceResult`, several consumers mount per run, and the walk is not
 * cheap. So it is cached on the immutable result object itself: it runs ONCE
 * per run however many consumers ask, and — just as important — every consumer
 * settles on the SAME value identity, which is what lets their memoized
 * derivations downstream agree instead of each re-deriving from an equal but
 * distinct value.
 *
 * The `.catch` is the reason this is shared rather than written twice. A throw
 * inside the walk is "unavailable", exactly like a run that lacks the data: the
 * surface renders nothing either way. It has to be caught INSIDE the cached
 * chain, so the cache never holds a REJECTED promise — every later consumer of
 * this result would otherwise get its own rejection to handle, and the one that
 * arrives after its hook has already settled would have nowhere to report it.
 * The two call sites had that argued out in a five-line comment on one side and
 * missing entirely on the other; now there is one answer.
 */

/**
 * @param compute The derivation. `deps` is whatever it needs besides the key —
 * in practice the loaded engine module, which is a singleton, so it takes NO
 * part in the cache key: a second call for the same key returns the first
 * call's promise whatever `deps` is handed in.
 */
export function makeResultCache<Key extends WeakKey, Deps, Value>(
  compute: (deps: Deps, key: Key) => Value | null,
): (deps: Deps, key: Key) => Promise<Value | null> {
  const cache = new WeakMap<Key, Promise<Value | null>>();
  return (deps, key) => {
    let promise = cache.get(key);
    if (!promise) {
      promise = Promise.resolve()
        .then(() => compute(deps, key) ?? null)
        .catch(() => null);
      cache.set(key, promise);
    }
    return promise;
  };
}
