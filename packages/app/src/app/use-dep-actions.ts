import { useRef, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { useStableCallback } from "@/hooks/use-stable-callback";
import type { SimRequest } from "@/hooks/use-share-link";
import { EMPTY_FORM } from "@/features/simulator/form";
import { pinShareFields } from "@/features/simulator/pins";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 089, extracted under 033/048's decomposition rule — what a
 * Dependencies row's two buttons DO, as one cluster.
 *
 * Both are the SHELL's acts, not the tab's: a pin joins the list `usePinnedRun`
 * owns, the simulator is another tab, and completing an extracted descriptor
 * into a form needs `EMPTY_FORM` from the simulator slice, which only the shell
 * may reach. The panel is handed two identity-stable callbacks and performs
 * neither itself.
 *
 * `jumpToTab` rather than a plain tab set: the reader is being sent somewhere
 * by a click on a row, so the one-step way back to the Dependencies tab is
 * recorded — the same rule every other cross-tab link in the app follows.
 */

/** Where a Dependencies row's simulator request starts counting DOWN from.
 *  Three channels mint into one `SimRequest` slot — the share hook (0, 1, 2 …),
 *  `TestsPanel`'s pin link (-1, -2 …) and this one — and `useShareLinkRequest`
 *  applies a request once by nonce, so the ranges must not meet. */
const DEP_SIM_NONCE_BASE = -1_000_000;

export interface DepActions {
  onPinDep: (fill: Partial<FormState>) => void;
  onOpenDepInSimulator: (fill: Partial<FormState>) => void;
  /** The request the Tests tab acts on: a dependency row's while it is still
   *  the newest thing asked for, the link's otherwise. */
  simRequest: SimRequest | null;
}

export function useDepActions({
  addPin,
  jumpToTab,
  shareRequest,
  result,
}: {
  addPin: (form: FormState) => void;
  jumpToTab: (tab: "tests") => void;
  /** The share hook's request, which rides in the same slot. */
  shareRequest: SimRequest | null;
  /** The run on screen — a dep request is attributed to it. */
  result: TraceResult | null;
}): DepActions {
  // Identity-stable for the panels; every call still runs this render's
  // closure (`useStableCallback`).
  const onPinDep = useStableCallback((fill: Partial<FormState>) => {
    addPin({ ...EMPTY_FORM, ...fill });
    jumpToTab("tests");
  });
  /**
   * "Open in simulator" from a dependency row: the same descriptor channel a
   * share link uses (`SimRequest`), so the form is filled and re-simulated by
   * the one mechanism that already does exactly that — and `TestsPanel` shows
   * its simulator view for it without a second switch of its own.
   *
   * It rides in the SAME slot as the link's request, and `after` is why that is
   * safe: a dep request records the share nonce it was minted under, and stops
   * being the current request the moment a NEW link arrives. So a link can
   * never be masked by a row somebody clicked ten minutes ago.
   */
  const [depSim, setDepSim] = useState<{ after: number | null; request: SimRequest } | null>(null);
  const depSimNonce = useRef(DEP_SIM_NONCE_BASE);
  const onOpenDepInSimulator = useStableCallback((fill: Partial<FormState>) => {
    const form: FormState = { ...EMPTY_FORM, ...fill };
    setDepSim({
      after: shareRequest?.nonce ?? null,
      request: {
        form: pinShareFields(form),
        autoSimulate: true,
        // The result on screen IS the one this request belongs to — the
        // attribution rule `useShareLinkRequest` asks of every request.
        ranResult: result,
        nonce: --depSimNonce.current,
      },
    });
    jumpToTab("tests");
  });

  return {
    onPinDep,
    onOpenDepInSimulator,
    simRequest:
      depSim !== null && depSim.after === (shareRequest?.nonce ?? null)
        ? depSim.request
        : shareRequest,
  };
}
