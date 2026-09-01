import { Component, Suspense, type ReactNode } from "react";

/**
 * The results half's failure containment: the lazy boundary AND the error
 * boundary around it.
 *
 * A rejected results chunk (offline, a stale deploy) is re-thrown by `lazy()`
 * at render — `preload-run-chunks.ts` swallows its own preload rejection
 * precisely so `lazy()` still sees the failure. Without a boundary that throw
 * unmounts the root, taking the config the reader was editing with it; the
 * repo's rule for exactly this case is "a degraded app, not a blank page"
 * (main.tsx, roadmap 033). Anything else the results tree throws during render
 * lands here too, and the config half stays mounted.
 *
 * Owns the `<Suspense>` as well so `ResultsPane` spends one JSX level here
 * instead of two — 040's depth ratchet leaves it exactly one.
 */

interface State {
  failed: boolean;
}

export class ResultsBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        // The banner classes AppBanners already owns — a page-level failure
        // reads the same wherever it comes from.
        <div className="share-error-banner" role="alert">
          <strong className="share-error-banner-title">The results couldn’t be shown</strong>
          <span>
            Reloading the page usually fixes this. Your config is still here — nothing you typed was
            lost.
          </span>
        </div>
      );
    }
    return <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}
