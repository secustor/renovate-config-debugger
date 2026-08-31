import { DataTable } from "@/components/DataTable";
import type { DataTableNoun } from "@/components/data-table";
import { EmptyNote } from "@/components/EmptyNote";
import { nf, plural } from "@/lib/format";
import { discoveryCaveats, tallyDiscovery } from "@/lib/discovery-caveats";
import { RepoDiscoveryGate } from "@/components/RepoDiscoveryGate";
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
 * only what to draw once discovery has reported — the states before that are
 * the shared `RepoDiscoveryGate`'s, which the Extract phase answers with too.
 */

const DEP_NOUN: DataTableNoun = { one: "dependency", many: "dependencies" };

/** The footnotes the table cannot say itself — matched files that turned out
 *  to hold nothing, and the shared caveat clauses every discovery surface
 *  prints from the same ledger. Silent when there is nothing to report; where
 *  the rows came from is the toolbar's note. */
function DependenciesNote({ view }: { view: RepoDepsView }) {
  const empty = tallyDiscovery(view).empty;
  const parts: string[] = [];
  if (empty > 0) {
    parts.push(`${plural(empty, "matched file")} did not contain any dependencies`);
  }
  parts.push(...discoveryCaveats(view));
  return parts.length === 0 ? null : <p className="data-table-note">{parts.join(" · ")}</p>;
}

function DependenciesTable({
  view,
  onPin,
  onOpenInSimulator,
}: { view: RepoDepsView } & DepRowActions) {
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
        } across ${plural(tallyDiscovery(view).extracted, "package file")}…`}
        contextNote={`from ${view.repo}`}
      />
      <DependenciesNote view={view} />
    </>
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
  connect: RepoConnectOffer;
  onRetry: () => void;
} & DepRowActions) {
  return (
    <RepoDiscoveryGate view={view} connect={connect} onRetry={onRetry}>
      {view.deps.length === 0 ? (
        <EmptyNote>
          No dependencies detected in {view.repo}’s package files — nothing the browser engine can
          read declared one.
        </EmptyNote>
      ) : (
        <DependenciesTable view={view} onPin={onPin} onOpenInSimulator={onOpenInSimulator} />
      )}
    </RepoDiscoveryGate>
  );
}
