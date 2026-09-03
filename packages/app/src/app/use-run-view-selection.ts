import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import type { StageId, TraceResult } from "@renovate-config-debugger/engine";
import { isNumber } from "@renovate-config-debugger/engine/is";
import {
  legacyTabForView,
  type ResultsTabId,
  resultsTabForShareTab,
  shareTabWantsMigrateStage,
} from "@/data/results-tabs";
import { useSyncedReset } from "@/hooks/use-synced-reset";
import { identityForNodeId, nodeIdForIdentity } from "@/lib/preset-tree-stats";
import type { ShareView } from "@/lib/share";

/**
 * What the reader is looking AT within a run: which pipeline stage, which
 * preset node, and where the migration stepper stands.
 *
 * Four state slots, but one subject — and the reason to name it is that the
 * subject has three behaviours that were 1,000 lines apart in `App` and are
 * only correct in relation to each other:
 *
 *  1. a new run RESETS the selection (during render, not in an effect);
 *  2. a decoded share link OVERRIDES that reset, on the commit after it;
 *  3. the same four fields are ENCODED back into a link.
 *
 * Rule 2 depends on rule 1's timing — the link's view has to land after the
 * reset or the reset wipes it — and rule 3 has to agree with rule 2 about what
 * each field means. Scattered, that agreement was three separate reads.
 */

export interface RunViewSelectionHost {
  /** The finished run. Drives the reset and gates the pending-link apply — the
   *  link's node identity needs a resolved preset tree to become a node id. */
  result: TraceResult | null;
  /** A link may name the results tab; that state belongs to the tab cluster. */
  setTab: (tab: ResultsTabId) => void;
}

export interface RunViewSelection {
  selectedStage: StageId;
  setSelectedStage: Dispatch<SetStateAction<StageId>>;
  /** Large stage diffs (preset, merge) take a while to render; deferring the
   *  stage keeps chip clicks responsive and makes the diff render
   *  interruptible instead of blocking the main thread. */
  deferredStage: StageId;
  selectedNodeId: string | null;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  migrationStepIndex: number;
  setMigrationStepIndex: Dispatch<SetStateAction<number>>;
  /** The share cluster's one way to arm a decoded link's view state. */
  setPendingView: (view: ShareView | null) => void;
  /**
   * These four fields as a link carries them. `tab` and `migrateStepperMounted`
   * come from the caller because they are not this cluster's: the tab is the
   * tab cluster's, and whether the stepper is mounted is a fact about the run.
   */
  toShareView: (tab: ResultsTabId, migrateStepperMounted: boolean) => ShareView;
}

export function useRunViewSelection(host: RunViewSelectionHost): RunViewSelection {
  const { result, setTab } = host;
  const [selectedStage, setSelectedStage] = useState<StageId>("preset");
  const deferredStage = useDeferredValue(selectedStage);
  /** Preset-tree selection is owned here so a provenance chain (005) can select
   *  a node in the tree. Node ids restart every run, so it resets on result. */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /** Migration stepper index, owned here so a shareable link (007) can restore
   *  the step; reset to 0 on a new result just like the uncontrolled stepper. */
  const [migrationStepIndex, setMigrationStepIndex] = useState(0);

  /** View state pending from a decoded link, applied once the run produces a
   *  result (identities → node ids need the resolved tree). A ref, not state,
   *  so consuming it does not trigger a render. */
  const pendingViewRef = useRef<ShareView | null>(null);
  /** …and the one way the share cluster arms it. A callback rather than the ref
   *  itself: the ref is this hook's, and a hook writing through an object handed
   *  to it is a hook mutating its own argument (`react/immutability`). */
  const setPendingView = useCallback((view: ShareView | null) => {
    pendingViewRef.current = view;
  }, []);

  // (1) A new run invalidates what the previous run's views pointed at. During
  // RENDER — `result` is the trigger and the reset reads nothing out of it, so
  // the selection and the stepper index are back at their starting points
  // BEFORE the paint instead of one committed frame after it, where the stepper
  // briefly showed the old step against the new run's sequence.
  useSyncedReset(result, () => {
    setSelectedNodeId(null);
    setMigrationStepIndex(0);
  });

  // (2) Apply a pending link's view AFTER the result exists — and after the
  // reset above, which the link's own view state overrides: the reset happens
  // during the render that observed the result, and this effect runs on the
  // commit that follows it.
  useEffect(() => {
    if (!result) {
      return;
    }
    const pending = pendingViewRef.current;
    if (!pending) {
      return;
    }
    pendingViewRef.current = null;
    if (pending.stage) {
      setSelectedStage(pending.stage);
    }
    if (isNumber(pending.step)) {
      setMigrationStepIndex(pending.step);
    }
    // Roadmap 075 (iteration 3): a link that named the Rewrites tab — or a
    // pre-028 one that carried a migration step, which is the same intent
    // spelled differently — is asking for the stepper, and the stepper is the
    // migrate stage's now. Applied AFTER `pending.stage` on purpose: the stage
    // such a link carries is whatever the sender's pipeline rail happened to be
    // on, and it is not what they were pointing at.
    const wantsMigrateStage =
      pending.tab === undefined ? isNumber(pending.step) : shareTabWantsMigrateStage(pending.tab);
    if (wantsMigrateStage) {
      setSelectedStage("migrate");
    }
    // Roadmap 094: `pending.simStep` is decoded and ignored — the merge
    // stepper it addressed is retired, and the replay has no index to restore.
    if (pending.node && result.presetTree) {
      const id = nodeIdForIdentity(result.presetTree, pending.node);
      if (id) {
        setSelectedNodeId(id);
      }
    }
    // Roadmap 028: an explicit tab wins; a pre-028 link infers one from the
    // view state it does carry. Roadmap 075: and a v1 tab id is mapped onto the
    // tab that replaced it — links naming `simulator` / `rewrites` are already
    // out there (`overview` needs no mapping since 083 made it a real tab again).
    const linkTab =
      pending.tab === undefined ? legacyTabForView(pending) : resultsTabForShareTab(pending.tab);
    if (linkTab) {
      setTab(linkTab);
    }
  }, [result, setTab]);

  // (3) The same four fields, encoded.
  const toShareView = useCallback(
    (tab: ResultsTabId, migrateStepperMounted: boolean): ShareView => {
      const view: ShareView = { stage: selectedStage, tab };
      if (selectedNodeId && result?.presetTree) {
        const identity = identityForNodeId(result.presetTree, selectedNodeId);
        if (identity) {
          view.node = identity;
        }
      }
      if (migrateStepperMounted) {
        view.step = migrationStepIndex;
      }
      // Roadmap 094: `simStep` is never encoded any more — the merge stepper
      // whose index it carried is retired. Links that already carry one still
      // decode (share.ts), they just restore nothing.
      return view;
    },
    [selectedStage, selectedNodeId, result, migrationStepIndex],
  );

  return {
    selectedStage,
    setSelectedStage,
    deferredStage,
    selectedNodeId,
    setSelectedNodeId,
    migrationStepIndex,
    setMigrationStepIndex,
    setPendingView,
    toShareView,
  };
}
