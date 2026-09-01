import { lazy } from "react";
import type { ResultsColumnProps } from "@/app/ResultsColumn";
import { loadResultsColumn } from "@/app/preload-run-chunks";
import { ResultsBoundary } from "@/app/ResultsBoundary";

/**
 * The results half's lazy boundary, and the column wrapper it mounts into.
 *
 * Its preloader is a sibling module (`preload-run-chunks.ts`) because
 * `only-export-components` will not let one file export both.
 *
 * Split out of `App.tsx` as module furniture — it is not App's state or App's
 * composition, it is the chunk seam, and keeping it here means `App.tsx` opens
 * on the component rather than on 80 lines of setup.
 */

/** Roadmap 031: the whole results half (react-diff-view + diff + every
 *  result-only component) rides one lazy chunk — nothing behind this can
 *  render before a run, and a run downloads the far larger engine chunk
 *  first. Mounted once the first result exists and never unmounted again
 *  (`result` never returns to null and a resolved `lazy` never re-suspends),
 *  so the 028 always-mounted tab-shell state is untouched by the boundary. */
const ResultsColumn = lazy(() => loadResultsColumn().then((m) => ({ default: m.ResultsColumn })));

/**
 * Roadmap 031/040: the results half — its column wrapper and the column. The
 * lazy and error boundaries moved into `ResultsBoundary`, which is what keeps
 * this within 040's depth ratchet: the split's right-hand pane has one level
 * left. Props are the column's own, forwarded unchanged.
 */
export function ResultsPane(props: ResultsColumnProps) {
  // Destructured rather than `ref={props.resultsColRef}`: handing a MEMBER of
  // an object to `ref=` makes `react/refs` read the whole object as a ref, and
  // the spread below then counts as dereferencing it during render. Pulled out
  // by name it is what it always was — the column's own ref, forwarded.
  const { resultsColRef } = props;
  return (
    // Roadmap 068: `id`/`tabIndex` are the skip link's target — see the
    // config column's matching pair.
    <div className="results-col" id="results-column" tabIndex={-1} ref={resultsColRef}>
      {/* Roadmap 031: the results chunk is preloaded at idle and on Run
          intent, so the Suspense fallback is a formality — and once the lazy
          module has resolved, re-renders never suspend, so the mounted shell
          (and all its per-tab state) is never torn down by the boundary. A
          chunk that fails to load lands in the error half instead. */}
      <ResultsBoundary>
        <ResultsColumn {...props} />
      </ResultsBoundary>
    </div>
  );
}
