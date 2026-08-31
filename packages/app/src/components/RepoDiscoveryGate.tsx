import type { ReactNode } from "react";
import { RepoConnectPanel } from "./RepoConnectPanel";
import type { RepoConnectOffer, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 089/090 — what a surface built on repository discovery answers with
 * before the walk has anything to report: no repository loaded is an OFFER,
 * reading and failed are STATUSES, and none of them may be drawn as an empty
 * list or a track of zeros.
 *
 * Shared because the Dependencies tab and the Pipeline tab's Extract phase are
 * two doors onto ONE discovery and must answer identically; the promotion rule
 * (see `RepoConnectPanel`, promoted for the same pair) puts it here rather than
 * in either slice, which may not import the other.
 *
 * What "nothing was found" means stays the CONSUMER's — no dependencies is not
 * the same fact as no matched files — so that state is one of the `children`.
 */
export function RepoDiscoveryGate({
  view,
  connect,
  onRetry,
  children,
}: {
  view: RepoDepsView;
  /** What to offer while no repository is loaded — the shell's. */
  connect: RepoConnectOffer;
  /** Re-runs discovery after a failure; the FIRST run is the shell's own (it
   *  fires when the surface becomes visible, never on the load). */
  onRetry: () => void;
  /** Drawn once discovery has reported. */
  children: ReactNode;
}) {
  if (view.repo === "") {
    return <RepoConnectPanel offer={connect} />;
  }
  if (view.status === "idle" || view.status === "loading") {
    return <p className="repo-status">Reading {view.repo}’s package files…</p>;
  }
  if (view.status === "error") {
    return (
      <div className="repo-status">
        <p className="sim-empty-guard">
          Could not read {view.repo}: {view.error}
        </p>
        <button type="button" className="btn-quiet" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return children;
}
