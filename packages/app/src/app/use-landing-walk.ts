import { useCallback, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Roadmap 076 review: the landing → shell handshake.
 *
 * The landing's stage-walk narration IS the transition — the design walks all
 * eight stages and THEN docks the results in — so a sub-second run used to cut
 * it to a single frame. The commit that unmounts the landing, and only that
 * one, waits for the walk's own end signal.
 *
 * It was three refs, a module constant and a `Promise.race`, spread across
 * three parts of `App`: the docked flag near the top, the resolver ref and its
 * callback ~700 lines later, and the race inside `executeRun`. All of it serves
 * one rule, so it is one hook — the pieces are only comprehensible together.
 *
 * `App` keeps `executeRun`: this hook is the WAIT, not the run.
 */

/** Roadmap 076 review: what an uninterrupted walk takes end to end, plus
 *  slack. The cap is a safety net, not the mechanism — a signal that never
 *  comes (the one known path is a second run queued behind a failed first,
 *  whose walk never restarts) must DELAY the answer, never withhold it. */
const LANDING_WALK_CAP_MS = 4_000;

export interface LandingWalk {
  /** Fired by `StageRailPreview` when its narration has shown every frame. */
  onLandingWalkEnd: () => void;
  /**
   * Awaited by the run path around the commit that would unmount the landing.
   * Resolves immediately once the shell is docked, or when the reader has
   * asked for less motion — in both cases there is no walk to wait for.
   *
   * Takes the in-flight run so the two are awaited together rather than in
   * sequence. That is not a nicety: `Promise.all` attaches a rejection handler
   * to the run immediately, and a run that rejects while only the walk was
   * being awaited would surface as an unhandled rejection first.
   */
  awaitLandingWalk: (runPromise: Promise<unknown>) => Promise<void>;
  /** Called once the shell is up. A run that FAILED leaves this alone on
   *  purpose: the landing is still on screen, so the next run narrates again. */
  markShellDocked: () => void;
}

export function useLandingWalk(): LandingWalk {
  /** Roadmap 076 review: false until the first result commits — i.e. while the
   *  landing (and its stage-walk narration) is still on screen. A ref, not
   *  `result === null`, because `executeRun` runs from the queue with the
   *  closure it was enqueued under: a second run queued behind the first would
   *  still read the stale null and sit out a second walk. */
  const shellDockedRef = useRef(false);
  /** The resolver of the walk-end promise the first commit is holding for —
   *  armed by `awaitLandingWalk`, fired by `StageRailPreview`. Nulled after
   *  firing so a late signal (the timeout the preview schedules survives one
   *  render past the walk) resolves nothing twice. */
  const resolveRef = useRef<(() => void) | null>(null);

  const onLandingWalkEnd = useCallback(() => {
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  const markShellDocked = useCallback(() => {
    shellDockedRef.current = true;
  }, []);

  const awaitLandingWalk = useCallback(async (runPromise: Promise<unknown>) => {
    if (shellDockedRef.current || prefersReducedMotion()) {
      return;
    }
    const walkEnd = new Promise<void>((resolve) => {
      resolveRef.current = resolve;
    });
    await Promise.all([
      runPromise,
      Promise.race([
        walkEnd,
        new Promise((resolve) => window.setTimeout(resolve, LANDING_WALK_CAP_MS)),
      ]),
    ]);
  }, []);

  return { onLandingWalkEnd, awaitLandingWalk, markShellDocked };
}
