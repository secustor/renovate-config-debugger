/**
 * Roadmap 028/069/083, extracted under 033/048's decomposition rule — the
 * numbers the results panels report BACK up, and the one signal that goes the
 * other way.
 *
 * Two of these are counts App cannot derive: the Effective config tab's key
 * tally and the Overview tab's behavior count are async engine derivations the
 * panels own, so the badge has to quote the number the panel actually rendered
 * rather than a second computation of it. Both are `null` until their panel
 * reports — a badge-less tab, never a wrong zero (the 028 rule).
 *
 * THE POINT OF THIS HOOK IS THAT THEY RESET TOGETHER. A new run invalidates
 * every one of them at once, and holding them apart is how that stops being
 * true: roadmap 083's review found `overviewBehaviors` surviving a re-run —
 * a fresh run wearing the previous run's badge — because the line resetting it
 * had to be remembered beside `setEffectiveStats(null)` and was not. Adding a
 * fourth panel-reported count means adding it to `resetPanelStats` in the same
 * breath, because there is nowhere else to put it.
 *
 * `descriptionLedgerNonce` is the signal in the other direction (App asks the
 * effective-config view to land on the `description` row's blame ledger) and
 * lives here because it is the same App↔panel channel — but it is deliberately
 * NOT reset: it is a request counter, not a count OF anything, and every value
 * of it means the same thing. Only a CHANGE in it asks for anything, so
 * resetting it on a new run would fire a landing nobody asked for.
 */
import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import type { EffectiveTally } from "@/lib/effective-tally";

export interface PanelStats {
  effectiveStats: EffectiveTally | null;
  setEffectiveStats: Dispatch<SetStateAction<EffectiveTally | null>>;
  overviewBehaviors: number | null;
  setOverviewBehaviors: Dispatch<SetStateAction<number | null>>;
  descriptionLedgerNonce: number;
  /** Asks the effective-config view for the `description` row's blame ledger.
   *  Identity-stable; where that lands the reader is App's business. */
  requestDescriptionLedger: () => void;
  /** Everything a new run invalidates — see this file's header. */
  resetPanelStats: () => void;
}

export function usePanelStats(): PanelStats {
  // Roadmap 028/029: the Effective config tab's badge + digest numbers,
  // reported by the view itself (it owns the async provenance computation)
  // rather than recomputed here. null = not known yet.
  const [effectiveStats, setEffectiveStats] = useState<EffectiveTally | null>(null);
  // Roadmap 083: the Overview tab's badge — how many author-written sentences
  // its card lists. Reported by that panel for the same reason `effectiveStats`
  // is: the description provenance behind it is an async engine derivation the
  // panel owns, and the badge must quote the number the card actually printed.
  // null = not known yet, which is a badge-less tab rather than a zero.
  const [overviewBehaviors, setOverviewBehaviors] = useState<number | null>(null);
  // Roadmap 069: bumped by the description digest card's "show raw order" link
  // to land on the effective config's `description` row and its blame ledger.
  const [descriptionLedgerNonce, setDescriptionLedgerNonce] = useState(0);

  const requestDescriptionLedger = useCallback(() => {
    setDescriptionLedgerNonce((n) => n + 1);
  }, []);

  // Roadmap 028: a new run invalidates the previous run's async counts — the
  // effective key stats and the Overview's behavior count (083), both
  // recomputed by their views once the new derivations settle.
  const resetPanelStats = useCallback(() => {
    setEffectiveStats(null);
    setOverviewBehaviors(null);
  }, []);

  return {
    effectiveStats,
    setEffectiveStats,
    overviewBehaviors,
    setOverviewBehaviors,
    descriptionLedgerNonce,
    requestDescriptionLedger,
    resetPanelStats,
  };
}
