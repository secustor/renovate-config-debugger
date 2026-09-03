import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from "react";
import type {
  ErrorFixResult,
  OptionIndex,
  StageId,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { AdvancedZone } from "@/features/editor/AdvancedZone";
import { AppShellHeader } from "@/app/AppShellHeader";
import type { ConfigEditorHandle } from "@/features/editor/ConfigEditor";
import { ConfigColumn } from "@/app/ConfigColumn";
import { HeadlessNote } from "@/components/HeadlessNote";
import { AppProviders } from "@/app/AppProviders";
import type { RunView } from "@/app/run-view-context";
import { REPO_URL } from "@/data/project-repo";
import { buildPresetLookup, type PresetHoverContext } from "@/lib/preset-hover";
import { motionScrollToOptions } from "@/lib/motion";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { OAUTH_CONFIG, useOAuthSession } from "@/app/use-oauth-session";
import { useLandingWalk } from "@/app/use-landing-walk";
import { usePreservedScroll } from "@/app/use-preserved-scroll";
import { type ConfigFileName, useConfigDocument } from "@/app/use-config-document";
import { useRepoProvenance } from "@/app/use-repo-provenance";
import { useRunViewSelection } from "@/app/use-run-view-selection";
import { beginSignIn } from "@/platform/oauth";
import {
  type ErrorTranslationLib,
  getRenovateVersion,
  loadErrorTranslationLib,
  loadOptionIndex,
  run,
} from "@/platform/run";
import type { ShareSimulator, ShareState } from "@/lib/share";
import { useBackToTopVisible, useHomeEndPageScroll } from "@/hooks/scroll-ergonomics";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { useKeyboardLandings } from "@/app/use-keyboard-landings";
import { ShortcutSheet } from "@/components/ShortcutSheet";
import { isPlainObject } from "@renovate-config-debugger/engine/is";
import { jsonDocument, jsonText } from "@renovate-config-debugger/engine/json";
import { isValidEndpoint } from "@/lib/input-schemas";
import { useCustomHostRules, useHostTokens } from "@/hooks/use-host-tokens";
import { useAppMessages } from "@/app/use-app-messages";
import { usePlatformContext } from "@/app/use-platform-context";
import { useInheritedConfigLayer } from "@/app/use-inherited-config-layer";
import { useRepoLoad } from "@/app/use-repo-load";
import { useRepoDeps } from "@/features/simulator/use-repo-deps";
import type { PipelinePhase } from "@/features/pipeline/phases";
import { useDepActions } from "@/app/use-dep-actions";
import { useRepoPicker } from "@/app/use-repo-picker";
import { useRunSummary } from "@/app/use-run-summary";
import { usePanelStats } from "@/app/use-panel-stats";
import { usePinnedRun } from "@/app/use-pinned-run";
import { useResultsTab } from "@/app/use-results-tab";
import { useStarterPins } from "@/app/use-starter-pins";
import { useShareLink } from "@/hooks/use-share-link";
import type { RunInputs } from "@/lib/run-inputs";
import { createRunQueue, type RunQueue } from "@/lib/run-queue";
import { pluralWord } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { EXAMPLE_CONFIG } from "@/data/starter-configs";
import { AppBanners } from "@/app/AppBanners";
import { ResultsPane } from "@/app/ResultsPane";
import { preloadRunChunks } from "@/app/preload-run-chunks";
import type { RepoConnectOffer } from "@/types/repo";

/** What a caller may ask of a run. Every request reaches the queue except one
 *  refused before it starts, by layers that would not parse — see `onRun`. */
interface RunOptions {
  preserveScroll?: boolean;
  /** Leave the results tab where the reader put it. For the runs asked for from
   *  INSIDE the results — see `executeRun`, where 028's landing lives. */
  keepTab?: boolean;
  suppressTokens?: boolean;
  /** Roadmap 068, ninth review: what this run's spoken outcome LEADS with, when
   *  what asked for the run is a fact of its own — "Fix applied, re-ran" rather
   *  than the "Run finished" every run defaults to. The counts after the lead
   *  are the same sentence either way (see the announcement effect). */
  outcomeLead?: string;
}

type InjectionMap = Record<string, Record<string, unknown>>;

/** Roadmap 076: the two 008 merge layers as one comparable value — what
 *  `resultsStale` asks about them. Spelled once so the key a run RECORDS and
 *  the key the editor derives can never be two different serializations of the
 *  same pair. */
function layerKey(
  globalConfig: Record<string, unknown> | undefined,
  inheritedConfig: Record<string, unknown> | undefined,
): string {
  return jsonText([globalConfig ?? null, inheritedConfig ?? null]);
}

/** Roadmap 093: the run's own `customManagers`, as discovery takes them —
 *  plain objects out of the EFFECTIVE config, so the walk claims the files the
 *  user's blocks claim. No run (or a refused one) means built-ins only. */
function customManagerBlocks(result: TraceResult | null): Record<string, unknown>[] {
  const blocks: unknown = result?.finalConfig?.customManagers;
  if (!Array.isArray(blocks)) {
    return [];
  }
  const kept: Record<string, unknown>[] = [];
  for (const block of blocks) {
    if (isPlainObject(block)) {
      kept.push(block);
    }
  }
  return kept;
}

export function App() {
  // Roadmap 086: the four message surfaces — fatal banner (with the 068
  // stamp/expiry rule), notice, toast, and the run-outcome live region — as
  // one hook. `applyFatal` is the stamped raise; `setFatal` the unstamped
  // run-failure write; both alternating-space devices live there, spelled once.
  const {
    fatal,
    setFatal,
    applyFatal,
    fatalSeqRef,
    notice,
    setNotice,
    toast,
    showToast,
    runAnnouncement,
    announceRun,
    outcomeLeadRef,
  } = useAppMessages();
  // Roadmap 086 follow-up: the document the app is about — its text, where
  // that text came from, the CodeMirror remount key, the filename, and the
  // two ways the text is replaced wholesale. Declared after the message
  // surfaces because `formatConfig` explains a refusal through them.
  const configDoc = useConfigDocument({ setNotice, showToast });
  const { content, setContent, fileName, editorKey, packageRuleOffsets, loadConfigText } =
    configDoc;
  // The config text the displayed result was actually computed from. Compared
  // against `content` to tell the reader that what they are looking at no
  // longer describes what is in the editor — see `resultsStale` below.
  const [lastRunContent, setLastRunContent] = useState<string | null>(null);
  // Roadmap 076: and the same fact about the two 008 merge layers, which are
  // now edited INSIDE the results pane (their pipeline stage cards). Before the
  // move an edited layer was three disclosures away from the results and out of
  // the stale banner's scope by construction; now a reader can retype the
  // global config with the merge diff on screen beside it, so the banner has to
  // cover them or it is lying in the one place it is most visible.
  const [lastRunLayerKey, setLastRunLayerKey] = useState<string | null>(null);
  // Roadmap 033: the four per-host PATs (state, validated storage reads and
  // change handlers) as one table-driven hook — the inputs and the invalid-
  // token error rows below map over the same rows.
  const hostTokens = useHostTokens();
  const customHostRules = useCustomHostRules();
  // Roadmap 086: the platform context — platform/endpoint, the 008 global
  // layer that can dictate them, the override, and the untrusted-endpoint
  // guard — as one hook. `applyPlatformContext` is the one set-and-persist
  // spelling; persistence is each caller's explicit security decision.
  const {
    platform,
    endpoint,
    globalText,
    setGlobalText,
    globalParse,
    globalPlatform,
    globalEndpoint,
    hasGlobalContext,
    platformOverride,
    setPlatformOverride,
    reflectGlobal,
    displayPlatform,
    displayEndpoint,
    usesLocal,
    untrustedGuard,
    untrustedGuardRef,
    applyUntrustedGuard,
    applyPlatformContext,
    onPlatformChange,
    onEndpointChange,
    onUseGlobalValues,
    onAcknowledgeUntrusted,
    onTrustUntrustedHost,
  } = usePlatformContext();
  // Roadmap 040/076: the collapsed home of the platform context and the
  // credentials this tab is carrying. Auto-opens only for the untrusted-endpoint
  // guard now — the self-hosted layers it used to hold are pipeline stages.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Security 2026-07-25: the host sub-section, controlled for the same
  // reason — an untrusted-endpoint guard tells the user to review the host, so
  // the field holding it has to be actually on screen, not one more
  // disclosure deep. Mirrored back on toggle so the user still owns it.
  const [hostSectionOpen, setHostSectionOpen] = useState(false);
  /**
   * Roadmap 009 (auth-failure surfacing): the sign-in session — who is signed
   * in, whether signing in is possible at all, and sign-out. The sign-in VERB
   * stays below, next to the state it has to read; the hook's header says why.
   */
  const { oauthConfigured, signedIn, authUser, authState, onSignOut, setSignedIn, setAuthUser } =
    useOAuthSession();
  const [injected, setInjected] = useState<InjectionMap>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  // Roadmap 028: which results tab the reader is on, the one-step "back to
  // where I was" trail, and the rule-focus jump that is a tab switch too — as
  // one hook. Every COMPOSITION of a tab switch with other App state is still
  // here: the run path's landing (`executeRun`), the decoded link's tab (the
  // pending-view effect), the digit shortcuts (`useKeyboardLandings`) and the
  // cross-links below that select a stage on their way.
  const {
    tab,
    backTab,
    setTab,
    walkToTab,
    jumpToTab,
    clearBackTab,
    landAfterRun,
    pendingRuleFocus,
    onRuleFocused,
    onJumpToSimRule,
  } = useResultsTab();
  // Roadmap 086 follow-up: what the reader is looking AT within a run — the
  // stage, the preset node, the migration stepper's index — plus the three
  // behaviours that only make sense together: the new-run reset, a decoded
  // link's override of it, and the encode back into a link.
  const runViewSelection = useRunViewSelection({ result, setTab });
  const {
    selectedStage,
    setSelectedStage,
    deferredStage,
    selectedNodeId,
    setSelectedNodeId,
    migrationStepIndex,
    setMigrationStepIndex,
    setPendingView,
  } = runViewSelection;
  const [optionIndex, setOptionIndex] = useState<OptionIndex | null>(null);
  // Roadmap 014: curated validator-message translations + suggested fixes,
  // loaded lazily alongside the option index (same engine chunk).
  const [errorLib, setErrorLib] = useState<ErrorTranslationLib | null>(null);
  /**
   * Roadmap 075 (iteration 6): the pinned tests — dependency descriptors the
   * Tests tab re-simulates against every run.
   *
   * Owned here for the two reasons every other cross-cutting piece of state is:
   * a share link carries them (`buildShareState` / the decode path below), and
   * the tab strip's count is one of the numbers `useRunSummary` assembles. The
   * evaluation itself is the panel's (`usePinnedTests`), keyed on the run.
   */
  const { pins, addPin, removePin, seedStarterPins, setPinsFromShare, pinsAsShareFields } =
    usePinnedRun();
  // Roadmap 028/069/083: the counts the results panels report back up (the
  // Effective tab's key tally, the Overview tab's behavior count) and the
  // ledger signal that goes the other way — as one hook, because a new run
  // invalidates the counts TOGETHER.
  const {
    effectiveStats,
    setEffectiveStats,
    overviewBehaviors,
    setOverviewBehaviors,
    descriptionLedgerNonce,
    requestDescriptionLedger,
    resetPanelStats,
  } = usePanelStats();
  // Roadmap 028: the results pane, so a Run on a stacked (narrow) viewport can
  // scroll its consequence into view instead of appearing to do nothing.
  const resultsColRef = useRef<HTMLDivElement>(null);
  // Roadmap 068, eighth review: the config half, for the one question 028's
  // landing turns on — see `gestureWantsResultsLanding`.
  const configColRef = useRef<HTMLDivElement>(null);
  const focusResultsRef = useRef(false);
  // Roadmap 016: End/Home always scroll the reader's own surface, never a
  // nested card's scroll box; a back-to-top button appears once the PAGE has
  // scrolled down — which since 075 only happens on the stacked (narrow)
  // layout and on the landing, the two places the document still scrolls. In
  // the shell `window.scrollY` stays 0 by construction, so the button simply
  // never appears there; nothing gates it but the fact itself.
  useHomeEndPageScroll();
  const showBackToTop = useBackToTopVisible();
  // Roadmap 031: start downloading the ~437 kB gz engine chunk (and the small
  // results-column chunk) once the browser is idle after first paint, so the
  // first Run — or a share link's auto-run — begins computing instead of
  // fetching. requestIdleCallback keeps it off the first-paint critical path;
  // the setTimeout fallback covers Safari, which still lacks it.
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preloadRunChunks);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preloadRunChunks, 1_000);
    return () => window.clearTimeout(id);
  }, []);
  // Roadmap 017: a mirror of `canRevert` for the hashchange listener (inside
  // `useShareLink`), which is registered once (empty deps) and would otherwise
  // close over the state from that first render.
  const hasUnsavedEditsRef = useLatestRef(configDoc.canRevert);
  // Roadmap 033: the whole share/hash/decode cluster — `shareError` feeds the
  // prominent, top-of-page banner below (not the dismissable notice), so a
  // broken link never reads as "nothing happened"; `simRequest` is handed to
  // the RuleSimulator. Everything referenced here that is declared later in
  // this body is either a hoisted function declaration or (for the inherited
  // layer's `applyInheritedText`, which the hook below owns) reached through an
  // arrow that only runs after this render — and the share hook re-reads the
  // host object every render, so nothing goes stale.
  const { shareError, simRequest, buildShareLinkAndCopy, buildSignInReturnHash } = useShareLink(
    OAUTH_CONFIG,
    {
      onRun: (inputs, opts) => onRun(undefined, inputs, opts),
      loadConfigText,
      setFileName: configDoc.setFileName,
      applyPlatformContext,
      setGlobalText,
      setInheritedText: (text) => applyInheritedText(text),
      setPlatformOverride,
      // Roadmap 076: the guard's one reveal — both disclosures, since the host
      // field is behind both. They stay separate states here: the user owns
      // each one independently.
      openHostCredentials: () => {
        setAdvancedOpen(true);
        setHostSectionOpen(true);
      },
      setNotice,
      setSignedIn,
      setAuthUser,
      applyUntrustedGuard,
      // Roadmap 075 (iteration 6): the link's pins, with ids minted by the
      // cluster that owns them.
      setPins: setPinsFromShare,
      // An arrow, not the bare method: this host object is built during render
      // and `repoProvenance` is declared further down. The arrow only runs on a
      // link arrival, which is the same deferred-capture rule this object's
      // header states for everything else declared later in the body.
      applyShareRepo: (repo) => repoProvenance.adoptShareClaim(repo),
      setPendingView,
      hasUnsavedEditsRef,
      buildShareState,
    },
  );
  // Roadmap 013: the editor half of the rule identity cross-links — an
  // imperative jump target, since CodeMirror has no declarative "scroll to
  // offset X" prop. (The simulator half is prop-driven: `pendingRuleFocus`,
  // owned by `useResultsTab` because arriving at a rule is a tab switch.)
  const configEditorRef = useRef<ConfigEditorHandle>(null);
  const ruleProvenance = useRuleProvenance(result);
  // Roadmap 091: the first settled run seeds up to two starter pins from the
  // reader's OWN rules (provenance is what makes "own" a fact), so the Tests
  // pane the landing transition docks in has something to answer with. Once,
  // and never over a reader who has pinned anything themselves — the latch is
  // `usePinnedRun`'s.
  useStarterPins({ result, ruleProvenance, seedStarterPins });
  /**
   * Roadmap 075 (iteration 3): the header's `N rewrites` link. The Rewrites tab
   * retired into Pipeline's migrate stage, so "show me the rewrites" is two
   * pieces of state, not one — the tab AND the stage whose card holds the
   * stepper. App owns both, which is why the header takes a callback here
   * rather than a tab id.
   */
  const onShowRewrites = useCallback(() => {
    setSelectedStage("migrate");
    jumpToTab("pipeline");
  }, [jumpToTab, setSelectedStage]);

  /**
   * Roadmap 076 (design turn 18d): the Advanced zone's cross-link to the two
   * self-hosted layers, which are edited on their own pipeline stage cards now.
   * Lands on the FIRST of the two (global) — the rail's `inherit` node is one
   * click along from there, and a link that landed between them would have to
   * pick one anyway.
   */
  const onShowPipelineLayers = useCallback(() => {
    setSelectedStage("global");
    jumpToTab("pipeline");
  }, [jumpToTab, setSelectedStage]);

  /** Roadmap 045/076: where a probe that just filled (or failed to fill) the
   *  inherited layer points. It used to unfold two disclosures; the layer's
   *  editor is the `inherit` stage card now, so the reveal is the selection.
   *  Deliberately does NOT switch tabs: a repo load ends in a run, and that
   *  run's own landing (`executeRun`) is what decides where the reader is put.
   *
   *  Selecting the stage here alone would not survive: a probe always runs
   *  BETWEEN the repo config arriving and the run that processes it, and that
   *  run's commit resets the selected stage on its way past. So the reveal is
   *  also armed as a ref the next commit honors — the immediate selection
   *  still matters for the one path with no commit (the run threw). */
  const pendingLayerStageRef = useRef<StageId | null>(null);
  const revealInheritedStage = useCallback(() => {
    pendingLayerStageRef.current = "inherit";
    setSelectedStage("inherit");
  }, [setSelectedStage]);

  /** Roadmap 069: the description card's "show raw order" link — lands on the
   *  `description` row's blame ledger. Roadmap 083 moved the card to its own
   *  Overview tab, so this crosses a tab boundary again (as it does from the
   *  preset tree) and records the one-step way back; it is the way to the two
   *  facts the Overview trades away, Renovate's own array order and the
   *  repeated sentences. */
  const onShowDescriptionOrder = useCallback(() => {
    jumpToTab("effective");
    requestDescriptionLedger();
  }, [jumpToTab, requestDescriptionLedger]);

  /**
   * A forward handle to the keyboard-landing cluster's preset landing. The
   * cluster itself cannot be declared until `resultsTabs` exists (it is the run
   * summary's, ~800 lines down), while `selectPresetNode` below has to be
   * declared up here for `presetHover` — so the binding is reached through a
   * ref rather than read out of a `const` that is still in its temporal dead
   * zone at this point in the body (`react/immutability`).
   *
   * Same rule as the 032 latest-ref idiom: written on every render, read only
   * from an event handler, i.e. always after the commit that filled it in. The
   * no-op placeholder is never the one that runs — nothing can activate a
   * cross-link before the first commit.
   */
  const landOnPresetNodeRef = useRef<() => void>(() => undefined);
  // Roadmap 028: selecting a preset node from anywhere else (a provenance
  // chip, a simulator rule, an editor preset hover) also switches to the
  // Presets tab. Identity-stable, so the preset-hover context — memoized on
  // the result so its lookup isn't rebuilt on every keystroke — never churns.
  const selectPresetNode = useStableCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    jumpToTab("presets");
    // Roadmap 068: …and land on the node, like every other cross-link. For the
    // two activators that live in a results panel (a provenance chip, a
    // simulator rule) that includes the focus: the tab switch marks their panel
    // `hidden` in the very same commit, the browser blurs them, and without a
    // landing the user's next Tab restarts at the top of the document. The
    // editor's preset hover is the third and keeps its caret — see
    // `jumpDisplacedFocus`.
    landOnPresetNodeRef.current();
  });

  // Roadmap 023: preset-string hovers in the editor. Built from the current
  // run's resolution tree; the jump link selects the preset's node in the tree.
  const presetHover = useMemo<PresetHoverContext | null>(() => {
    if (!result?.presetTree) {
      return null;
    }
    const lookup = buildPresetLookup(result.presetTree);
    return { lookup: (name) => lookup.get(name) ?? null, onSelectPreset: selectPresetNode };
  }, [result, selectPresetNode]);
  // Roadmap 023: validation ERRORS (not warnings) make post-Validate results
  // hypothetical — a real Renovate run would refuse the config outright.
  const validateHasErrors = result?.stageStatus.validate === "error";

  // Roadmap 023/075: the reader's scroll across a scroll-preserving re-run —
  // captured a statement before the result commits, restored once the new DOM
  // has painted. Both halves live in the hook; `result` is the trigger.
  const preservedScroll = usePreservedScroll(resultsColRef, result);

  // A validation message's REPO-config `packageRules[repoIndex]` → the editor
  // line. Reads `packageRuleOffsets`, which is rescanned on every edit — so
  // the memoized panels get the stable wrapper below (032, latest-ref idiom)
  // and a click always jumps against offsets from the CURRENT text, never a
  // closure over stale one.
  const focusEditorRepoIndex = useStableCallback((repoIndex: number) => {
    const offset = packageRuleOffsets?.[repoIndex];
    if (offset !== undefined) {
      configEditorRef.current?.highlightOffset(offset);
    }
  });

  useEffect(() => {
    // Roadmap 028: a new run invalidates the previous run's async counts —
    // the effective key stats and the Overview's behavior count (083), both
    // recomputed by their views once the new derivations settle (they reset as
    // one, which is what `usePanelStats` exists for) — and any "back to where I
    // was" target from the run that just ended.
    //
    // This half stays an effect: `resetPanelStats` and `clearBackTab` belong to
    // other hooks, and a cross-hook call during render is the side effect React
    // is free to replay. Both are identity-stable (`useCallback`s with no
    // dependencies, in `usePanelStats` and `useResultsTab`), so listing them
    // leaves this effect firing on the result and nothing else — they are here
    // because `exhaustive-deps` cannot see that.
    resetPanelStats();
    clearBackTab();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `result` is the TRIGGER: what is invalidated here belongs to the run that just ENDED, so the body reads nothing out of the new one.
  }, [result, resetPanelStats, clearBackTab]);

  // Roadmap 028's post-Run scroll-into-view lives in ResultsColumn since 031:
  // with the results half lazy, an App-side effect on `result` could run
  // against the Suspense fallback (a zero-height column on the very first
  // run) and measure a page the results hadn't grown yet. The column's own
  // effect runs only after its content committed. `focusResultsRef` (armed by
  // onRun below) and `resultsColRef` (the pane to measure) are handed down.

  // Roadmap 007/039: the repo reference the load form (and the welcome panel's
  // shortcut) types into. App's state rather than `useRepoLoad`'s, because BOTH
  // clusters below read it — the load parses it, the inherited-config layer
  // derives its probe target from it — and one of them has to be declared
  // first. Owning it here is what lets the layer come first without the load
  // closing over bindings this render has not created yet: a forward capture is
  // a value React Compiler must treat as "may change later", which costs the
  // memoization of everything downstream of the layer's parse.
  const [repoInput, setRepoInput] = useState("");
  // Roadmap 078/087: where the config on screen came from — a load this
  // session performed, or a claim a share link made. See the hook for why
  // "replace the provenance" and "discard it" are two named writers rather
  // than the same pair of setter calls twice.
  const repoProvenance = useRepoProvenance({
    platform,
    endpoint,
    suppressTokens: untrustedGuard !== null,
  });
  const loadedRepo = repoProvenance.loadedRepo;
  // Roadmap 045/048: the inherited-config layer — its text and parse, the
  // probe-target fields, the `inheritConfig*` policy read off the global
  // config, and the probe the repo load calls between the repo config arriving
  // and the run that processes it. Declared BEFORE the load, which calls into
  // it.
  const {
    inheritedText,
    inheritedParse,
    applyInheritedText,
    inheritAuto,
    inheritFields,
    inheritState,
    onInheritAutoFieldChange,
    onInheritRepoFieldChange,
    onInheritFileFieldChange,
    probeInheritedConfig,
  } = useInheritedConfigLayer({
    globalConfig: globalParse.config,
    repoInput,
    revealInheritedStage,
  });
  // Roadmap 048: the load-from-repo cluster — the disclosure and its focus
  // hand-back, the branch/tag field, the in-flight flag, the auth hint, and the
  // load itself. Everything the load acts on is either declared above or (for
  // the run path, the layer gate and the guard) a hoisted function declaration
  // below.
  const repoLoad = useRepoLoad({
    platform,
    endpoint,
    applyPlatformContext,
    loadConfigText,
    setFileName: configDoc.setFileName,
    setNotice,
    // A load that failed is a message about something that never ran, so it is
    // stamped and a run already in flight leaves it alone (see `applyFatal`).
    setFatal: applyFatal,
    blockedByLayerErrors,
    applyUntrustedGuard,
    untrustedGuardRef,
    onRun: (inputs, opts) => onRun(undefined, inputs, opts),
    globalConfig: globalParse.config,
    platformOverride: platformOverride && hasGlobalContext,
    repoInput,
    oauthConfigured: oauthConfigured,
    // Roadmap 045: the org probe when auto-load is on, otherwise the layer as
    // it already stands — resolved at the one point in the load's sequence a
    // real `inheritConfig` run resolves it.
    resolveInheritedConfig: async (args) =>
      inheritAuto ? await probeInheritedConfig(args) : inheritedParse.config,
    onRepoLoaded: repoProvenance.recordLoad,
  });
  // Roadmap 078: the loaded repo's extracted dependencies — discovered on
  // demand (the first open of the From-repository tab), reset by a new load.
  // Roadmap 093: the walk also runs the run's own customManagers, so the blocks
  // ride in memoized — a re-run that changes them is what re-discovers.
  const customManagers = useMemo(() => customManagerBlocks(result), [result]);
  const { view: repoDepsView, ensure: ensureRepoDeps } = useRepoDeps(loadedRepo, customManagers);
  /**
   * Roadmap 090: which phase the Pipeline tab is showing. Here rather than in
   * the panel because the phase is half of a discovery trigger (below), and
   * because a phase the reader picked must survive a re-run — extraction is a
   * fact about the REPOSITORY, so a new run of the config pipeline does not
   * invalidate it. True up to the custom managers (093): a run whose
   * `customManagers` differ walks a different repository, and re-discovers.
   */
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>("config");
  // Roadmap 089/090: …and the Dependencies tab and the Pipeline tab's Extract
  // phase are the second and third doors onto the same discovery. Opening one
  // is what starts it, exactly as opening the From-repository tab is — the
  // trigger lives HERE rather than in the panel because every results panel
  // stays MOUNTED (028), so a panel-side effect would fire for a tab nobody has
  // looked at and spend the rate limit on it. `ensure` is idempotent per loaded
  // repo, so the three doors never discover twice.
  useEffect(() => {
    if (tab === "deps" || (tab === "pipeline" && pipelinePhase === "extract")) {
      ensureRepoDeps();
    }
  }, [tab, pipelinePhase, ensureRepoDeps]);
  // Roadmap 087: the connect panel's one-click reload — grants this session
  // repository ACCESS (the LoadedRepo record discovery runs from) without
  // touching the config the share link installed. It rides the current
  // platform context (the link applied its own on arrival) and obeys the
  // link's untrusted-endpoint guard, exactly as a typed load would. The impl
  // closes over this render's state; the latest-ref wrapper (the
  // `buildShareLinkAndCopy` idiom) keeps the handed-out identity stable for
  // the run-view provider.
  // Joins the two clusters this offer is made of — the provenance claim and
  // the editor's load overlay — which is the shell's own job.
  // Destructured so the dependency list is plain identifiers: React Compiler
  // cannot preserve a manual memo whose deps are member expressions off a value
  // it must assume may be mutated (react/preserve-manual-memoization).
  const { suggestion: repoSuggestion, connect: connectSuggestedRepo } = repoProvenance;
  const { openRepoForm } = repoLoad;
  const repoConnect = useMemo<RepoConnectOffer>(
    () => ({
      suggestion: repoSuggestion,
      onConnect: connectSuggestedRepo,
      onOpenLoad: openRepoForm,
    }),
    [repoSuggestion, connectSuggestedRepo, openRepoForm],
  );
  // Roadmap 089: the Dependencies tab's two row actions, and the simulator
  // request slot they share with the share link — one cluster, in its own hook.
  const {
    onPinDep,
    onOpenDepInSimulator,
    simRequest: activeSimRequest,
  } = useDepActions({ addPin, jumpToTab, shareRequest: simRequest, result });
  // Roadmap 085: the signed-in repo picker inside the load overlay. Picking
  // only writes the reference field — Load stays the one trigger.
  const repoPicker = useRepoPicker({
    open: repoLoad.repoFormOpen,
    signedIn,
    query: repoInput,
    onPick: setRepoInput,
  });
  // Roadmap 032/076: the inherited layer's editor lives INSIDE the memoized
  // results pane now, so its change handler has to be identity-stable or the
  // `panels` memo reconciles all seven panels on every keystroke. The hook
  // redeclares `applyInheritedText` every render (it closes over the probe
  // metadata that any hand edit clears), hence the latest-ref idiom.
  // `setGlobalText` is a plain setter and is already stable.
  const onInheritedTextChange = useStableCallback((text: string) => {
    applyInheritedText(text);
  });
  // Roadmap 076: the layer pair the CURRENT inputs would run with, against the
  // pair the displayed result was computed from (`lastRunLayerKey`).
  const currentLayerKey = useMemo(
    () => layerKey(globalParse.config, inheritedParse.config),
    [globalParse.config, inheritedParse.config],
  );
  // Roadmap 076 review: the stages the landing walk shows hollow — a layer
  // with no config is skipped, and that is a fact about the run's INPUTS, so
  // the narration may state it before the engine reports anything. Memoized
  // for the same identity reason as everything else handed into the column.
  const previewSkippedStages = useMemo<readonly StageId[]>(() => {
    const skips: StageId[] = [];
    if (globalParse.config === undefined) {
      skips.push("global");
    }
    if (inheritedParse.config === undefined) {
      skips.push("inherit");
    }
    return skips;
  }, [globalParse.config, inheritedParse.config]);

  // An unparseable 008 layer never silently runs without it — block instead.
  // Roadmap 030: the same gate gets a matching case for the endpoint field
  // (the one point where the manually-typed endpoint is enforced — see
  // `isValidEndpoint`'s doc comment) since it feeds `buildInputs` unchecked.
  function blockedByLayerErrors(): boolean {
    if (globalParse.error) {
      applyFatal(
        `The global config is not valid JSON (${globalParse.error}). Fix it on the Pipeline tab's Global config stage, or clear it to run.`,
      );
      return true;
    }
    if (inheritedParse.error) {
      applyFatal(
        `The inherited config is not valid JSON (${inheritedParse.error}). Fix it on the Pipeline tab's Inherited config stage, or clear it to run.`,
      );
      return true;
    }
    if (endpoint && !isValidEndpoint(endpoint)) {
      applyFatal(
        `The endpoint "${endpoint}" is not an http(s) URL. Fix it or clear the field to run.`,
      );
      return true;
    }
    return false;
  }

  /** The current form state as `RunInputs`, optionally with `content` swapped
   *  out (roadmap 014's "Apply fix" re-runs against the just-edited text
   *  before the `content` state update has committed). */
  function buildInputs(contentOverride?: string): RunInputs {
    return {
      fileName,
      content: contentOverride ?? content,
      platform,
      endpoint,
      globalConfig: globalParse.config,
      inheritedConfig: inheritedParse.config,
      platformOverride: platformOverride && hasGlobalContext,
    };
  }

  /** Roadmap 068: the queue every run goes through — one run on the engine at a
   *  time, commits in request order, and `running` true from the first run
   *  joining to the last one leaving. Its decisions live in `lib/run-queue.ts`,
   *  where they are unit-tested; what is left here is what a run IS. Built once
   *  and kept in a ref, since `setRunning` is stable and the queue's own state
   *  must survive every render. */
  const runQueueRef = useRef<RunQueue<TraceResult | null> | null>(null);
  const runQueue = (runQueueRef.current ??= createRunQueue<TraceResult | null>(setRunning));

  // Roadmap 076 review: the landing → shell handshake — the walk-end signal,
  // the docked flag and the wait that holds the unmounting commit for it.
  const { onLandingWalkEnd, awaitLandingWalk, markShellDocked } = useLandingWalk();

  /**
   * Roadmap 068: the ONE place a run is started — and, since the 2026-08-11
   * review's follow-up, a SERIAL QUEUE rather than a gate.
   *
   * The gate came first: a run requested while one was in flight returned null.
   * That fixed ⌘⏎ auto-repeat and broke every caller that mutates state BEFORE
   * it runs. Apply fix has already rewritten the editor; a preset injection has
   * already marked the node injected; a share link has already replaced the
   * config, the file name, the platform and the layers. For those, "no run" is
   * not "nothing happened" — it is results, an effective config and a simulator
   * all describing a config that is no longer the one on screen, with no marker
   * saying so. So nothing is dropped any more: a run arriving mid-run waits for
   * the one in flight and then executes, returning its own result to its own
   * caller.
   *
   * Nor is anything coalesced BY ENTRY POINT any more, which is where round
   * three went wrong. A `coalesce` opt-out let the callers that mutate nothing
   * first — the Run button, the two chords, "Run again" — decline a run while
   * one was in flight, on the reasoning that a second "run this config" asks for
   * what is already happening. Between two presses the user edits: press ⌘⏎, fix
   * the typo the first run is about to report, press ⌘⏎ again, and the second
   * press was swallowed while the editor's handler still claimed the chord, so
   * nothing queued, nothing said so, and the results that landed described the
   * pre-edit text. Where a request came FROM never did say whether it was a
   * duplicate.
   *
   * Round seven's answer was to ask about the request itself: a request whose
   * every field matched one already in flight (`runRequestKey`) was handed that
   * run's promise instead of queueing. The eighth review deleted it, and the two
   * defects it found are why this comment now ends with a rule that has no
   * exceptions:
   *
   * - the key could only ever fold correctly while it stayed exhaustive over
   *   every input a run reads, and the host tokens are not inputs — `run()`
   *   takes them at fetch time. Paste a token into the Advanced zone while a
   *   run against a private preset host resolves and press ⌘⏎: every field
   *   matched, so the retry folded into the TOKENLESS run, and its "unauthorized"
   *   came back looking like a rejected token;
   * - and folding into "a run with this key" is not the same as folding into the
   *   LAST one. C1 running, edit to C2 and queue it, undo back to C1 and press
   *   again: the key matched the C1 run still in flight, so nothing was queued,
   *   and C2's commit landed last — the editor holding C1 while the results
   *   described C2, with no marker saying so.
   *
   * What the fold bought was three deliberate ⌘⏎ on an unchanged config costing
   * one run instead of three. That is not a defect worth two of these: the runs
   * are serial rather than concurrent, they produce the identical screen, and
   * the two things that made a repeat press GALLING are fixed at their own
   * sources — the results tab is no longer yanked from a reader inside the
   * results (`keepTab`, via `gestureWantsResultsLanding`), and one HELD key is
   * one run, declined by `KeyboardEvent.repeat` in `use-shortcut.ts` and in
   * `run-keymap.ts` (plus `disabled={running}` on the button). Three deliberate
   * presses asking for three runs is simply what they asked for.
   *
   * So: every request runs, in the order it was made, one at a time. Nothing is
   * dropped and nothing is folded.
   */
  async function onRun(
    overrideInjected?: InjectionMap,
    overrideInputs?: RunInputs,
    opts?: RunOptions,
  ): Promise<TraceResult | null> {
    const injectedPresets = overrideInjected ?? injected;
    if (!overrideInputs && blockedByLayerErrors()) {
      // Roadmap 068 review: a refusal is an OUTCOME, and it has to be said out
      // loud for the same reason `executeRun`'s catch says "Run failed." — ⌘⏎
      // deliberately moves no focus, so without this the app's primary shortcut
      // was a dead key to anyone not watching the screen: no announcement, no
      // `Running…`, no result. This region owns run outcomes and says only that
      // one: the keystroke registered, and nothing ran.
      //
      // WHAT is wrong stays the banner's to say, and since the eighth review it
      // says it on every raise rather than only when the message changes (see
      // `applyFatal`). The two are not echoes of each other — one names the
      // broken layer, the other the fate of the keypress — which is why both
      // still speak.
      announceRun("Run blocked — see the error message in the config column.");
      return null;
    }
    // Inputs and the credentials decision are both resolved HERE, before the
    // wait, not inside the queued closure: a queued run has to carry the state
    // its caller meant, and the guard that was in force for THOSE inputs.
    const inputs: RunInputs = overrideInputs ?? buildInputs();
    // Security 2026-07-25: EVERY run while the guard stands — a manual Run
    // click, an injection or apply-fix re-run, the link's own auto-run — leaves
    // the tokens behind. `opts.suppressTokens` is the explicit channel for
    // `loadShareToken` (use-share-link.ts), whose own `setUntrustedGuard` has
    // not committed to state yet when it starts this run.
    const suppressTokens = opts?.suppressTokens === true || untrustedGuardRef.current !== null;
    // …and so is the answer to "which banner is this run allowed to clear" —
    // the one standing NOW. See `applyFatal`: a message raised while this run
    // waits its turn describes something the user did after asking for it, and
    // survives it.
    const fatalSeq = fatalSeqRef.current;
    // Everything this run and its commit depend on is now resolved, so the
    // queue only has to hold the run itself: the wait cannot change it.
    return await runQueue.enqueue(() =>
      executeRun(inputs, injectedPresets, suppressTokens, fatalSeq, opts),
    );
  }

  /** One run, once its turn on the queue comes. Never rejects: a failure is a
   *  fatal-error banner and a null result, which is what `onRun`'s callers
   *  already branch on. */
  async function executeRun(
    inputs: RunInputs,
    injectedPresets: InjectionMap,
    suppressTokens: boolean,
    fatalSeq: number,
    opts?: RunOptions,
  ): Promise<TraceResult | null> {
    try {
      // Only the banner this run was requested against — anything stamped
      // since belongs to something the user did later, which this run did not
      // do and cannot answer.
      if (fatalSeqRef.current === fatalSeq) {
        setFatal(null);
      }
      const runPromise = run({ ...inputs, injectedPresets }, { suppressTokens });
      // Roadmap 076 review: the landing's stage-walk narration IS the
      // landing → shell transition (the design walks all eight stages, THEN
      // docks the results in), and a sub-second run cut it to a single frame.
      // So the commit that unmounts the landing — and only that one — waits
      // for the walk's own end signal (`onLandingWalkEnd`; a reader who asked
      // for less motion has no walk and signals immediately). A run slower
      // than the walk pays nothing either way. The race is a safety net, not
      // the mechanism: a signal that never comes (the one known path is a
      // second run queued behind a failed first, whose walk never restarts)
      // must delay the answer, never withhold it.
      await awaitLandingWalk(runPromise);
      const traceResult = await runPromise;
      // Roadmap 023: hold the current scroll so re-running an edited config
      // doesn't jump the user back to the top (captured right before the result
      // state commits, so an abandoned in-flight run can't pin a stale offset).
      preservedScroll.capture(Boolean(opts?.preserveScroll));
      // Roadmap 068, ninth review: set HERE, one statement before the commit it
      // belongs to, rather than by the caller before its `await`: runs are
      // serial, so the run that commits next is always this one, and a lead
      // armed by a caller could be spoken over by another run that reached its
      // commit first. Cleared to null by every run that names none, so no
      // sentence inherits the lead of the run before it.
      outcomeLeadRef.current = opts?.outcomeLead ?? null;
      setResult(traceResult);
      markShellDocked();
      // Committed WITH the result, never before it: a run that threw or was
      // abandoned must not mark the previous run's output fresh. Roadmap 076:
      // and the layers this run actually carried, for the same reason and with
      // the same timing — they are editable from inside the results now.
      setLastRunContent(inputs.content);
      setLastRunLayerKey(layerKey(inputs.globalConfig, inputs.inheritedConfig));
      const firstError = (Object.entries(traceResult.stageStatus) as [StageId, string][]).find(
        ([, status]) => status === "error",
      );
      // Roadmap 076: a probe that just revealed a layer stage
      // (`revealInheritedStage`) armed it for THIS commit — the run a probe
      // precedes is the run that shows what the layer did, so its landing keeps
      // the stage instead of resetting it. An errored stage still wins: the
      // reader is sent to what broke before what was fetched.
      const revealedStage = pendingLayerStageRef.current;
      pendingLayerStageRef.current = null;
      setSelectedStage(firstError?.[0] ?? revealedStage ?? "preset");
      // Roadmap 028/075: a run lands on Tests, or straight on Problems when a
      // stage errored — the rule itself is `useResultsTab`'s (`landAfterRun`),
      // since it is a fact about the tab strip. WHETHER a run lands is this
      // path's, and it is the half with the reasoning: that landing belongs to
      // the reader of the
      // CONFIG column: they edited, they asked for a run, and this is where its
      // answer starts. `keepTab` is every run that was not asked for from there
      // — the re-runs triggered inside an instrument (injecting a preset,
      // applying a fix), which land themselves, and since 068 made ⌘⏎ global,
      // every press made outside the config column, which is where that
      // landing's reader is (`gestureWantsResultsLanding`). A run that errors
      // under a reader who stayed put still says so: the Problems badge counts
      // it and the banner above the panels states it, neither of which moves
      // anyone.
      if (!opts?.keepTab) {
        landAfterRun(firstError !== undefined);
      }
      focusResultsRef.current = true;
      // the engine chunk is loaded now — hydrate the hover docs and the 014
      // error-translation library. Detached from the run (its result is already
      // committed), so each carries its own ending: a failure here silently
      // removes a feature, and the notice banner is where non-fatal losses go.
      void loadOptionIndex()
        .then(setOptionIndex)
        .catch((err: unknown) => {
          setNotice(`Option documentation could not be loaded — ${errorMessage(err)}`);
        });
      void loadErrorTranslationLib()
        .then(setErrorLib)
        .catch((err: unknown) => {
          setNotice(`Error explanations could not be loaded — ${errorMessage(err)}`);
        });
      return traceResult;
    } catch (err) {
      // Unstamped (see `applyFatal`): the next run's outcome supersedes this one.
      //
      // Deliberately NOT `errorMessage(err)`: this is the run's top-level
      // failure banner, where the error's CLASS is part of the answer
      // ("TypeError: …" reads very differently from "ConfigValidationError: …").
      // Every other site wants the message alone, which is what the shared
      // helper gives them.
      setFatal(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      // Roadmap 068: a failed run is still a FINISHED run, and ⌘⏎ deliberately
      // leaves focus where it was — so without this the user who pressed the
      // app's primary shortcut got no result, no focus move and a live region
      // still reciting the run before it, which reads as a keystroke that never
      // registered. Just the outcome: WHAT went wrong is the banner's to say,
      // and it now says it as a `role="alert"` (ConfigColumn) rather than being
      // announced twice here.
      announceRun("Run failed.");
      return null;
    }
  }

  /**
   * Roadmap 014: writes a curated fix's edit into the editor and re-runs —
   * the validate stage flipping error → ok is the confirmation the user sees.
   * Prefers a surgical text patch (comments/formatting/everything else in the
   * document untouched); when the exact path can't be located in the raw
   * text (e.g. an unsupported JSON5 key style), `applyFixToText` falls back
   * to re-serializing the whole document from `fix.fixedConfig` instead —
   * always correct, but loses comments/original formatting, so this warns
   * about it via the existing notice banner.
   */
  async function applyErrorFix(fix: ErrorFixResult) {
    // Roadmap 068, eighth review: the landing's ticket, taken on the FIRST line
    // — before the two awaits below, because the gesture it answers is the click
    // on "Apply fix" and nothing after this point is the user acting. The run it
    // waits for can take seconds, long enough for them to click into the editor,
    // which is exactly what `landingWanted` is meant to notice. Armed inside
    // `focusTab` instead — i.e. after the await — the ticket's `from` was that
    // editor, so the test found focus precisely where "the gesture" had left it
    // and took it away onto the Problems tab. Rewriting the document below
    // dispatches no `input` event (`lib/focus-landing.ts` states this), so this
    // ticket does not cancel itself.
    const ticket = landing.arm();
    const lib = errorLib ?? (await loadErrorTranslationLib());
    const applied = lib.applyFixToText(content, fix);
    const nextContent = applied?.text ?? jsonDocument(fix.fixedConfig);
    loadConfigText(nextContent);
    if (applied && !applied.surgical) {
      setNotice(
        "Applied the fix by regenerating the whole config document — comments and custom formatting were not preserved.",
      );
    }
    // Roadmap 023: land on the consequence. The question the user actually has
    // is "did the error go away?" — answered by the Problems tab (028; it was
    // the Validate stage before the shell existed), not the Tests tab a plain
    // run lands on. Re-run preserving scroll (Apply fix lives in that same
    // panel), then land there and toast the fresh error count.
    const next = await onRun(undefined, buildInputs(nextContent), {
      preserveScroll: true,
      keepTab: true,
      // Roadmap 068, ninth review: the fix's own outcome, said by the region
      // that owns run outcomes. The toast below shows it to the reader watching
      // the screen and is deliberately not a second live region.
      outcomeLead: "Fix applied, re-ran",
    });
    if (next) {
      setSelectedStage("validate");
      setTab("problems");
      // Roadmap 068: applying a fix IS a request to go look at something, so
      // focus goes with the user — onto the Problems tab, the control that
      // both names where they landed and starts the tab order of the panel
      // holding the answer. The Apply-fix button they pressed is inside a
      // panel this switch just marked `hidden`, so leaving focus there means
      // dropping it on `<body>`.
      focusTab("problems", ticket);
      const n = next.errors.length;
      showToast(`Fix applied — re-ran: ${n === 0 ? "0 errors" : `${n} ${pluralWord(n, "error")}`}`);
    }
  }

  // The stable `onApplyFix` wrapper this function is reached through is
  // registered after the keyboard-landing cluster below — see it for why.

  /**
   * Roadmap 009 (auth-failure surfacing): starts the redirect sign-in — and
   * decides what the user comes BACK to. Signing in is a full-page navigation
   * to GitHub, so everything on screen is gone by the time they return,
   * including the run whose private preset they signed in FOR: the pre-009
   * behavior handed `beginSignIn` the bare fragment, which for anyone who had
   * not also copied a share link meant returning to the DEFAULT config with
   * their work — and the failure they were acting on — silently discarded.
   *
   * So once a run exists, the return fragment is the CURRENT state encoded as
   * a share token. `beginSignIn` stashes it in sessionStorage (never in the
   * URL handed to GitHub, so nothing is exposed by encoding it) and the
   * callback restores it before the share path reads the hash — which then
   * decodes, populates state and auto-runs through the one path that already
   * does exactly that. THAT is the "run again once signed in" loop: the preset
   * that 401'd is re-fetched with the new token, with no second re-run
   * mechanism to keep in step with the first. Before the first run there is
   * nothing to carry and the plain fragment is kept, exactly as before.
   *
   * Deliberately not narrowed to runs that HAD an auth failure: the failure
   * set lives in the tree this redirect is about to destroy, and a sign-in
   * that quietly threw away a clean run's config would be the same bug in a
   * case that is merely less annoying.
   *
   * This is the half of the OAuth cluster that could NOT move into
   * `useOAuthSession`: it reads `result` and the share hook's return-hash
   * builder, and the share hook in turn takes that hook's setters.
   */
  async function signInCarryingState() {
    let returnHash = window.location.hash;
    if (result) {
      try {
        returnHash = await buildSignInReturnHash();
      } catch {
        // Best-effort: an encode failure costs the round trip's state, never
        // the sign-in itself.
      }
    }
    await beginSignIn(returnHash);
  }
  // Roadmap 032: identity-stable (latest-ref idiom) — this prop reaches the
  // memoized results panels, and it reads `result`, which changes per run.
  const onSignIn = useStableCallback(() => {
    void signInCarryingState();
  });

  /**
   * Roadmap 009 (auth-failure surfacing): the banner's "Run again" — the same
   * pipeline run the Run button performs, for the case sign-in cannot fix by
   * itself (signed in already, access granted on GitHub in another tab). It
   * keeps the tab and the scroll position because the banner sits above every
   * panel: the user is looking at the thing they just acted on, and a run that
   * bounced them to another tab would hide its own answer.
   */
  const onRunAgain = useStableCallback(() => {
    void onRun(undefined, undefined, { preserveScroll: true, keepTab: true });
  });

  // Roadmap 032: `onInject` reads `injected` and so is redeclared with it —
  // handed out directly it was the one unstable prop defeating PresetTree's
  // memo on every keystroke. Latest-ref idiom, as with `selectPresetNode`.
  const onInject = useStableCallback((key: string, contentObj: Record<string, unknown>) => {
    const next = { ...injected, [key]: contentObj };
    setInjected(next);
    // Injecting preset content is done FROM the preset tree — keep the user
    // there rather than bouncing them to the landing tab (028).
    void onRun(next, undefined, { preserveScroll: true, keepTab: true });
  });

  // Roadmap 048: every number derived from a finished run — the tab-strip
  // counts, the migration-stepper inputs and the header digest links they must
  // agree with — as one pure derivation over the result and the effective
  // config's reported stats.
  const {
    migrateSteps,
    finalMigrated,
    migrateStepperMounted,
    presetCount,
    errorCount,
    warningCount,
    resultsTabs,
  } = useRunSummary(
    result,
    effectiveStats,
    pins.length,
    overviewBehaviors,
    // Roadmap 089: only a discovery that actually REPORTED gives the
    // Dependencies tab a badge — before that (no repo, not opened yet, or a
    // failed walk) a zero would claim the repository has no dependencies.
    repoDepsView.status === "ready" ? repoDepsView.deps.length : undefined,
  );

  /**
   * Roadmap 068/078: where a keystroke takes you — the `?` sheet every global
   * binding is inert behind, the bindings themselves (⌘⏎, ⌘⇧⏎, `e`, `r`, `?`
   * and the digit keys), the two skip links that mean the same thing with a
   * pointer, and every focus landing those gestures perform. One hook
   * (`app/use-keyboard-landings.ts`), because they are one question: a gesture
   * arrives, and something has to decide where focus ends up and when.
   *
   * `runFromGesture` below is the half that did NOT move: it is the run path,
   * and the run queue is App's (048). It is handed in, and the hook hands back
   * the one focus question that path asks — `gestureWantsResultsLanding`.
   */
  const {
    shortcutSheetOpen,
    showShortcuts,
    hideShortcuts,
    landing,
    focusTab,
    landOnPresetNode,
    skipToConfig,
    skipToResults,
    gestureWantsResultsLanding,
  } = useKeyboardLandings({
    result,
    resultsTabs,
    setTab,
    runFromGesture,
    configColRef,
    resultsColRef,
    configEditorRef,
  });
  // …and the forward handle `selectPresetNode` (declared far above, because
  // `presetHover` needs it) lands through. See its declaration. The write is
  // `useLatestRef`'s, inlined because the ref has to be declared up there
  // rather than here: an insertion effect, so it is not a render-time ref
  // write (`react/refs`) and still lands before anything can activate a
  // cross-link.
  useInsertionEffect(() => {
    landOnPresetNodeRef.current = landOnPresetNode;
  });

  /**
   * Roadmap 032: `applyErrorFix` reads `content` and `errorLib`, so the
   * memoized MessagesPanel gets this stable wrapper (latest-ref idiom) — an
   * "Apply fix" click must patch the text as it is NOW, not as it was when
   * the panel last rendered.
   *
   * Registered HERE rather than beside `applyErrorFix` itself: that function
   * arms and lands through `landing`/`focusTab`, which the destructure above
   * declares, and handing it to a hook any earlier reads those bindings while
   * they are still in their temporal dead zone (`react/immutability`). The
   * function declaration is hoisted, so only the registration had to move, and
   * `onApplyFix` is consumed by the panel props memos further below.
   */
  const onApplyFix = useStableCallback((fix: ErrorFixResult) => {
    void applyErrorFix(fix);
  });

  /**
   * Roadmap 068: what "the user asked for a run" means, in the one place its
   * three entry points — ⌘⏎, ⌘⇧⏎ and the Run button — can share it. Both parts
   * were written out three times, and the preload went missing from one of them
   * for a whole review round.
   *
   * `preloadRunChunks` because the Run button warms the engine and results
   * chunks on hover and focus (031) and a keypress has no hover: without it the
   * download serializes behind the run. `preserveScroll` once a result exists,
   * because a re-run answers an edit and must not throw the reader back to the
   * top of the page.
   *
   * Returns the run's promise — ⌘⇧⏎ is the caller that has to know whether its
   * run ever produced a result.
   */
  function runFromGesture(): Promise<TraceResult | null> {
    preloadRunChunks();
    return onRun(undefined, undefined, {
      preserveScroll: Boolean(result),
      keepTab: !gestureWantsResultsLanding(),
    });
  }

  /**
   * Roadmap 068: a finished run does NOT move focus — the user may still be
   * typing, and a share link can start a run they never asked for. It announces
   * itself instead, and the skip link is how a keyboard user gets to the
   * results in one keystroke.
   *
   * The counts come from `useRunSummary`, not from a second derivation, so this
   * sentence can no more disagree with the tab badges than the 029 digest can.
   *
   * This half is only the runs that PRODUCED a result — it is keyed on
   * `result`, which a run that threw never changes. `executeRun` announces that
   * other half itself, through the same `announceRun`: it has nothing here to
   * key on, and the silence was being read as a shortcut that never registered.
   *
   * Roadmap 068, ninth review: and it owns the whole sentence, lead included.
   * The apply-fix toast used to be a second polite live region reciting this
   * same run; making it visual-only left the fact only IT said — that the fix
   * was applied at all — spoken by nobody, since "Run finished — no problems."
   * is what any successful run says. So the run that answers a fix says so, in
   * the one region that owns run outcomes (`RunOptions.outcomeLead`), and the
   * toast stays the echo for the reader who is watching the screen.
   */
  useEffect(() => {
    if (!result) {
      return;
    }
    const problems = [
      errorCount === 0 ? null : `${errorCount} ${pluralWord(errorCount, "error")}`,
      warningCount === 0 ? null : `${warningCount} ${pluralWord(warningCount, "warning")}`,
    ].filter((part) => part !== null);
    const lead = outcomeLeadRef.current ?? "Run finished";
    announceRun(`${lead} — ${problems.length === 0 ? "no problems" : problems.join(", ")}.`);
    // `announceRun` and the ref are identity-stable (use-app-messages), so
    // listing them leaves this effect firing on the result and the counts.
  }, [result, errorCount, warningCount, announceRun, outcomeLeadRef]);

  // The encode side of `useShareLink`'s copy-link path: assembles the CURRENT
  // state (config + view, optionally simulator inputs) for the share codec.
  // Tokens are never encoded (see share.ts); `sim` carries only dependency-
  // descriptor form fields (roadmap 018).
  async function buildShareState(sim?: ShareSimulator): Promise<ShareState> {
    const renovate = result?.renovateVersion ?? (await getRenovateVersion());
    const view = runViewSelection.toShareView(tab, migrateStepperMounted);
    return {
      config: content,
      fileName,
      platform,
      endpoint,
      renovate,
      globalConfig: globalParse.config,
      inheritedConfig: inheritedParse.config,
      platformOverride: platformOverride && hasGlobalContext,
      view,
      sim,
      pins: pinsAsShareFields(),
      // Roadmap 087: where the config was loaded from, when it was — the
      // opener's connect panel offers to reload it. A suggestion this session
      // never confirmed by a load is not re-shared as provenance.
      ...(loadedRepo === null ? {} : { repo: loadedRepo.repo }),
    };
  }

  /**
   * Roadmap 086: the run-scoped view cluster, provided once. The memo's deps
   * are exactly the context's admission rule — run commits, tab/stage/node/
   * step selections, panel reports, pins — and deliberately nothing that
   * changes on a keystroke, so the provider value (and with it every
   * consumer's render) is untouched while the user types.
   */
  const runView = useMemo<RunView>(
    () => ({
      result,
      validateHasErrors,
      tabs: resultsTabs,
      tab,
      onSelectTab: setTab,
      onWalkTab: walkToTab,
      backTab,
      onBack: () => setTab(backTab ?? "tests"),
      onJumpToTab: jumpToTab,
      errorCount,
      warningCount,
      presetCount,
      effectiveKeys: effectiveStats?.keys ?? null,
      onShowRewrites,
      pipelinePhase,
      onSelectPipelinePhase: setPipelinePhase,
      selectedStage,
      onSelectStage: setSelectedStage,
      deferredStage,
      migrateSteps,
      migrateStepperMounted,
      finalMigrated,
      migrationStepIndex,
      onMigrationStepChange: setMigrationStepIndex,
      selectPresetNode,
      focusEditorRepoIndex,
      errorLib,
      authState,
      onSignIn,
      onRunAgain,
      onInject,
      selectedNodeId,
      onSelectNode: setSelectedNodeId,
      onOverviewStats: setOverviewBehaviors,
      onEffectiveStats: setEffectiveStats,
      onShowDescriptionOrder,
      descriptionLedgerNonce,
      pins,
      onAddPin: addPin,
      onRemovePin: removePin,
      pendingRuleFocus,
      onRuleFocused,
      simRequest: activeSimRequest,
      onCopySimLink: buildShareLinkAndCopy,
      onShare: buildShareLinkAndCopy,
      repoDeps: repoDepsView,
      onLoadRepoDeps: ensureRepoDeps,
      repoConnect,
      onPinDep,
      onOpenDepInSimulator,
      ruleProvenance,
      onJumpToSimRule,
      onApplyFix,
    }),
    [
      result,
      validateHasErrors,
      resultsTabs,
      tab,
      setTab,
      walkToTab,
      backTab,
      jumpToTab,
      errorCount,
      warningCount,
      presetCount,
      effectiveStats,
      onShowRewrites,
      pipelinePhase,
      selectedStage,
      deferredStage,
      migrateSteps,
      migrateStepperMounted,
      finalMigrated,
      migrationStepIndex,
      selectPresetNode,
      focusEditorRepoIndex,
      errorLib,
      authState,
      onSignIn,
      onRunAgain,
      onInject,
      selectedNodeId,
      setOverviewBehaviors,
      setEffectiveStats,
      onShowDescriptionOrder,
      descriptionLedgerNonce,
      pins,
      addPin,
      removePin,
      pendingRuleFocus,
      onRuleFocused,
      activeSimRequest,
      buildShareLinkAndCopy,
      repoDepsView,
      ensureRepoDeps,
      repoConnect,
      onPinDep,
      onOpenDepInSimulator,
      ruleProvenance,
      onJumpToSimRule,
      onApplyFix,
      // These setters now arrive through `useRunViewSelection` rather than
      // straight from `useState`, so the rule can no longer prove they are
      // stable. They are — same setters, one hop further — and listing them
      // costs nothing, since a stable identity never invalidates the memo.
      setSelectedStage,
      setSelectedNodeId,
      setMigrationStepIndex,
      setPipelinePhase,
    ],
  );

  // Built here and handed to ConfigColumn as an already-constructed element:
  // every prop below is App's own state, so the alternative is threading a
  // dozen of them through a column whose only decision is WHERE the zone
  // sits — and it keeps ConfigColumn's own JSX shallow (jsx-max-depth 3).
  const advancedZone = (
    <AdvancedZone
      open={advancedOpen}
      onOpenChange={setAdvancedOpen}
      hostSectionOpen={hostSectionOpen}
      onHostSectionOpenChange={setHostSectionOpen}
      displayPlatform={displayPlatform}
      displayEndpoint={displayEndpoint}
      onPlatformChange={onPlatformChange}
      onEndpointChange={onEndpointChange}
      reflectGlobal={reflectGlobal}
      globalPlatform={globalPlatform}
      globalEndpoint={globalEndpoint}
      platformOverride={platformOverride}
      hasGlobalContext={hasGlobalContext}
      onUseGlobalValues={onUseGlobalValues}
      usesLocal={usesLocal}
      oauthConfigured={oauthConfigured}
      signedIn={signedIn}
      authUser={authUser}
      onSignIn={onSignIn}
      onSignOut={onSignOut}
      hostTokens={hostTokens}
      customHostRules={customHostRules}
      onShowPipelineLayers={onShowPipelineLayers}
    />
  );

  return (
    <AppProviders optionIndex={optionIndex} runView={runView}>
      {/* Roadmap 075: the app is a full-viewport frame — header row on top,
          content below — and the PAGE stops scrolling once a result exists.
          `has-results` is what switches the content area from the landing's
          centered reading column to the two-pane grid; both states live in
          styles/10-messages-tabs.css. */}
      <main className={`app-shell${result ? " has-results" : ""}`}>
        {/* Roadmap 068: the first two tab stops on the page. Off-screen until
            focused, and the results link exists only once there are results —
            an offer to skip to nothing is worse than no offer.

            Both handle their own jump instead of letting the browser follow the
            fragment, for two reasons found by using them: a plain fragment jump
            lands on the COLUMN — for the config that is the welcome blurb, not
            the editor the link names — and it writes `#config-column` into the
            address bar, which in this app is where a `#config=` share link
            lives. The `href` stays for link semantics; the `id` targets stay as
            its fallback. */}
        <a className="skip-link" href="#config-column" onClick={skipToConfig}>
          Skip to the config editor
        </a>
        {result ? (
          <a className="skip-link" href="#results-column" onClick={skipToResults}>
            Skip to the results
          </a>
        ) : null}
        {/* Roadmap 075: the header carries the run's verdict and its digest —
            the numbers that used to be an Overview tab, each wired to the
            instrument that explains it. Before a run it is identity + session
            only; the subtitle that used to sit under it is the landing's. */}
        {/* The run half of the header (verdict, digest links, share) reads the
            run-view context; only the session half stays props (086). */}
        <AppShellHeader
          oauthConfigured={oauthConfigured}
          signedIn={signedIn}
          authUser={authUser}
          onSignOut={onSignOut}
          onShowShortcuts={showShortcuts}
        />
        <AppBanners
          shareError={shareError}
          untrustedGuard={untrustedGuard}
          onAcknowledgeUntrusted={onAcknowledgeUntrusted}
          onTrustUntrustedHost={onTrustUntrustedHost}
        />

        {/* Roadmap 028/075: config on the left, one tabbed results panel on the
            right — two panes of one full-viewport frame, each scrolling itself.
            Below ~60rem they stack (config on top) and the PAGE scrolls again,
            which is the layout this app had before v2. Before the first run
            there is nothing to put beside the editor, so the config column is
            the whole (centered) content area. */}
        <div className={`app-content app-split${result ? " has-results" : ""}`}>
          <ConfigColumn
            columnRef={configColRef}
            hasResult={Boolean(result)}
            onTryExample={() => {
              loadConfigText(EXAMPLE_CONFIG);
              // Roadmap 087 review: the example is nobody's repository — the
              // wholesale replacement ends the previous load's provenance
              // (the footnote's claim, and the share link's `repo`), exactly
              // as a share-link arrival does.
              repoProvenance.clear();
            }}
            // The dogfood shortcut: fetch and run THIS app's own renovate.json,
            // live from its repository — a full URL, so the load pins the
            // github context instead of inheriting whatever host is selected.
            onAnalyzeThisProject={() => void repoLoad.onLoadRepo(REPO_URL)}
            editorKey={editorKey}
            editorRef={configEditorRef}
            fileName={fileName}
            value={content}
            onChange={setContent}
            presetHover={presetHover}
            repoLoad={repoLoad}
            repo={repoInput}
            onRepoChange={setRepoInput}
            inheritAuto={inheritAuto}
            onInheritAutoChange={onInheritAutoFieldChange}
            inheritRepo={inheritFields.repo}
            onInheritRepoChange={onInheritRepoFieldChange}
            inheritFile={inheritFields.file}
            onInheritFileChange={onInheritFileFieldChange}
            repoPicker={repoPicker}
            authUser={authUser}
            onFileNameChange={(value) => configDoc.setFileName(value as ConfigFileName)}
            canRevert={configDoc.canRevert}
            onRevert={configDoc.revert}
            onFormat={configDoc.formatConfig}
            onSignIn={onSignIn}
            untrustedHost={untrustedGuard ? untrustedGuard.host : null}
            onTrustUntrustedHost={onTrustUntrustedHost}
            running={running}
            // Roadmap 031/068: the Run button AND the editor's ⌘⏎ come through
            // here, so both get the chunk warm-up `runFromGesture` carries.
            // `onRunIntent` is the button's own half — hover and focus, which a
            // keypress does not have. Both imports are module-cached, so the
            // button paying for the warm-up twice costs nothing.
            onRun={() => void runFromGesture()}
            onRunIntent={preloadRunChunks}
            onLandingWalkEnd={onLandingWalkEnd}
            previewSkippedStages={previewSkippedStages}
            advancedZone={advancedZone}
            fatal={fatal}
            authState={authState}
            notice={notice}
            onDismissNotice={() => setNotice(null)}
          />

          {result ? (
            <ResultsPane
              result={result}
              resultsColRef={resultsColRef}
              focusResultsRef={focusResultsRef}
              // Roadmap 076: the editor's text OR either merge layer — both are
              // inputs to the run, and both are editable while the result is on
              // screen (the layers on their own pipeline stage cards). This is
              // the keystroke-scoped cluster the run-view context refuses (086).
              resultsStale={content !== lastRunContent || currentLayerKey !== lastRunLayerKey}
              globalText={globalText}
              onGlobalTextChange={setGlobalText}
              inheritedText={inheritedText}
              onInheritedTextChange={onInheritedTextChange}
              globalParse={globalParse}
              inheritedParse={inheritedParse}
              inheritState={inheritState}
            />
          ) : null}
        </div>

        {/* Roadmap 060: the headless interface, announced in visible copy —
            the whole discovery mechanism, and deliberately not a hidden hint.
            075 parked it inside the config pane; it is back under BOTH panes
            now (centered, full frame width) because it is about the whole
            page, not the config half. The landing still does not carry it: a
            reader who has not run anything yet is being offered a second
            interface to a thing they have not seen. */}
        {result ? <HeadlessNote /> : null}
      </main>
      {showBackToTop ? (
        <button
          type="button"
          className="back-to-top"
          onClick={() => window.scrollTo(motionScrollToOptions(0))}
          title="Back to top"
          aria-label="Back to top"
        >
          ↑ Top
        </button>
      ) : null}
      {/* Roadmap 068, eighth review: NOT a live region. Its only message is an
          instrument-triggered re-run's outcome ("Fix applied — re-ran: 0
          errors"), and the run region below announces the outcome of every run
          including that one, so two polite regions were reciting one event in
          sequence. It was never a dependable announcement in any case: it mounts
          WITH its text, and a live region has to exist before its content
          changes for the change to be announced — the rule the region below is
          always-mounted for.

          Ninth review: what that left unspoken was the one fact this toast
          carried and the region below did not — that a FIX was applied, rather
          than a run having finished, which is what that region said for this
          re-run and for every other. So the toast did not get its role back; the
          region got the lead of the sentence ("Fix applied, re-ran — no
          problems.", via `RunOptions.outcomeLead`). One region owns the outcome,
          spoken; this one shows it to the reader who is watching the screen
          rather than listening to it. */}
      {toast ? <div className="rcd-toast">{toast}</div> : null}
      {shortcutSheetOpen ? <ShortcutSheet onClose={hideShortcuts} /> : null}
      {/* Roadmap 068: the run's outcome for anyone not watching the screen.
          Always mounted — a live region has to exist BEFORE its text changes
          or the change is not announced. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the app's ONE announcement channel for a run's outcome, and the aria-live spelled out beside the role is the belt-and-braces that exists because IMPLICIT live regions are the part AT disagrees about. An `output` element would replace both with an implicit one, which is the trade this line was written to avoid. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {runAnnouncement}
      </p>
    </AppProviders>
  );
}
