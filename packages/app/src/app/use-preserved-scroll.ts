import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

/**
 * Roadmap 023/075: hold the reader's scroll across a re-run.
 *
 * The capture and the restore are one mechanism and were ~500 lines apart in
 * `App` — a ref and a layout effect near the top, the write that arms them deep
 * inside `executeRun`. Neither half means anything alone, and the ordering
 * between them (capture BEFORE the commit, restore AFTER the paint) is the
 * whole correctness argument, so they belong in one place where that argument
 * can be read once.
 */

interface ScrollPositions {
  page: number;
  results: number;
}

export interface PreservedScroll {
  /**
   * Called one statement before the result commits — not by the caller before
   * its `await`. An abandoned in-flight run must not pin a stale offset.
   *
   * `false` = this run should NOT preserve position (a fresh config, a share
   * link, or the first run).
   */
  capture: (preserve: boolean) => void;
}

/**
 * @param result the run result — the restore's TRIGGER, not an input to it.
 * The positions come from a ref captured before the run committed, and the
 * run's commit is the layout the restore has to run against. Nothing is read
 * out of it, and there is nothing in it to read.
 */
export function usePreservedScroll(
  resultsColRef: RefObject<HTMLDivElement | null>,
  result: unknown,
): PreservedScroll {
  /**
   * Roadmap 075: BOTH positions, because which one is "the reader's" now
   * depends on the viewport. In the shell the page does not scroll at all and
   * the results pane is its own scroller; stacked (below ~60rem) the pane is
   * `overflow: visible` and the page scrolls exactly as it used to. Capturing
   * and restoring both costs two property reads and makes the answer
   * independent of the breakpoint — the inapplicable half is 0 either way, and
   * restoring 0 to a container that cannot scroll is a no-op.
   */
  const savedRef = useRef<ScrollPositions | null>(null);

  const capture = useCallback(
    (preserve: boolean) => {
      savedRef.current = preserve
        ? { page: window.scrollY, results: resultsColRef.current?.scrollTop ?? 0 }
        : null;
    },
    [resultsColRef],
  );

  useLayoutEffect(() => {
    const saved = savedRef.current;
    if (saved !== null) {
      savedRef.current = null;
      window.scrollTo({ top: saved.page, behavior: "auto" });
      if (resultsColRef.current) {
        resultsColRef.current.scrollTop = saved.results;
      }
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `result` is the TRIGGER: the positions come from a ref captured before the run committed, and the run's commit is the layout this restore has to run against. Nothing is read out of the result, and there is nothing in it to read.
  }, [result, resultsColRef]);

  return { capture };
}
