import { memo, useMemo, useRef, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { ruleLayerIndex } from "@/lib/rule-filters";
import type { ShareSimulator } from "@/lib/share";
import type { ErrorTranslationLib } from "@/platform/run";
import type { FormState } from "./form";
import { PinsView } from "./PinsView";
import { type PinnedTest, pinShareFields } from "./pins";
import type { RepoDepsView } from "./repo-deps";
import { buildRuleDescriptions } from "./rule-descriptions";
import { RuleSimulator } from "./RuleSimulator";
import type { SimRequest } from "./use-share-link-request";
import { usePinnedTests } from "./use-pinned-tests";

/**
 * Roadmap 075 (iteration 6): the Tests tab, which now has two views — the same
 * split the Presets tab took in 5b, for the same reason.
 *
 * The PINS view leads: the descriptors this config is checked against, each
 * re-simulated on every run, each saying in one row what the rules do to it.
 * The SIMULATOR is the analysis surface for ONE dependency — verdict threads,
 * the merge replay, the full rule list — one quiet link away, pre-filled when
 * the link came from a pin. Roadmap 080 made it the tab's DETAIL VIEW rather
 * than a peer feature: every door into it now carries a subject, and it can
 * pin what it is looking at as a standing test.
 *
 * The switch lives here rather than in App because nothing outside this tab
 * names a view: what crosses the boundary is a SIMULATION (a share link's `sim`
 * descriptor) or a RULE (a validation message naming `packageRules[N]`), and
 * both of those are the simulator's — so either one switches this panel to it,
 * exactly as an externally-set preset node switches the Presets tab to the
 * tree.
 */

export type TestsView = "pins" | "simulator";

function SimulatorViewStrip({ onBack }: { onBack: () => void }) {
  return (
    <div className="summary-strip">
      <span>
        The full simulator — one dependency, every rule, the merge that produced its config.
      </span>
      <button type="button" className="btn-quiet" onClick={onBack}>
        ← Back to tests
      </button>
    </div>
  );
}

export const TestsPanel = memo(function TestsPanel({
  result,
  pins,
  onAddPin,
  onRemovePin,
  onSelectPreset,
  onJumpToEditor,
  focusRuleIndex,
  onRuleFocused,
  errorLib,
  simRequest,
  onCopySimLink,
  onShare,
  mergeStepIndex,
  onMergeStepChange,
  repoDeps,
  onLoadRepoDeps,
}: {
  result: TraceResult;
  pins: PinnedTest[];
  onAddPin: (form: FormState) => void;
  onRemovePin: (id: string) => void;
  onSelectPreset: (nodeId: string) => void;
  onJumpToEditor: (repoIndex: number) => void;
  /** The rule a validation message cross-linked to, or null. */
  focusRuleIndex: number | null;
  onRuleFocused: () => void;
  errorLib: ErrorTranslationLib | null;
  simRequest: SimRequest | null;
  onCopySimLink: (sim: ShareSimulator) => Promise<void>;
  /** Roadmap 077: the share-link build-and-copy, for the pins view's note that
   *  pins ride in the link. */
  onShare: () => Promise<void>;
  mergeStepIndex: number;
  onMergeStepChange: (index: number) => void;
  /** Roadmap 078: the loaded repository's extracted dependencies for the
   *  Add-a-test card's From-repository tab, and its on-demand trigger. */
  repoDeps: RepoDepsView;
  onLoadRepoDeps: () => void;
}) {
  // A link carrying a simulation, or a cross-link naming a rule, is a request
  // for the simulator — including on the very first render, since App applies
  // both before this panel's lazy chunk has mounted (the 5b lesson).
  const wantsSimulator = Boolean(simRequest) || focusRuleIndex !== null;
  const [view, setView] = useState<TestsView>(wantsSimulator ? "simulator" : "pins");
  // Later requests are synced DURING RENDER (the `PresetsPanel` idiom): an
  // effect would put the view one commit behind the request, and the simulator's
  // own auto-run is already reacting to it by then.
  const [seenSimNonce, setSeenSimNonce] = useState(simRequest?.nonce ?? null);
  const [seenFocus, setSeenFocus] = useState(focusRuleIndex);
  /** The request a pin's "open in simulator →" makes: the same descriptor
   *  channel a share link uses, so the form is filled and re-simulated by the
   *  one mechanism that already does exactly that (`useShareLinkRequest`).
   *  NEGATIVE nonces, so a locally-minted one can never collide with the share
   *  hook's own counter and swallow a link's request. */
  const pinNonce = useRef(0);
  const [pinRequest, setPinRequest] = useState<SimRequest | null>(null);
  if ((simRequest?.nonce ?? null) !== seenSimNonce) {
    setSeenSimNonce(simRequest?.nonce ?? null);
    // A link replaces the screen, and with it any pin the reader had opened.
    setPinRequest(null);
    if (simRequest) {
      setView("simulator");
    }
  }
  if (focusRuleIndex !== seenFocus) {
    setSeenFocus(focusRuleIndex);
    if (focusRuleIndex !== null) {
      setView("simulator");
    }
  }

  const attribution = useRuleProvenance(result);
  const layerByIndex = useMemo(() => ruleLayerIndex(attribution), [attribution]);
  const descriptionProvenance = useDescriptionProvenance(result);
  const descriptions = useMemo(
    () => buildRuleDescriptions(descriptionProvenance),
    [descriptionProvenance],
  );
  const { evaluations } = usePinnedTests({ result, pins });

  /** A pin's "open in simulator →" — and the one-off result's: both hand the
   *  descriptor to the same channel a share link uses, so the form is filled
   *  and re-simulated by the one mechanism that already does exactly that. */
  function openInSimulator(form: FormState) {
    pinNonce.current -= 1;
    setPinRequest({
      form: pinShareFields(form),
      autoSimulate: true,
      // The result on screen IS the one this request belongs to, which is what
      // `useShareLinkRequest`'s attribution rule asks of it.
      ranResult: result,
      nonce: pinNonce.current,
    });
    setView("simulator");
  }

  if (view === "simulator") {
    return (
      <div className="tests-view">
        <SimulatorViewStrip onBack={() => setView("pins")} />
        <RuleSimulator
          result={result}
          onSelectPreset={onSelectPreset}
          onJumpToEditor={onJumpToEditor}
          focusRuleIndex={focusRuleIndex}
          onRuleFocused={onRuleFocused}
          errorLib={errorLib}
          simRequest={pinRequest ?? simRequest}
          onCopySimLink={onCopySimLink}
          onAddPin={onAddPin}
          pinCount={pins.length}
          mergeStepIndex={mergeStepIndex}
          onMergeStepChange={onMergeStepChange}
        />
      </div>
    );
  }
  return (
    <PinsView
      result={result}
      pins={pins}
      evaluations={evaluations}
      layerByIndex={layerByIndex}
      attribution={attribution}
      descriptions={descriptions}
      onSelectPreset={onSelectPreset}
      onJumpToEditor={onJumpToEditor}
      onAddPin={onAddPin}
      onRemovePin={onRemovePin}
      onOpenInSimulator={openInSimulator}
      onShare={onShare}
      repoDeps={repoDeps}
      onLoadRepoDeps={onLoadRepoDeps}
    />
  );
});
