import { DataTable } from "@/components/DataTable";
import type { DataTableNoun } from "@/components/data-table";
import { EmptyNote } from "@/components/EmptyNote";
import { nf, plural } from "@/lib/format";
import { RepoConnectPanel } from "@/components/RepoConnectPanel";
import {
  DEP_COLUMNS,
  DEP_DEFAULT_GROUPING,
  DEP_GROUPINGS,
  type DepRowActions,
  depTableRows,
} from "./dep-rows";
import type { RepoConnectOffer, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 089 — the Dependencies tab: every dependency Renovate's own
 * extraction found in the loaded repository, as the standard data table
 * (`components/DataTable`).
 *
 * It is the FULL searchable list, deliberately uncapped: the Tests tab's
 * From-repository picker shows five rows because it is a picker inside a card
 * that must keep its height, and 087 made the search the way to its tail. This
 * tab IS the tail — a reader who opens it is asking to see the repository's
 * dependencies, not to pick one quickly — so the cap has nothing to protect
 * here.
 *
 * Everything the two row actions do belongs to the shell (a pin is App's list;
 * the simulator is another tab), so they arrive as props. The panel decides
 * only what to draw for each state of the discovery.
 */

const DEP_NOUN: DataTableNoun = { one: "dependency", many: "dependencies" };

/** The footnotes the table cannot say itself — matched files that turned out
 *  to hold nothing, and what honestly was not read at all. Silent when there
 *  is nothing to report; where the rows came from is the toolbar's note. */
function DependenciesNote({ view }: { view: RepoDepsView }) {
  const emptyFiles = view.files.filter((file) => file.outcome === "no-deps").length;
  const parts: string[] = [];
  if (emptyFiles > 0) {
    parts.push(`${plural(emptyFiles, "matched file")} did not contain any dependencies`);
  }
  if (view.skippedFiles > 0) {
    parts.push(`${nf.format(view.skippedFiles)} matched files not read`);
  }
  if (view.truncated) {
    parts.push("the repository’s file listing was truncated");
  }
  return parts.length === 0 ? null : <p className="data-table-note">{parts.join(" · ")}</p>;
}

function DependenciesError({ view, onRetry }: { view: RepoDepsView; onRetry: () => void }) {
  return (
    <div className="data-table-status">
      <p className="sim-empty-guard">
        Could not read {view.repo}: {view.error}
      </p>
      <button type="button" className="btn-quiet" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function DependenciesPanel({
  view,
  connect,
  onRetry,
  onPin,
  onOpenInSimulator,
}: {
  view: RepoDepsView;
  /** What to offer while no repository is loaded — the shell's. */
  connect: RepoConnectOffer;
  /** Re-runs discovery after a failure; the FIRST run is the shell's own
   *  (it fires when this tab becomes the active one, never on the load). */
  onRetry: () => void;
} & DepRowActions) {
  if (view.repo === "") {
    return <RepoConnectPanel offer={connect} />;
  }
  if (view.status === "idle" || view.status === "loading") {
    return <p className="data-table-status">Reading {view.repo}’s package files…</p>;
  }
  if (view.status === "error") {
    return <DependenciesError view={view} onRetry={onRetry} />;
  }
  if (view.deps.length === 0) {
    return (
      <EmptyNote>
        No dependencies detected in {view.repo}’s package files — nothing the browser engine can
        read declared one.
      </EmptyNote>
    );
  }
  return (
    <>
      <DataTable
        rows={depTableRows(view.deps, { onPin, onOpenInSimulator })}
        columns={DEP_COLUMNS}
        groupings={DEP_GROUPINGS}
        defaultGroupingId={DEP_DEFAULT_GROUPING}
        leadLabel="Dependency"
        rowNoun={DEP_NOUN}
        filterPlaceholder={`Filter ${nf.format(view.deps.length)} ${
          view.deps.length === 1 ? DEP_NOUN.one : DEP_NOUN.many
        } across ${plural(view.fileCount, "package file")}…`}
        contextNote={`from ${view.repo}`}
      />
      <DependenciesNote view={view} />
    </>
  );
}
