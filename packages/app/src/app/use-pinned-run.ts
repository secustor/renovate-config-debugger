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
  /**
   * Roadmap 091: the starter pins, seeded once. Called by `useStarterPins` on
   * the first settled run — with the descriptors it derived, or with none when
   * it derived none. Either way the latch trips, so this fires at most once
   * per session and a reader who deletes a starter never sees it return.
   */
  seedStarterPins: (forms: FormState[]) => void;
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
  /**
   * Roadmap 091: the seeding latch — true once the list has been touched by
   * anything at all: a pin made, a pin removed, a link's pins installed, or
   * the one seeding itself. A ref, not state: it gates a decision taken inside
   * a callback, and a re-render is neither needed nor wanted when it flips.
   */
  const pinsTouchedRef = useRef(false);
  const addPin = useCallback(
    (form: FormState) => {
      pinsTouchedRef.current = true;
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
    pinsTouchedRef.current = true;
    setPins((prev) => prev.filter((pin) => pin.id !== id));
  }, []);
  // Roadmap 091: seeded, never authored — so it happens only into a list
  // nothing has touched yet, and it is itself a touch.
  const seedStarterPins = useCallback(
    (forms: FormState[]) => {
      if (pinsTouchedRef.current) {
        return;
      }
      pinsTouchedRef.current = true;
      if (forms.length === 0) {
        return;
      }
      setPins((prev) =>
        prev.length > 0
          ? prev
          : forms.slice(0, MAX_PINS).map((form) => ({ id: nextPinId(), form, starter: true })),
      );
    },
    [nextPinId],
  );
  // Roadmap 075 (iteration 6): the link's pins, with ids minted here.
  const setPinsFromShare = useCallback(
    (shared: Record<string, string>[]) => {
      const installed = pinsFromShareFields(shared, nextPinId);
      // Roadmap 091: every link arrival calls this, with `[]` when the link
      // carried no pins — only one that actually INSTALLS pins is a list the
      // reader was handed, and only that one may stop the starters. A link
      // without pins is someone else's config on this reader's screen, which
      // is exactly the case the starters were written for.
      if (installed.length > 0) {
        pinsTouchedRef.current = true;
      }
      setPins(installed);
    },
    [nextPinId],
  );
  // Roadmap 075 (iteration 6): the pinned tests travel with the config they are
  // tests OF — a link that reproduces the run without them reproduces the wrong
  // screen. Descriptors only (the same fields `sim.form` carries), so this adds
  // no new class of data to a link.
  //
  // Roadmap 091: starters are left behind. They are not the sharer's tests —
  // they are what this app made up from the config the link already carries,
  // so the opener's own first run derives them again, from their own rules,
  // marked as starters there too. Sharing them would hand someone else's
  // reader two authored-looking pins nobody wrote.
  const pinsAsShareFields = useCallback(
    () => pins.filter((pin) => pin.starter !== true).map((pin) => pinShareFields(pin.form)),
    [pins],
  );

  return { pins, addPin, removePin, seedStarterPins, setPinsFromShare, pinsAsShareFields };
}
