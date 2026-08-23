import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import type { AuthState } from "@/components/GithubAuthHint";
import { HeadlessNote } from "@/components/HeadlessNote";
import { identityForNodeId, nodeIdForIdentity } from "@/lib/preset-tree-stats";
import type { ResultsColumnProps } from "@/app/ResultsColumn";
import { UntrustedHostBanner } from "@/app/UntrustedHostBanner";
import {
  legacyTabForView,
  resultsTabForShareTab,
  shareTabWantsMigrateStage,
} from "@/data/results-tabs";
import { AppProviders } from "@/app/AppProviders";
import type { RunView } from "@/app/run-view-context";
import { REPO_URL } from "@/data/project-repo";
import { buildPresetLookup, type PresetHoverContext } from "@/lib/preset-hover";
import { motionScrollToOptions, prefersReducedMotion } from "@/lib/motion";
import { findPackageRuleOffsets } from "@/lib/rule-locate";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import {
  beginSignIn,
  getOAuthConfig,
  getStoredUser,
  isSignedIn,
  signOut,
  type StoredUser,
} from "@/platform/oauth";
import {
  type ErrorTranslationLib,
  getRenovateVersion,
  loadErrorTranslationLib,
  loadOptionIndex,
  run,
} from "@/platform/run";
import { preloadEngine } from "@/platform/engine-chunk";
import type { ShareSimulator, ShareState, ShareView, UntrustedEndpointGuard } from "@/lib/share";
import { useBackToTopVisible, useHomeEndPageScroll } from "@/hooks/scroll-ergonomics";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useKeyboardLandings } from "@/app/use-keyboard-landings";
import { ShortcutSheet } from "@/components/ShortcutSheet";
import { isValidEndpoint } from "@/lib/input-schemas";
import { useCustomHostRules, useHostTokens } from "@/hooks/use-host-tokens";
import { useAppMessages } from "@/app/use-app-messages";
import { usePlatformContext } from "@/app/use-platform-context";
import { useInheritedConfigLayer } from "@/app/use-inherited-config-layer";
import { useRepoLoad } from "@/app/use-repo-load";
import { useRepoPicker } from "@/app/use-repo-picker";
import { useRunSummary } from "@/app/use-run-summary";
import { usePanelStats } from "@/app/use-panel-stats";
import { usePinnedRun } from "@/app/use-pinned-run";
import { useResultsTab } from "@/app/use-results-tab";
import { useShareLink } from "@/hooks/use-share-link";
import type { RunInputs } from "@/lib/run-inputs";
import { createRunQueue, type RunQueue } from "@/lib/run-queue";

const DEFAULT_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"]
}
`;

// A richer starter config that gives every part of the app something to show:
// a deprecated option (migrate), string shorthand (massage), presets and
// packageRules for the simulator.
const EXAMPLE_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":dependencyDashboard"],
  "schedule": "before 6am on monday",
  "semanticCommits": true,
  "packageRules": [
    {
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    },
    {
      "matchPackageNames": ["react", "react-dom"],
      "groupName": "react"
    }
  ]
}
`;

/** OAuth sign-in (009). Configured only when both build-time vars are present
 *  (or the deployment's runtime `__RCV_OAUTH__` supplies them); otherwise the
 *  whole feature stays hidden and the PAT fallback remains. Module scope for
 *  the same reason `oauth.ts` resolves `INSTALL_URL` at module scope: neither
 *  input can change after the page loads, so there is nothing for a render to
 *  re-read. */
const OAUTH_CONFIG = getOAuthConfig();

/** Roadmap 031: the whole results half (react-diff-view + diff + every
 *  result-only component) rides one lazy chunk — nothing behind this can
 *  render before a run, and a run downloads the far larger engine chunk
 *  first. Mounted once the first result exists and never unmounted again
 *  (`result` never returns to null and a resolved `lazy` never re-suspends),
 *  so the 028 always-mounted tab-shell state is untouched by the boundary. */
const ResultsColumn = lazy(() =>
  import("@/app/ResultsColumn").then((m) => ({ default: m.ResultsColumn })),
);

/**
 * Roadmap 031/040: the results half — its column wrapper, the lazy boundary
 * and the column itself. One component since 040's depth ratchet: the split's
 * right-hand pane has one level left, and these are three. Props are the
 * column's own, forwarded unchanged.
 */
function ResultsPane(props: ResultsColumnProps) {
  return (
    // Roadmap 068: `id`/`tabIndex` are the skip link's target — see the
    // config column's matching pair.
    <div className="results-col" id="results-column" tabIndex={-1} ref={props.resultsColRef}>
      {/* Roadmap 031: the results chunk is preloaded at idle and on Run
          intent, so this fallback is a formality — and once the lazy module
          has resolved, re-renders never suspend, so the mounted shell (and all
          its per-tab state) is never torn down by the boundary. */}
      <Suspense fallback={null}>
        <ResultsColumn {...props} />
      </Suspense>
    </div>
  );
}

/**
 * Roadmap 075 (v2, iteration 2): the two page-level banners, as one row between
 * the header and the panes. They used to be the first things in `<main>`, above
 * a page that scrolled; in the shell nothing above the content scrolls, so they
 * need a home of their own — the row simply is not there when neither has
 * anything to say. Their markup, roles and semantics are unchanged.
 */
function AppBanners({
  shareError,
  untrustedGuard,
  onAcknowledgeUntrusted,
  onTrustUntrustedHost,
}: {
  shareError: string | null;
  untrustedGuard: UntrustedEndpointGuard | null;
  onAcknowledgeUntrusted: () => void;
  onTrustUntrustedHost: () => void;
}) {
  const showUntrusted = untrustedGuard !== null && !untrustedGuard.acknowledged;
  if (shareError === null && !showUntrusted) {
    return null;
  }
  return (
    <div className="app-banners">
      {shareError ? (
        <div className="share-error-banner" role="alert">
          <strong className="share-error-banner-title">Shared link couldn’t be opened</strong>
          <span>{shareError}</span>
        </div>
      ) : null}
      {showUntrusted && untrustedGuard ? (
        <UntrustedHostBanner
          untrustedGuard={untrustedGuard}
          onAcknowledge={onAcknowledgeUntrusted}
          onTrust={onTrustUntrustedHost}
        />
      ) : null}
    </div>
  );
}

/** Roadmap 031: warms the two chunks a Run needs — the engine, and the
 *  results column that renders its output — so neither download serializes
 *  behind the click. Both dynamic imports are module-cached (idempotent). */
function preloadRunChunks(): void {
  preloadEngine();
  void import("@/app/ResultsColumn").catch(() => {});
}

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

/** Roadmap 076 review: the safety cap on the landing walk-end handshake in
 *  `executeRun`. The uninterrupted walk takes ~1.3 s (StageRailPreview's
 *  `RUNNING_STEP_MS` × eight stages) and the engine's first import can stall
 *  it a while longer, so this only fires when the signal is genuinely lost —
 *  and then it delays the first result, never withholds it. */
const LANDING_WALK_CAP_MS = 4_000;

/** Roadmap 076: the two 008 merge layers as one comparable value — what
 *  `resultsStale` asks about them. Spelled once so the key a run RECORDS and
 *  the key the editor derives can never be two different serializations of the
 *  same pair. */
function layerKey(
  globalConfig: Record<string, unknown> | undefined,
  inheritedConfig: Record<string, unknown> | undefined,
): string {
  return JSON.stringify([globalConfig ?? null, inheritedConfig ?? null]);
}

export function App() {
  const [content, setContent] = useState(DEFAULT_CONFIG);
  // Roadmap 016: the text last loaded from an authoritative source (the
  // default, an example, a share link, a repo fetch, or an applied error
  // fix) — as opposed to whatever the user has typed since. The "revert to
  // loaded config" button restores this; it never changes on a plain edit.
  const [loadedContent, setLoadedContent] = useState(DEFAULT_CONFIG);
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
  // Roadmap 016: bumped by `loadConfigText` to force the CodeMirror instance
  // to remount. The editor's own prop→doc sync defers to a ~200ms "typing
  // latch" that can be starved by browser timer throttling (backgrounded
  // tabs) long enough that a load right after a fast edit never visibly
  // applies, even though `content` state (and everything downstream of it,
  // like Run) is correct — a fresh mount always initializes from `value`
  // directly, sidestepping that debounce entirely.
  const [editorKey, setEditorKey] = useState(0);
  const [fileName, setFileName] = useState<"renovate.json" | "renovate.json5">("renovate.json");
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
  const [signedIn, setSignedIn] = useState(() => (OAUTH_CONFIG ? isSignedIn() : false));
  const [authUser, setAuthUser] = useState<StoredUser | null>(() =>
    OAUTH_CONFIG ? getStoredUser() : null,
  );
  const [injected, setInjected] = useState<InjectionMap>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageId>("preset");
  // Large stage diffs (preset, merge) take a while to render; deferring the
  // stage keeps chip clicks responsive and makes the diff render
  // interruptible instead of blocking the main thread.
  const deferredStage = useDeferredValue(selectedStage);
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
  const [optionIndex, setOptionIndex] = useState<OptionIndex | null>(null);
  // Roadmap 014: curated validator-message translations + suggested fixes,
  // loaded lazily alongside the option index (same engine chunk).
  const [errorLib, setErrorLib] = useState<ErrorTranslationLib | null>(null);
  // Preset-tree selection is owned here so a provenance chain (005) can select
  // a preset node in the tree. Node ids restart every run, so reset on result.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Migration stepper index, owned here so a shareable link (007) can restore
  // the step; reset to 0 on a new result just like the uncontrolled stepper.
  const [migrationStepIndex, setMigrationStepIndex] = useState(0);
  // Roadmap 044: the simulator's merge-stepper index, owned here for the same
  // reason — a shareable link restores it. The simulator itself resets it when
  // a new simulation runs (a new merge sequence), and the reset effect below
  // clears it on a new pipeline result.
  const [mergeStepIndex, setMergeStepIndex] = useState(0);
  /**
   * Roadmap 075 (iteration 6): the pinned tests — dependency descriptors the
   * Tests tab re-simulates against every run.
   *
   * Owned here for the two reasons every other cross-cutting piece of state is:
   * a share link carries them (`buildShareState` / the decode path below), and
   * the tab strip's count is one of the numbers `useRunSummary` assembles. The
   * evaluation itself is the panel's (`usePinnedTests`), keyed on the run.
   */
  const { pins, addPin, removePin, setPinsFromShare, pinsAsShareFields } = usePinnedRun();
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
  // View state pending from a decoded link, applied once the run produces a
  // result (identities → node ids need the resolved tree). A ref, not state, so
  // consuming it does not trigger a render.
  const pendingViewRef = useRef<ShareView | null>(null);
  // Roadmap 017: mirrors of `content`/`loadedContent` for the hashchange
  // listener (inside `useShareLink`), which is registered once (empty deps)
  // and would otherwise close over the state from that first render.
  const contentRef = useLatestRef(content);
  const loadedContentRef = useLatestRef(loadedContent);
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
      setFileName,
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
      pendingViewRef,
      contentRef,
      loadedContentRef,
      buildShareState,
    },
  );
  // Roadmap 013: the editor half of the rule identity cross-links — an
  // imperative jump target, since CodeMirror has no declarative "scroll to
  // offset X" prop. (The simulator half is prop-driven: `pendingRuleFocus`,
  // owned by `useResultsTab` because arriving at a rule is a tab switch.)
  const configEditorRef = useRef<ConfigEditorHandle>(null);
  const ruleProvenance = useRuleProvenance(result);
  // The raw text is re-scanned only when it changes, not on every keystroke's
  // render of something unrelated — this is a plain bracket-depth scan, not a
  // full parse, so it stays cheap even for large configs.
  const packageRuleOffsets = useMemo(() => findPackageRuleOffsets(content), [content]);
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
  }, [jumpToTab]);

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
  }, [jumpToTab]);

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
  }, []);

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

  // Roadmap 028: selecting a preset node from anywhere else (a provenance
  // chip, a simulator rule, an editor preset hover) also switches to the
  // Presets tab. Identity-stable, so the preset-hover context — memoized on
  // the result so its lookup isn't rebuilt on every keystroke — never churns.
  const selectPresetNodeRef = useRef<((nodeId: string) => void) | undefined>(undefined);
  selectPresetNodeRef.current = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    jumpToTab("presets");
    // Roadmap 068: …and land on the node, like every other cross-link. For the
    // two activators that live in a results panel (a provenance chip, a
    // simulator rule) that includes the focus: the tab switch marks their panel
    // `hidden` in the very same commit, the browser blurs them, and without a
    // landing the user's next Tab restarts at the top of the document. The
    // editor's preset hover is the third and keeps its caret — see
    // `jumpDisplacedFocus`.
    landOnPresetNode();
  };
  const selectPresetNode = useCallback((nodeId: string) => {
    selectPresetNodeRef.current?.(nodeId);
  }, []);

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

  // Roadmap 023: the reader's scroll position captured just before a
  // scroll-preserving re-run's result commits, restored once the new DOM has
  // painted (016 did this for re-simulations; full pipeline re-runs still reset
  // scroll). null = this run should NOT preserve it (a fresh config, a share
  // link, or the first run).
  //
  // Roadmap 075: BOTH positions, because which one is "the reader's" now
  // depends on the viewport. In the shell the page does not scroll at all and
  // the results pane is its own scroller; stacked (below ~60rem) the pane is
  // `overflow: visible` and the page scrolls exactly as it used to. Capturing
  // and restoring both costs two property reads and makes the answer
  // independent of the breakpoint — the inapplicable half is 0 either way, and
  // restoring 0 to a container that cannot scroll is a no-op.
  const preserveScrollRef = useRef<{ page: number; results: number } | null>(null);
  useLayoutEffect(() => {
    const saved = preserveScrollRef.current;
    if (saved !== null) {
      preserveScrollRef.current = null;
      window.scrollTo({ top: saved.page, behavior: "auto" });
      if (resultsColRef.current) {
        resultsColRef.current.scrollTop = saved.results;
      }
    }
  }, [result]);

  // A validation message's REPO-config `packageRules[repoIndex]` → the editor
  // line. Reads `packageRuleOffsets`, which is rescanned on every edit — so
  // the memoized panels get the stable wrapper below (032, latest-ref idiom)
  // and a click always jumps against offsets from the CURRENT text, never a
  // closure over stale one.
  const focusEditorRepoIndexRef = useRef<((repoIndex: number) => void) | undefined>(undefined);
  focusEditorRepoIndexRef.current = (repoIndex: number) => {
    const offset = packageRuleOffsets?.[repoIndex];
    if (offset !== undefined) {
      configEditorRef.current?.highlightOffset(offset);
    }
  };
  const focusEditorRepoIndex = useCallback(
    (repoIndex: number) => focusEditorRepoIndexRef.current?.(repoIndex),
    [],
  );

  /** Roadmap 016: the one path every authoritative content load goes
   *  through — sets the text, moves the "revert to loaded config" baseline
   *  to match, and remounts the editor (see `editorKey`'s comment). */
  function loadConfigText(text: string) {
    setContent(text);
    setLoadedContent(text);
    setEditorKey((k) => k + 1);
  }

  /**
   * Design review: a pasted config arrives as one long line and the app had no
   * way to make it readable. Two-space indentation, in place.
   *
   * The parse happens HERE, on the click — never per keystroke, which roadmap
   * 032 measures and this must not make more expensive. Deliberately NOT
   * `loadConfigText`: formatting is an edit, not a load, and moving the revert
   * baseline would quietly retire "Revert to loaded config". Strict JSON only —
   * a `.json5` document that is also valid JSON reformats, and one using
   * JSON5's own syntax says so rather than being silently rewritten into JSON
   * with its comments discarded.
   */
  function formatConfig() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      setNotice(
        fileName.endsWith(".json5")
          ? "Can't format: this reformats strict JSON, and this document is either invalid or uses JSON5 syntax (comments, unquoted keys, trailing commas) that reformatting would discard."
          : "Can't format: fix the JSON syntax first — the editor's markers show where.",
      );
      return;
    }
    const formatted = `${JSON.stringify(parsed, null, 2)}\n`;
    if (formatted === content) {
      showToast("Already formatted");
      return;
    }
    setNotice(null);
    setContent(formatted);
    setEditorKey((k) => k + 1);
  }

  useEffect(() => {
    setSelectedNodeId(null);
    setMigrationStepIndex(0);
    setMergeStepIndex(0);
    // Roadmap 028: a new run invalidates the previous run's async counts —
    // the effective key stats and the Overview's behavior count (083), both
    // recomputed by their views once the new derivations settle (they reset as
    // one, which is what `usePanelStats` exists for) — and any "back to where I
    // was" target from the run that just ended.
    resetPanelStats();
    clearBackTab();
    // Both are identity-stable (`useCallback`s with no dependencies, in
    // `usePanelStats` and `useResultsTab`), so listing them leaves this effect
    // firing on the result and nothing else — they are here because
    // `exhaustive-deps` cannot see that.
  }, [result, resetPanelStats, clearBackTab]);

  // Roadmap 028's post-Run scroll-into-view lives in ResultsColumn since 031:
  // with the results half lazy, an App-side effect on `result` could run
  // against the Suspense fallback (a zero-height column on the very first
  // run) and measure a page the results hadn't grown yet. The column's own
  // effect runs only after its content committed. `focusResultsRef` (armed by
  // onRun below) and `resultsColRef` (the pane to measure) are handed down.

  // Roadmap 048: the load-from-repo cluster — the disclosure and its focus
  // hand-back, the reference fields, the in-flight flag, the auth hint, and
  // the load itself. Called BEFORE the inherited-config layer because that
  // layer derives its probe target from `repoInput`, which this hook owns;
  // everything the load acts on is either declared above or (for the run path,
  // the layer gate and the guard) a hoisted function declaration below.
  const {
    repoFormOpen,
    repoToggleRef,
    toggleRepoForm,
    closeRepoForm,
    repoInput,
    setRepoInput,
    repoRef,
    setRepoRef,
    repoLoading,
    repoAuthHint,
    onLoadRepo,
  } = useRepoLoad({
    platform,
    endpoint,
    applyPlatformContext,
    loadConfigText,
    setFileName,
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
    oauthConfigured: Boolean(OAUTH_CONFIG),
    // Roadmap 045: the org probe when auto-load is on, otherwise the layer as
    // it already stands. An arrow, so it reads the inherited-config layer
    // declared below — by the time a load calls it, that binding exists.
    resolveInheritedConfig: async (args) =>
      inheritAuto ? await probeInheritedConfig(args) : inheritedParse.config,
  });
  // Roadmap 085: the signed-in repo picker inside the load overlay. Picking
  // only writes the reference field — Load stays the one trigger.
  const repoPicker = useRepoPicker({
    open: repoFormOpen,
    signedIn,
    query: repoInput,
    onPick: setRepoInput,
  });
  // Roadmap 045/048: the inherited-config layer — its text and parse, the
  // probe-target fields, the `inheritConfig*` policy read off the global
  // config, and the probe the repo load calls between the repo config arriving
  // and the run that processes it.
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
  // Roadmap 032/076: the inherited layer's editor lives INSIDE the memoized
  // results pane now, so its change handler has to be identity-stable or the
  // `panels` memo reconciles all five panels on every keystroke. The hook
  // redeclares `applyInheritedText` every render (it closes over the probe
  // metadata that any hand edit clears), hence the latest-ref idiom.
  // `setGlobalText` is a plain setter and is already stable.
  const applyInheritedTextRef = useLatestRef(applyInheritedText);
  const onInheritedTextChange = useCallback(
    (text: string) => {
      applyInheritedTextRef.current(text);
    },
    [applyInheritedTextRef],
  );
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

  // Apply pending link view state after the run's result exists. Declared after
  // the reset effect so it wins over the reset for a decoded link.
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
    if (typeof pending.step === "number") {
      setMigrationStepIndex(pending.step);
    }
    // Roadmap 075 (iteration 3): a link that named the Rewrites tab — or a
    // pre-028 one that carried a migration step, which is the same intent
    // spelled differently — is asking for the stepper, and the stepper is the
    // migrate stage's now. Applied AFTER `pending.stage` on purpose: the stage
    // such a link carries is whatever the sender's pipeline rail happened to be
    // on, and it is not what they were pointing at.
    const wantsMigrateStage =
      pending.tab === undefined
        ? typeof pending.step === "number"
        : shareTabWantsMigrateStage(pending.tab);
    if (wantsMigrateStage) {
      setSelectedStage("migrate");
    }
    // Roadmap 044: applied BEFORE the simulator's auto-run (a `sim` link's
    // simulation starts from the simulator's own effect, which deliberately
    // keeps this index instead of resetting to step 0).
    if (typeof pending.simStep === "number") {
      setMergeStepIndex(pending.simStep);
    }
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

  /** Roadmap 076 review: false until the first result commits — i.e. while the
   *  landing (and its stage-walk narration) is still on screen. A ref, not
   *  `result === null`, because `executeRun` runs from the queue with the
   *  closure it was enqueued under: a second run queued behind the first would
   *  still read the stale null and sit out a second walk. A failed first run
   *  leaves it false on purpose — the landing is still up, so the next run
   *  narrates again. */
  const shellDockedRef = useRef(false);

  /** The resolver of the walk-end promise the first commit is holding for —
   *  armed by `executeRun`, fired by `StageRailPreview` via the callback
   *  below. Nulled after firing so a late signal (the timeout the preview
   *  schedules survives one render past the walk) resolves nothing twice. */
  const landingWalkResolveRef = useRef<(() => void) | null>(null);
  const onLandingWalkEnd = useCallback(() => {
    landingWalkResolveRef.current?.();
    landingWalkResolveRef.current = null;
  }, []);

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
      if (!shellDockedRef.current && !prefersReducedMotion()) {
        const walkEnd = new Promise<void>((resolve) => {
          landingWalkResolveRef.current = resolve;
        });
        await Promise.all([
          runPromise,
          Promise.race([
            walkEnd,
            new Promise((resolve) => window.setTimeout(resolve, LANDING_WALK_CAP_MS)),
          ]),
        ]);
      }
      const traceResult = await runPromise;
      // Roadmap 023: hold the current scroll so re-running an edited config
      // doesn't jump the user back to the top (captured right before the result
      // state commits, so an abandoned in-flight run can't pin a stale offset).
      preserveScrollRef.current = opts?.preserveScroll
        ? { page: window.scrollY, results: resultsColRef.current?.scrollTop ?? 0 }
        : null;
      // Roadmap 068, ninth review: set HERE, one statement before the commit it
      // belongs to, rather than by the caller before its `await`: runs are
      // serial, so the run that commits next is always this one, and a lead
      // armed by a caller could be spoken over by another run that reached its
      // commit first. Cleared to null by every run that names none, so no
      // sentence inherits the lead of the run before it.
      outcomeLeadRef.current = opts?.outcomeLead ?? null;
      setResult(traceResult);
      shellDockedRef.current = true;
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
      // error-translation library
      void loadOptionIndex().then(setOptionIndex);
      void loadErrorTranslationLib().then(setErrorLib);
      return traceResult;
    } catch (err) {
      // Unstamped (see `applyFatal`): the next run's outcome supersedes this one.
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
    const nextContent = applied?.text ?? JSON.stringify(fix.fixedConfig, null, 2);
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
      showToast(
        `Fix applied — re-ran: ${n === 0 ? "0 errors" : `${n} error${n === 1 ? "" : "s"}`}`,
      );
    }
  }

  // Roadmap 032: `applyErrorFix` reads `content` and `errorLib`, so the
  // memoized MessagesPanel gets this stable wrapper (latest-ref idiom) — an
  // "Apply fix" click must patch the text as it is NOW, not as it was when
  // the panel last rendered.
  const applyErrorFixRef = useRef<typeof applyErrorFix | undefined>(undefined);
  applyErrorFixRef.current = applyErrorFix;
  const onApplyFix = useCallback((fix: ErrorFixResult) => {
    void applyErrorFixRef.current?.(fix);
  }, []);

  const authState: AuthState = !OAUTH_CONFIG
    ? "unconfigured"
    : signedIn
      ? "signed-in"
      : "signed-out";

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
   */
  const signInRef = useRef<(() => Promise<void>) | undefined>(undefined);
  signInRef.current = async () => {
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
  };
  // Roadmap 032: identity-stable (latest-ref idiom) — this prop reaches the
  // memoized results panels, and it reads `result`, which changes per run.
  const onSignIn = useCallback(() => {
    void signInRef.current?.();
  }, []);

  /**
   * Roadmap 009 (auth-failure surfacing): the banner's "Run again" — the same
   * pipeline run the Run button performs, for the case sign-in cannot fix by
   * itself (signed in already, access granted on GitHub in another tab). It
   * keeps the tab and the scroll position because the banner sits above every
   * panel: the user is looking at the thing they just acted on, and a run that
   * bounced them to another tab would hide its own answer.
   */
  const onRunAgainRef = useRef<(() => void) | undefined>(undefined);
  onRunAgainRef.current = () => {
    void onRun(undefined, undefined, { preserveScroll: true, keepTab: true });
  };
  const onRunAgain = useCallback(() => onRunAgainRef.current?.(), []);

  function onSignOut() {
    signOut();
    setSignedIn(false);
    setAuthUser(null);
  }

  // Roadmap 032: `onInject` reads `injected` and so is redeclared with it —
  // handed out directly it was the one unstable prop defeating PresetTree's
  // memo on every keystroke. Latest-ref idiom, as with `selectPresetNodeRef`.
  const onInjectRef = useRef<
    ((key: string, contentObj: Record<string, unknown>) => void) | undefined
  >(undefined);
  onInjectRef.current = (key: string, contentObj: Record<string, unknown>) => {
    const next = { ...injected, [key]: contentObj };
    setInjected(next);
    // Injecting preset content is done FROM the preset tree — keep the user
    // there rather than bouncing them to the landing tab (028).
    void onRun(next, undefined, { preserveScroll: true, keepTab: true });
  };
  const onInject = useCallback(
    (key: string, contentObj: Record<string, unknown>) => onInjectRef.current?.(key, contentObj),
    [],
  );

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
  } = useRunSummary(result, effectiveStats, pins.length, overviewBehaviors);

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
      errorCount === 0 ? null : `${errorCount} error${errorCount === 1 ? "" : "s"}`,
      warningCount === 0 ? null : `${warningCount} warning${warningCount === 1 ? "" : "s"}`,
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
    // Roadmap 044: the simulator's merge step. Omitted at 0 (its default on
    // both sides) — unlike `step`, nothing infers a tab from it (028's
    // `legacyTabForView` predates it and every link that can carry it also
    // carries an explicit `tab`), so an absent field costs nothing and old
    // links keep decoding unchanged.
    if (mergeStepIndex > 0) {
      view.simStep = mergeStepIndex;
    }
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
    };
  }

  // Roadmap 077: the copied state (and its receipt popover) live in the
  // header's ShareButton — this is only the share-link build, which mirrors
  // the URL into the address bar too. Stable identity so the memoized
  // consumers (TestsPanel via ResultsColumn) don't re-render per keystroke;
  // `buildShareLinkAndCopy` is itself a stable useCallback.
  const onCopyLink = useCallback(async () => {
    await buildShareLinkAndCopy();
  }, [buildShareLinkAndCopy]);

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
      simRequest,
      onCopySimLink: buildShareLinkAndCopy,
      onShare: onCopyLink,
      mergeStepIndex,
      onMergeStepChange: setMergeStepIndex,
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
      simRequest,
      buildShareLinkAndCopy,
      onCopyLink,
      mergeStepIndex,
      ruleProvenance,
      onJumpToSimRule,
      onApplyFix,
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
      platform={platform}
      oauthConfigured={Boolean(OAUTH_CONFIG)}
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
          centered reading column to the two-pane grid; both states are in
          index.css next to each other. */}
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
        {/* The run half of the header (verdict, digest links) reads the
            run-view context; only the session half stays props (086). */}
        <AppShellHeader
          onShare={result ? onCopyLink : undefined}
          oauthConfigured={Boolean(OAUTH_CONFIG)}
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
            onTryExample={() => loadConfigText(EXAMPLE_CONFIG)}
            // The dogfood shortcut: fetch and run THIS app's own renovate.json,
            // live from its repository — a full URL, so the load pins the
            // github context instead of inheriting whatever host is selected.
            onAnalyzeThisProject={() => void onLoadRepo(REPO_URL)}
            editorKey={editorKey}
            editorRef={configEditorRef}
            fileName={fileName}
            value={content}
            onChange={setContent}
            presetHover={presetHover}
            repoFormOpen={repoFormOpen}
            repoToggleRef={repoToggleRef}
            onToggleRepoForm={toggleRepoForm}
            repo={repoInput}
            onRepoChange={setRepoInput}
            gitRef={repoRef}
            onRefChange={setRepoRef}
            repoLoading={repoLoading}
            onLoadRepo={() => void onLoadRepo()}
            onCloseRepoForm={closeRepoForm}
            inheritAuto={inheritAuto}
            onInheritAutoChange={onInheritAutoFieldChange}
            inheritRepo={inheritFields.repo}
            onInheritRepoChange={onInheritRepoFieldChange}
            inheritFile={inheritFields.file}
            onInheritFileChange={onInheritFileFieldChange}
            repoPicker={repoPicker}
            authUser={authUser}
            onFileNameChange={(value) => setFileName(value as typeof fileName)}
            canRevert={content !== loadedContent}
            onRevert={() => loadConfigText(loadedContent)}
            onFormat={formatConfig}
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
            repoAuthHint={repoAuthHint}
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
      {toast ? <div className="rcv-toast">{toast}</div> : null}
      {shortcutSheetOpen ? <ShortcutSheet onClose={hideShortcuts} /> : null}
      {/* Roadmap 068: the run's outcome for anyone not watching the screen.
          Always mounted — a live region has to exist BEFORE its text changes
          or the change is not announced. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {runAnnouncement}
      </p>
    </AppProviders>
  );
}
