import { useMemo, useState } from "react";
import { EmptyNote } from "@/components/EmptyNote";
import { RepoDiscoveryGate } from "@/components/RepoDiscoveryGate";
import { ExtractDepsCard } from "./ExtractDepsCard";
import { ExtractFilesCard } from "./ExtractFilesCard";
import { ExtractManagersCard } from "./ExtractManagersCard";
import { ExtractTrack } from "./ExtractTrack";
import { type ExtractNode, type ExtractNodeId, extractNodes } from "./extract-phase";
import type { RepoConnectOffer, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — the Pipeline tab's Extract phase: what Renovate's extraction
 * did to the loaded repository, as the three steps it actually performs.
 *
 * The states before the walk has anything to report are the Dependencies tab's
 * (089) — literally, through the shared `RepoDiscoveryGate`: none of them may
 * be drawn as a track of zeros, since three green nodes reading 0/0/+0 would
 * claim a walk that never ran.
 *
 * The Extract-deps node is selected first because it is the phase's RESULT;
 * the two before it explain how it was arrived at, which is a question a
 * reader asks second.
 */

export interface ExtractPhaseProps {
  view: RepoDepsView;
  /** What to offer while no repository is loaded — the shell's. */
  connect: RepoConnectOffer;
  /** Re-runs discovery after a failure; the FIRST run is the shell's own (it
   *  fires when this phase becomes the visible one, never on the load). */
  onRetry: () => void;
  /** Jumps to the Dependencies tab — the shell owns tab switching. */
  onOpenDependencies: () => void;
}

function ExtractCardHeader({ node }: { node: ExtractNode }) {
  return (
    <div className="card-title">
      {node.label}
      <span className="card-title-hint"> — {node.outcome}</span>
    </div>
  );
}

function ExtractCardBody({
  node,
  view,
  onOpenDependencies,
}: {
  node: ExtractNodeId;
  view: RepoDepsView;
  onOpenDependencies: () => void;
}) {
  if (node === "managers") {
    return <ExtractManagersCard view={view} />;
  }
  if (node === "files") {
    return <ExtractFilesCard view={view} />;
  }
  return <ExtractDepsCard view={view} onOpenDependencies={onOpenDependencies} />;
}

function ExtractReport({
  view,
  onOpenDependencies,
}: {
  view: RepoDepsView;
  onOpenDependencies: () => void;
}) {
  const [selected, setSelected] = useState<ExtractNodeId>("deps");
  const nodes = useMemo(() => extractNodes(view), [view]);
  const node = nodes.find((candidate) => candidate.id === selected) ?? nodes[0];
  if (node === undefined) {
    return null;
  }
  return (
    <>
      <ExtractTrack nodes={nodes} selected={node.id} onSelect={setSelected} />
      <div className="card">
        <ExtractCardHeader node={node} />
        <ExtractCardBody node={node.id} view={view} onOpenDependencies={onOpenDependencies} />
      </div>
    </>
  );
}

export function ExtractPhase({ view, connect, onRetry, onOpenDependencies }: ExtractPhaseProps) {
  return (
    <RepoDiscoveryGate view={view} connect={connect} onRetry={onRetry}>
      {view.files.length === 0 ? (
        <EmptyNote>
          No package files matched in {view.repo} — none of the managers the browser engine can run
          claims a file in this repository.
        </EmptyNote>
      ) : (
        <ExtractReport view={view} onOpenDependencies={onOpenDependencies} />
      )}
    </RepoDiscoveryGate>
  );
}
