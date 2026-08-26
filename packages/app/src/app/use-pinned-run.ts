/**
 * Roadmap 075 (iteration 6), extracted under 033/048's decomposition rule — the
 * pinned tests as one hook: the list, the ids minted for it, the two ways a
 * reader changes it, and both directions of the share round trip.
 *
 * A pin is a dependency descriptor the Tests tab re-simulates against every
 * run, so the state has to sit above the panel that evaluates it: a share link
 * carries the descriptors (the decode path installs them before the link's own
 * auto-run), and the tab strip's count is one of the numbers `useRunSummary`
 * assembles. What a pin MEANS — and the evaluation itself — stays where it
 * already was: `features/simulator/pins.ts` for the descriptor rules, the
 * panel's `usePinnedTests` for the per-run re-simulation, keyed on the run.
 *
 * Ids are minted here and never shared: a link carries descriptors, and two
 * sessions minting `pin-1` for different dependencies would collide the moment
 * a reader pinned one of their own.
 *
 * Nothing here is an effect and nothing reads a run — this cluster is a list
 * and its edits. Where a pin gesture ALSO moves the reader (a tab switch after
 * pinning from the detail view) that composition stays in App, which is what
 * owns the tab.
 */
import { useCallback, useRef, useState } from "react";
import {
  MAX_PINS,
  pinShareFields,
  pinsFromShareFields,
  samePinForm,
} from "@/features/simulator/pins";
import type { FormState, PinnedTest } from "@/types/simulator";

export interface PinnedRun {
  pins: PinnedTest[];
  addPin: (form: FormState) => void;
  removePin: (id: string) => void;
  /** The decode side: a link's descriptors, with ids minted here. */
  setPinsFromShare: (shared: Record<string, string>[]) => void;
  /**
   * The encode side. A function rather than a value so nothing is serialized
   * until a link is actually built — `buildShareState` is the only caller, and
   * it runs on the copy gesture, not on every render.
   */
  pinsAsShareFields: () => Record<string, string>[];
}

export function usePinnedRun(): PinnedRun {
  const [pins, setPins] = useState<PinnedTest[]>([]);
  const pinSeqRef = useRef(0);
  const nextPinId = useCallback(() => `pin-${++pinSeqRef.current}`, []);
  const addPin = useCallback(
    (form: FormState) => {
      // Roadmap 080: the detail view's pin leaves the form on screen, so a
      // repeated click reaches here with the same descriptor — an identical
      // test is a no-op, not a second row.
      setPins((prev) =>
        prev.length >= MAX_PINS || prev.some((pin) => samePinForm(pin.form, form))
          ? prev
          : [...prev, { id: nextPinId(), form }],
      );
    },
    [nextPinId],
  );
  const removePin = useCallback((id: string) => {
    setPins((prev) => prev.filter((pin) => pin.id !== id));
  }, []);
  // Roadmap 075 (iteration 6): the link's pins, with ids minted here.
  const setPinsFromShare = useCallback(
    (shared: Record<string, string>[]) => {
      setPins(pinsFromShareFields(shared, nextPinId));
    },
    [nextPinId],
  );
  // Roadmap 075 (iteration 6): the pinned tests travel with the config they are
  // tests OF — a link that reproduces the run without them reproduces the wrong
  // screen. Descriptors only (the same fields `sim.form` carries), so this adds
  // no new class of data to a link.
  const pinsAsShareFields = useCallback(() => pins.map((pin) => pinShareFields(pin.form)), [pins]);

  return { pins, addPin, removePin, setPinsFromShare, pinsAsShareFields };
}
