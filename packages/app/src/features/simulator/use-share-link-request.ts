import { type Dispatch, type RefObject, type SetStateAction, useEffect, useRef } from "react";
import type { TraceResult } from "@renovate-config-visualizer/engine";
import type { SimRequest } from "@/hooks/use-share-link";
import { EMPTY_FORM, type FormState } from "./form";
import type { Simulate } from "./use-simulation-run";

// Roadmap 018/048: `SimRequest` is declared once, in hooks/use-share-link.ts
// (the module that actually produces one, from a decoded share link) — this
// used to be a second, structurally-identical copy of that interface.
// Re-exported (not just imported) instead of duplicated, so there is one
// source of truth: RuleSimulator.tsx imports its `SimRequest` from THIS
// module, not from the hook, and is outside this change's file list.
export type { SimRequest };

/**
 * Roadmap 018: apply a decoded share link's simulator inputs exactly once (by
 * nonce). Depends on `result` too, so — whether the link opened on mount or
 * via hashchange — the form is applied (and optionally auto-run) against the
 * freshly-run config rather than a stale one. Called AFTER `useSimulationRun`
 * so its effect wins for a decoded link (the run's reset clears, then this
 * re-populates).
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

  useEffect(() => {
    if (!simRequest || appliedSimNonce.current === simRequest.nonce || !result.finalConfig) {
      return;
    }
    appliedSimNonce.current = simRequest.nonce;
    const next: FormState = { ...EMPTY_FORM };
    for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
      const value = simRequest.form[key];
      if (typeof value === "string") {
        next[key] = value;
      }
    }
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
