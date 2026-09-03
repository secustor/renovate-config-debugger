/**
 * Roadmap 086 (the 048-deferred state-sharing ruling): the run-scoped view
 * cluster as a context, INSIDE the app layer only. App provides it;
 * `ResultsColumn` and `AppShellHeader` consume it. Features never do — 048's
 * boundary stays props, so this is app-shell wiring, not an API.
 *
 * The admission rule (stated in roadmap/086 and enforced by review): a value
 * enters this context only if its identity changes on a run, a
 * tab/stage/node/step selection, or a panel's async report — NEVER on a
 * keystroke. The provider value is memoized on exactly those inputs, which is
 * what keeps the 032 keystroke budget: consumers re-render when the run view
 * changes, which is when they re-rendered anyway. `resultsStale` and the
 * layer texts/parses are the canonical disqualified values — they stay props.
 *
 * Why a context at all: 033 → 048 → 084 measured that hook extraction alone
 * does not hold. Every feature touching a run added a prop through App's JSX,
 * `ResultsColumnProps` and the panel — three files per value — and the wiring
 * accreted back into App faster than extraction drained it. A run-view value
 * now costs its provider entry and its consumer.
 */
import { createContext, useContext } from "react";
import type {
  ErrorFixResult,
  RuleAttribution,
  StageId,
  TraceEvent,
  TraceResult,
} from "@renovate-config-debugger/engine";
import type { AuthState } from "@/components/GithubAuthHint";
import type { ResultsTabDescriptor } from "@/components/ResultsPanel";
import type { ResultsTabId } from "@/data/results-tabs";
import type { EffectiveTally } from "@/lib/effective-tally";
import type { PipelinePhase } from "@/features/pipeline/phases";
import type { ShareSimulator } from "@/lib/share";
import type { ErrorTranslationLib } from "@/platform/run";
import type { SimRequest } from "@/hooks/use-share-link";
import type { FormState, PinnedTest } from "@/types/simulator";
import type { RepoConnectOffer, RepoDepsView } from "@/types/repo";

export interface RunView {
  /** The committed run, or null before the first one (the header renders its
   *  identity row either way; the results column only mounts with a result). */
  result: TraceResult | null;
  validateHasErrors: boolean;

  // —— tab shell ——
  tabs: ResultsTabDescriptor[];
  tab: ResultsTabId;
  onSelectTab: (tab: ResultsTabId) => void;
  onWalkTab: (tab: ResultsTabId) => void;
  backTab: ResultsTabId | null;
  onBack: () => void;
  onJumpToTab: (tab: ResultsTabId) => void;

  // —— header digest ——
  errorCount: number;
  warningCount: number;
  presetCount: number;
  effectiveKeys: number | null;
  onShowRewrites: () => void;

  // —— pipeline ——
  /** Roadmap 090: which of Renovate's phases the Pipeline tab is showing.
   *  App's, because opening the Extract phase is what triggers repository
   *  discovery — and a mounted-but-unseen panel must never trigger it. */
  pipelinePhase: PipelinePhase;
  onSelectPipelinePhase: (phase: PipelinePhase) => void;
  selectedStage: StageId;
  onSelectStage: (stage: StageId) => void;
  deferredStage: StageId;
  migrateSteps: TraceEvent[];
  migrateStepperMounted: boolean;
  finalMigrated: unknown;
  migrationStepIndex: number;
  onMigrationStepChange: (index: number) => void;

  // —— cross-links + shared handlers ——
  selectPresetNode: (nodeId: string) => void;
  focusEditorRepoIndex: (repoIndex: number) => void;
  errorLib: ErrorTranslationLib | null;
  authState: AuthState;
  onSignIn: () => void;
  onRunAgain: () => void;

  // —— presets ——
  onInject: (key: string, content: Record<string, unknown>) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;

  // —— overview / effective ——
  onOverviewStats: (behaviors: number) => void;
  onEffectiveStats: (stats: EffectiveTally) => void;
  onShowDescriptionOrder: () => void;
  descriptionLedgerNonce: number;

  // —— tests ——
  pins: PinnedTest[];
  onAddPin: (form: FormState) => void;
  onRemovePin: (id: string) => void;
  pendingRuleFocus: number | null;
  onRuleFocused: () => void;
  simRequest: SimRequest | null;
  onCopySimLink: (sim: ShareSimulator) => Promise<void>;
  onShare: () => Promise<void>;
  /** Roadmap 078: the loaded repo's extracted dependencies (identity changes
   *  on a load and on the discovery's async report — never per keystroke),
   *  and the stable on-demand trigger that computes them. */
  repoDeps: RepoDepsView;
  onLoadRepoDeps: () => void;
  /** Roadmap 087: what the repo tab offers while NO repo is loaded — a share
   *  link's suggested repo and the two ways to connect one. Identity moves on
   *  a link arrival or a platform change, never per keystroke. */
  repoConnect: RepoConnectOffer;

  // —— dependencies ——
  /** Roadmap 089: the Dependencies tab's two row actions. Both are the SHELL's
   *  acts, not the tab's — a pin joins App's list and the simulator is another
   *  tab — so the panel is handed them and performs neither itself. Each takes
   *  the extracted descriptor and completes it into a form (`EMPTY_FORM` lives
   *  in the simulator slice, which only the shell may reach). Identity-stable,
   *  like every other handler admitted here. */
  onPinDep: (fill: Partial<FormState>) => void;
  onOpenDepInSimulator: (fill: Partial<FormState>) => void;

  // —— problems ——
  ruleProvenance: RuleAttribution[] | null | undefined;
  onJumpToSimRule: (index: number) => void;
  onApplyFix: (fix: ErrorFixResult) => void;
}

/** `AppProviders` renders `<RunViewContext.Provider>`; a wrapper component
 *  HERE would export a component beside the hook, which the fast-refresh lint
 *  rule (and fast refresh itself) refuses. */
export const RunViewContext = createContext<RunView | null>(null);

export function useRunView(): RunView {
  const view = useContext(RunViewContext);
  if (view === null) {
    throw new Error("useRunView must be rendered under AppProviders");
  }
  return view;
}
