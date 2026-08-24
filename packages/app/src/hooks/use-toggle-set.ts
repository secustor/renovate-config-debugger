import { useCallback, useState } from "react";

/**
 * A set of open/expanded ids, with the handful of operations the app's
 * disclosure surfaces actually perform on one. Six components had written the
 * same `useState<ReadonlySet<string>>` plus copy-mutate-return updater — the
 * effective config's rows and bands, the preset ledger's cards, the preset
 * tree's rows, the ledger's rule families, and the simulator's threads.
 *
 * Two properties the copies had, kept here because callers rely on both:
 *
 * - every callback is identity-stable, so a memoized child does not re-render
 *   because its parent re-rendered;
 * - every operation that changes nothing returns the SAME set, so a no-op
 *   `add`/`retain` cannot cost a render (the preset tree runs `retain` on every
 *   new result, and most results keep every id).
 *
 * `reset` is a plain `setState` call and nothing more. Two callers invoke it
 * DURING RENDER — deliberately, and their comments say why — so it must never
 * grow an effect.
 */
export interface ToggleSet<T> {
  /** The current members. */
  set: ReadonlySet<T>;
  /** In if out, out if in. */
  toggle: (id: T) => void;
  add: (id: T) => void;
  remove: (id: T) => void;
  /** `add` for many, in one update. */
  addAll: (ids: Iterable<T>) => void;
  /** Keep only the members the predicate accepts — how a set of ids survives
   *  (or does not) a new run. */
  retain: (keep: (id: T) => boolean) => void;
  /** Replace the whole set; empty with no argument. */
  reset: (next?: ReadonlySet<T>) => void;
}

/** Shared so an empty reset assigns one frozen identity rather than minting a
 *  Set per call — which would defeat React's bail-out on unchanged state. */
const EMPTY: ReadonlySet<never> = new Set();

export function useToggleSet<T = string>(initial?: ReadonlySet<T>): ToggleSet<T> {
  const [set, setSet] = useState<ReadonlySet<T>>(initial ?? EMPTY);

  const toggle = useCallback((id: T) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const add = useCallback((id: T) => {
    setSet((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const remove = useCallback((id: T) => {
    setSet((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const addAll = useCallback((ids: Iterable<T>) => {
    setSet((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const retain = useCallback((keep: (id: T) => boolean) => {
    setSet((prev) => {
      const next = new Set<T>();
      for (const id of prev) {
        if (keep(id)) {
          next.add(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const reset = useCallback((next?: ReadonlySet<T>) => {
    setSet(next ?? EMPTY);
  }, []);

  return { set, toggle, add, remove, addAll, retain, reset };
}
