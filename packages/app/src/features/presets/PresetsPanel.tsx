import { memo, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import type { AuthState } from "@/components/GithubAuthHint";
import { PresetLedger } from "./PresetLedger";
import { PresetTree } from "./PresetTree";
import { useSyncedReset } from "@/hooks/use-synced-reset";

/**
 * Roadmap 075 (iteration 5b): the Presets tab, which now has two views.
 *
 * The LEDGER leads — "what did `extends` actually bring in?", one card per
 * top-level source. The TREE is the full resolution inventory, unchanged, one
 * click away; it owns the detail panel, the search box, the flat table and the
 * stats strip with its glossary hovers.
 *
 * The switch lives HERE rather than in App because nothing outside this tab
 * names a view: every cross-link into the tab (a provenance chip, a simulator
 * rule, an editor preset hover, a share link's `node`) names a NODE, and a node
 * is a tree thing. So an externally-set selection switches the tab to the tree
 * — the landing that follows (`landOnPresetNode` in App) looks for the selected
 * ROW, and it has to find one.
 */

export type PresetsView = "ledger" | "tree";

function TreeViewStrip({ onBack }: { onBack: () => void }) {
  return (
    <div className="summary-strip">
      <span>
        The full resolution tree — every preset your <code>extends</code> entries pulled in.
      </span>
      <button type="button" className="btn-quiet" onClick={onBack}>
        ← Back to summary
      </button>
    </div>
  );
}

export const PresetsPanel = memo(function PresetsPanel({
  result,
  onInject,
  selectedId,
  onSelectNode,
  authState,
  onSignIn,
  onShowDescriptionOrder,
}: {
  result: TraceResult;
  onInject: (key: string, content: Record<string, unknown>) => void;
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  authState: AuthState;
  onSignIn: () => void;
  onShowDescriptionOrder?: () => void;
}) {
  // A selection arriving from outside means "show me that node", and the node
  // lives in the tree. Including the very first render: a share link carrying
  // `node` (007) has App applying the selection in the same commit that mounts
  // this panel, so a panel that only watched for CHANGES would open on the
  // ledger and lose the link's whole point.
  const [view, setView] = useState<PresetsView>(selectedId ? "tree" : "ledger");
  // Later selections are synced DURING RENDER (the `EffectiveConfig` idiom): an
  // effect would put the tree one commit later than the selection, and App's
  // landing is already polling the DOM for the selected row by then.
  useSyncedReset(selectedId, () => {
    if (selectedId) {
      setView("tree");
    }
  });

  const root = result.presetTree;
  if (view === "ledger" && root) {
    return (
      <PresetLedger
        root={root}
        onOpenTree={() => setView("tree")}
        onOpenNode={(nodeId) => {
          // Both halves, deliberately: selecting a node that is ALREADY
          // selected would not trip the sync above, and the click still means
          // "take me to it".
          setView("tree");
          onSelectNode(nodeId);
        }}
      />
    );
  }
  return (
    <>
      <TreeViewStrip onBack={() => setView("ledger")} />
      <PresetTree
        result={result}
        onInject={onInject}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
        authState={authState}
        onSignIn={onSignIn}
        onShowDescriptionOrder={onShowDescriptionOrder}
      />
    </>
  );
});
