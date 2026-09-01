import { type Dispatch, type RefObject, type SetStateAction, useEffect, useRef } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import type { SimRequest } from "@/hooks/use-share-link";
import { pinFormFromShareFields } from "./pins";
import type { Simulate } from "./use-simulation-run";
import type { FormState } from "@/types/simulator";

// Roadmap 018/048: `SimRequest` is declared once, in hooks/use-share-link.ts
// (the module that actually produces one, from a decoded share link) — this
// used to be a second, structurally-identical copy of that interface.
// Re-exported (not just imported) instead of duplicated, so there is one
// source of truth: RuleSimulator.tsx imports its `SimRequest` from THIS
// module, not from the hook, and is outside this change's file list.
export type { SimRequest };

/**
 * Roadmap 018: apply a decoded share link's simulator inputs once (by nonce —
 * `seenResult` below notes the one remount that can repeat it), to the result
 * the link that carried them produced — the resolving end of the attribution
 * invariant stated in `hooks/use-share-link.ts`.
 * Whether the link opened on mount or via hashchange never enters into it:
 * the request either names its result outright or is held until one arrives
 * that the request predates. Called AFTER `useSimulationRun` so its effect
 * wins for a decoded link (the run's reset clears, then this re-populates).
 */
export function useShareLinkRequest({
  simRequest,
  result,
  setForm,
  setUpdateTypeTouched,
  simulateRef,
  onThreadRequest,
}: {
  simRequest: SimRequest | null | undefined;
  result: TraceResult;
  setForm: Dispatch<SetStateAction<FormState>>;
  setUpdateTypeTouched: Dispatch<SetStateAction<boolean>>;
  simulateRef: RefObject<Simulate | null>;
  /** Roadmap 054: the verdict thread the link asked to open, armed BEFORE the
   *  auto-run below so the run that arrives can expand it (see
   *  `use-thread-nav`, which consumes it in its own reset effect). */
  onThreadRequest?: (key: string | null) => void;
}) {
  // Roadmap 018: applied-once bookkeeping for an incoming share `simRequest`.
  const appliedSimNonce = useRef<number | null>(null);
  // Roadmap 068 review: the result this effect saw last time it looked, which
  // is what "already on screen when the request arrived" means below. Null
  // until the first look.
  //
  // A request that names no result is waiting for one it predates, and the two
  // ways its link can have produced none are both answered by that: the run
  // threw, so the verdict that was up stays up and is exactly what this ref
  // holds — the run the user gets after fixing the config is a different object;
  // or the run returned a trace with no effective config, and the panel is not
  // mounted for such a result at all (ResultsColumn renders an empty note), so
  // the run that fixes it mounts this hook fresh and is its first look.
  //
  // Ninth review, verified and deliberately not rewritten a fourth time — with
  // the two edges the identity test does have, neither of which drops a request:
  //  - the panel's mount can LAG the result, since the results column is a lazy
  //    chunk. A first look is therefore a result that postdates the request only
  //    because runs are serial: a request in hand means the link's own run has
  //    settled, so the mounting result is either that run's or a later one —
  //    unless the chunk is STILL downloading a whole run later, the one window
  //    in which a first look could be an older verdict.
  //  - both refs die with the panel, and the panel unmounts on any run without
  //    an effective config. A request that names a result survives that intact
  //    (no later result can equal it); one that names none is applied again on
  //    the next mount, to a form the unmount had already emptied.
  const seenResult = useRef<TraceResult | null>(null);

  useEffect(() => {
    const previouslySeen = seenResult.current;
    seenResult.current = result;
    if (!simRequest || appliedSimNonce.current === simRequest.nonce || !result.finalConfig) {
      return;
    }
    // The attribution rule (see `use-share-link.ts` for why it is this and not
    // a timing flag): a request goes to the result its own link produced. When
    // that run produced one the request names it, so the test is literal
    // identity; when it produced none — it failed, or the config the link
    // shipped never parsed, and either way there is nothing here to simulate
    // against — the request waits for a result it predates, the run the user
    // gets after fixing the config, since a newer link would have replaced
    // this request rather than let it wait. Neither branch can pick the
    // verdict that was already on screen when the link arrived.
    const isOwnResult =
      simRequest.ranResult === null ? result !== previouslySeen : result === simRequest.ranResult;
    if (!isOwnResult) {
      return;
    }
    appliedSimNonce.current = simRequest.nonce;
    const next = pinFormFromShareFields(simRequest.form);
    setForm(next);
    // The link always encodes the EFFECTIVE updateType, so a non-empty one is a
    // deliberate pin — mark it touched so derivation can't override it.
    const touched = next.updateType.trim() !== "";
    setUpdateTypeTouched(touched);
    onThreadRequest?.(simRequest.simThread ?? null);
    if (simRequest.autoSimulate) {
      // Roadmap 044: the link's own merge-step index has already been applied
      // by App — this auto-run must not reset it back to step 0, which is the
      // whole point of a link that says "look at what THIS rule does".
      void simulateRef.current?.(next, touched, true);
    }
  }, [simRequest, result, setForm, setUpdateTypeTouched, simulateRef, onThreadRequest]);
}
