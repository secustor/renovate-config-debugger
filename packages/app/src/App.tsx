import {
  lazy,
  type MouseEvent,
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
import { AppHeaderTools } from "@/AppHeaderTools";
import type { ConfigEditorHandle } from "@/features/editor/ConfigEditor";
import { ConfigColumn } from "@/ConfigColumn";
import type { EffectiveStats } from "@/components/EffectiveConfig";
import type { AuthState } from "@/components/GithubAuthHint";
import { identityForNodeId, nodeIdForIdentity } from "@/components/preset-tree-stats";
import type { ResultsColumnProps } from "@/ResultsColumn";
import { UntrustedHostBanner } from "@/UntrustedHostBanner";
import { legacyTabForView, type ResultsTabId } from "@/data/results-tabs";
import { OptionDocsProvider } from "@/components/option-docs";
import { buildPresetLookup, type PresetHoverContext } from "@/lib/preset-hover";
import { motionScrollOptions, motionScrollToOptions } from "@/lib/motion";
import { findPackageRuleOffsets } from "@/lib/rule-locate";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import {
  beginSignIn,
  getOAuthConfig,
  getStoredUser,
  installUrl,
  isSignedIn,
  signOut,
  type StoredUser,
} from "@/platform/oauth";
import {
  type ErrorTranslationLib,
  getRenovateVersion,
  loadErrorTranslationLib,
  loadOptionIndex,
  preloadEngine,
  run,
} from "@/platform/run";
import type { ShareSimulator, ShareState, ShareView, UntrustedEndpointGuard } from "@/lib/share";
import { useBackToTopVisible, useHomeEndPageScroll } from "@/hooks/scroll-ergonomics";
import { useShortcut } from "@/hooks/use-shortcut";
import { useTabDigits } from "@/hooks/use-tab-digits";
import { ShortcutSheet } from "@/components/ShortcutSheet";
import {
  FOCUS_EDITOR_SHORTCUT,
  FOCUS_RESULTS_SHORTCUT,
  HELP_SHORTCUT,
  REGION_NEXT_SHORTCUT,
  REGION_PREV_SHORTCUT,
  RUN_AND_READ_SHORTCUT,
  RUN_SHORTCUT,
} from "@/lib/shortcuts";
import { isValidEndpoint, isValidPlatform, parseLayerJson } from "@/lib/input-schemas";
import { PLATFORM_ENDPOINTS } from "@/data/platform-endpoints";
import {
  ENDPOINT_KEY,
  localRemove,
  persistLocal,
  PLATFORM_KEY,
  readLocal,
} from "@/platform/storage";
import { useHostTokens } from "@/hooks/use-host-tokens";
import { useInheritedConfigLayer } from "@/hooks/use-inherited-config-layer";
import { useRepoLoad } from "@/hooks/use-repo-load";
import { useRunSummary } from "@/hooks/use-run-summary";
import { useShareLink } from "@/hooks/use-share-link";
import type { RunInputs } from "@/lib/run-inputs";

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

/** Roadmap 032: evaluated once — it derives from build-time env only, and a
 *  per-render call handed a fresh value to memoized children for nothing. */
const INSTALL_URL = installUrl();

/** Roadmap 031: the whole results half (react-diff-view + diff + every
 *  result-only component) rides one lazy chunk — nothing behind this can
 *  render before a run, and a run downloads the far larger engine chunk
 *  first. Mounted once the first result exists and never unmounted again
 *  (`result` never returns to null and a resolved `lazy` never re-suspends),
 *  so the 028 always-mounted tab-shell state is untouched by the boundary. */
const ResultsColumn = lazy(() =>
  import("@/ResultsColumn").then((m) => ({ default: m.ResultsColumn })),
);

/**
 * Roadmap 031/040: the results half — its column wrapper, the lazy boundary
 * and the column itself. One component since 040's depth ratchet: the split's
 * right-hand pane has one level left, and these are three. Props are the
 * column's own, forwarded unchanged.
 */
function ResultsPane(props: ResultsColumnProps) {
  return (
    // Roadmap 067: `id`/`tabIndex` are the skip link's target — see the
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

/** The header's identity corner: logo + title. Its own component for the same
 *  reason as ResultsPane — the header sits at the depth ratchet's limit. */
function AppBrand() {
  return (
    <div className="app-brand">
      <img src="/logo-192.png" alt="" width={36} height={36} />
      <h1>Renovate Config Debugger</h1>
    </div>
  );
}

/** Roadmap 031: warms the two chunks a Run needs — the engine, and the
 *  results column that renders its output — so neither download serializes
 *  behind the click. Both dynamic imports are module-cached (idempotent). */
function preloadRunChunks(): void {
  preloadEngine();
  void import("@/ResultsColumn").catch(() => {});
}

type InjectionMap = Record<string, Record<string, unknown>>;

// Roadmap 030: parses an optional JSON config layer (008), pollution-checked
// (own `__proto__`/`constructor`/`prototype` keys anywhere, including nested
// `packageRules[n]`, are rejected). Empty text = layer off, unchanged; the
// "must be a JSON object" message and native JSON.parse error text are kept
// verbatim — both `layer-editor-error` render sites (AdvancedZone) depend on
// them.
const parseLayerText = parseLayerJson;

export function App() {
  const [content, setContent] = useState(DEFAULT_CONFIG);
  // Roadmap 016: the text last loaded from an authoritative source (the
  // default, an example, a share link, a repo fetch, or an applied error
  // fix) — as opposed to whatever the user has typed since. The "revert to
  // loaded config" button restores this; it never changes on a plain edit.
  const [loadedContent, setLoadedContent] = useState(DEFAULT_CONFIG);
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
  const [platform, setPlatform] = useState(() =>
    readLocal(PLATFORM_KEY, "github", isValidPlatform),
  );
  const [endpoint, setEndpoint] = useState(() =>
    readLocal(ENDPOINT_KEY, "https://api.github.com", isValidEndpoint),
  );
  // The 008 global layer's input (JSON text; empty = layer off) + the explicit
  // override of the global config's platform/endpoint (010 "reflect, then
  // override"). The inherited layer's own text lives in the hook below.
  const [globalText, setGlobalText] = useState("");
  const [platformOverride, setPlatformOverride] = useState(false);
  // The single collapsed home of everything a typical repo user never touches
  // (self-hosted layers, platform context, tokens). Auto-opens when a share
  // link arrives carrying self-hosted layers, so their effect isn't invisible.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Roadmap 045: the inherited-layer section is controlled for the same kind of
  // reason as the host section below — a repo load that auto-fills the layer has
  // to be able to open the section holding the result, or the fetch it just did
  // is invisible. Mirrored back on toggle, so the user still owns it.
  const [inheritedSectionOpen, setInheritedSectionOpen] = useState(false);
  // Security 2026-07-25: the host/tokens sub-section, controlled for the same
  // reason — an untrusted-endpoint guard tells the user to review the host, so
  // the field holding it has to be actually on screen, not one more
  // disclosure deep. Mirrored back on toggle so the user still owns it.
  const [hostSectionOpen, setHostSectionOpen] = useState(false);
  // OAuth sign-in (009). Configured only when both build-time vars are present;
  // otherwise the whole feature stays hidden and the PAT fallback remains.
  const oauthConfig = useMemo(() => getOAuthConfig(), []);
  const [signedIn, setSignedIn] = useState(() => (oauthConfig ? isSignedIn() : false));
  const [authUser, setAuthUser] = useState<StoredUser | null>(() =>
    oauthConfig ? getStoredUser() : null,
  );
  const [injected, setInjected] = useState<InjectionMap>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageId>("preset");
  // Large stage diffs (preset, merge) take a while to render; deferring the
  // stage keeps chip clicks responsive and makes the diff render
  // interruptible instead of blocking the main thread.
  const deferredStage = useDeferredValue(selectedStage);
  const [fatal, setFatal] = useState<string | null>(null);
  // Non-fatal notices (version drift, load-from-repo results).
  const [notice, setNotice] = useState<string | null>(null);
  // Security 2026-07-25: set while the platform context in force came from a
  // share link naming an untrusted endpoint. This is the ONLY thing that
  // decides token suppression — it outlives the banner on purpose, so a user
  // who clicks past the warning without reading is not one Run away from
  // handing their token to the attacker's host. Cleared only by the explicit
  // opt-in, by hand-editing platform/endpoint, or by loading something else.
  const [untrustedGuard, setUntrustedGuard] = useState<UntrustedEndpointGuard | null>(null);
  // The same value read synchronously. Every mutation goes through
  // `applyUntrustedGuard`, so a handler that installs/clears the guard and
  // then starts a fetch in the SAME tick (the auto-run of `loadShareToken`
  // in use-share-link.ts, a
  // known-host repo load) decides suppression from the new value rather than
  // from a `useState` closure React has not re-rendered yet — in either
  // direction: over-suppressing would silently break a legitimate private
  // repo load, under-suppressing would leak the token.
  const untrustedGuardRef = useRef<UntrustedEndpointGuard | null>(null);
  // Roadmap 023: a transient toast — used to land an "Apply fix" re-run on its
  // consequence ("re-ran: 0 errors") without yanking the user's scroll around.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
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
  // Roadmap 028: the active results tab, and the one-step "back to where I
  // was" target recorded whenever something OTHER than a tab click moved the
  // user (a provenance chip, a message jump, an Overview pill). The ref
  // mirrors the tab for handlers that need the pre-switch value synchronously.
  const [tab, setTabState] = useState<ResultsTabId>("overview");
  const [backTab, setBackTab] = useState<ResultsTabId | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  // Roadmap 028/029: the Effective config tab's badge + digest numbers,
  // reported by the view itself (it owns the async provenance computation)
  // rather than recomputed here. null = not known yet.
  const [effectiveStats, setEffectiveStats] = useState<EffectiveStats | null>(null);
  // Roadmap 028: bumped to focus the effective config's filter input from the
  // Overview's "Where did a setting come from?" pill.
  const [effectiveFilterNonce, setEffectiveFilterNonce] = useState(0);
  // Roadmap 028: the results pane, so a Run on a stacked (narrow) viewport can
  // scroll its consequence into view instead of appearing to do nothing.
  const resultsColRef = useRef<HTMLDivElement>(null);
  const focusResultsRef = useRef(false);
  // Roadmap 016: End/Home always scroll the page, never a nested card's own
  // scroll box; a back-to-top button appears once the page has scrolled down.
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
  const contentRef = useRef(content);
  contentRef.current = content;
  const loadedContentRef = useRef(loadedContent);
  loadedContentRef.current = loadedContent;
  // Roadmap 033: the whole share/hash/decode cluster — `shareError` feeds the
  // prominent, top-of-page banner below (not the dismissable notice), so a
  // broken link never reads as "nothing happened"; `simRequest` is handed to
  // the RuleSimulator. Everything referenced here that is declared later in
  // this body is either a hoisted function declaration or (for the inherited
  // layer's `applyInheritedText`, which the hook below owns) reached through an
  // arrow that only runs after this render — and the share hook re-reads the
  // host object every render, so nothing goes stale.
  const { shareError, simRequest, buildShareLinkAndCopy, buildSignInReturnHash } = useShareLink(
    oauthConfig,
    {
      onRun: (inputs, opts) => onRun(undefined, inputs, opts),
      loadConfigText,
      setFileName,
      setPlatform,
      setEndpoint,
      setGlobalText,
      setInheritedText: (text) => applyInheritedText(text),
      setPlatformOverride,
      setAdvancedOpen,
      setHostSectionOpen,
      setNotice,
      setSignedIn,
      setAuthUser,
      applyUntrustedGuard,
      pendingViewRef,
      contentRef,
      loadedContentRef,
      buildShareState,
    },
  );
  // Roadmap 013: rule identity cross-links. The editor is an imperative jump
  // target (CodeMirror has no declarative "scroll to offset X" prop); the
  // simulator's target rule is prop-driven since it is a sibling component.
  const configEditorRef = useRef<ConfigEditorHandle>(null);
  const [pendingRuleFocus, setPendingRuleFocus] = useState<number | null>(null);
  const ruleProvenance = useRuleProvenance(result);
  // The raw text is re-scanned only when it changes, not on every keystroke's
  // render of something unrelated — this is a plain bracket-depth scan, not a
  // full parse, so it stays cheap even for large configs.
  const packageRuleOffsets = useMemo(() => findPackageRuleOffsets(content), [content]);
  /** Roadmap 028: a tab the user chose explicitly — clears the back affordance.
   *  Identity-stable (032): reads tab state only through its ref. */
  const setTab = useCallback((next: ResultsTabId) => {
    tabRef.current = next;
    setTabState(next);
    setBackTab(null);
  }, []);

  /** Roadmap 028: a programmatic jump (a cross-instrument link, an Overview
   *  pill) — records where the user was so one click returns them. */
  const jumpToTab = useCallback((next: ResultsTabId) => {
    const from = tabRef.current;
    if (from === next) {
      return;
    }
    tabRef.current = next;
    setTabState(next);
    setBackTab(from);
  }, []);

  // Roadmap 032: stable handlers for the memoized panels — each reads state
  // only through refs and setters, so its identity never changes.
  const onRuleFocused = useCallback(() => setPendingRuleFocus(null), []);
  const onJumpToSimRule = useCallback(
    (index: number) => {
      setPendingRuleFocus(index);
      jumpToTab("simulator");
    },
    [jumpToTab],
  );
  /** The Overview's "Where did a setting come from?" pill: open Effective
   *  config AND focus its filter input. */
  const onWhereFrom = useCallback(() => {
    jumpToTab("effective");
    setEffectiveFilterNonce((n) => n + 1);
  }, [jumpToTab]);

  // Roadmap 028: selecting a preset node from anywhere else (a provenance
  // chip, a simulator rule, an editor preset hover) also switches to the
  // Presets tab. Identity-stable, so the preset-hover context — memoized on
  // the result so its lookup isn't rebuilt on every keystroke — never churns.
  const selectPresetNodeRef = useRef<((nodeId: string) => void) | undefined>(undefined);
  selectPresetNodeRef.current = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    jumpToTab("presets");
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

  // Roadmap 023: window.scrollY captured just before a scroll-preserving
  // re-run's result commits, restored once the new DOM has painted (016 did
  // this for re-simulations; full pipeline re-runs still reset scroll). null =
  // this run should NOT preserve scroll (a fresh config, share link, or first run).
  const preserveScrollRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const y = preserveScrollRef.current;
    if (y !== null) {
      preserveScrollRef.current = null;
      window.scrollTo({ top: y, behavior: "auto" });
    }
  }, [result]);

  /** Roadmap 023: shows a transient toast that auto-dismisses. */
  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }

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

  useEffect(() => {
    setSelectedNodeId(null);
    setMigrationStepIndex(0);
    setMergeStepIndex(0);
    // Roadmap 028: a new run invalidates both the previous run's key counts
    // (recomputed asynchronously by the effective-config view) and any
    // "back to where I was" target from the run that just ended.
    setEffectiveStats(null);
    setBackTab(null);
  }, [result]);

  // Roadmap 028's post-Run scroll-into-view lives in ResultsColumn since 031:
  // with the results half lazy, an App-side effect on `result` could run
  // against the Suspense fallback (a zero-height column on the very first
  // run) and measure a page the results hadn't grown yet. The column's own
  // effect runs only after its content committed. `focusResultsRef` (armed by
  // onRun below) and `resultsColRef` (the pane to measure) are handed down.

  const globalParse = useMemo(() => parseLayerText(globalText), [globalText]);
  // Platform context values the global config carries (008/010 interplay): the
  // control reflects them unless the user explicitly overrides.
  const globalPlatform =
    typeof globalParse.config?.platform === "string" ? globalParse.config.platform : undefined;
  const globalEndpoint =
    typeof globalParse.config?.endpoint === "string" ? globalParse.config.endpoint : undefined;
  const hasGlobalContext = globalPlatform !== undefined || globalEndpoint !== undefined;
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
    setPlatform,
    setEndpoint,
    loadConfigText,
    setFileName,
    setNotice,
    setFatal,
    blockedByLayerErrors,
    applyUntrustedGuard,
    untrustedGuardRef,
    onRun: (inputs, opts) => onRun(undefined, inputs, opts),
    globalConfig: globalParse.config,
    platformOverride: platformOverride && hasGlobalContext,
    oauthConfigured: Boolean(oauthConfig),
    // Roadmap 045: the org probe when auto-load is on, otherwise the layer as
    // it already stands. An arrow, so it reads the inherited-config layer
    // declared below — by the time a load calls it, that binding exists.
    resolveInheritedConfig: async (args) =>
      inheritAuto ? await probeInheritedConfig(args) : inheritedParse.config,
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
    setAdvancedOpen,
    setInheritedSectionOpen,
  });
  const reflectGlobal = hasGlobalContext && !platformOverride;
  const displayPlatform = reflectGlobal && globalPlatform !== undefined ? globalPlatform : platform;
  // A global-config platform also displaces the toolbar endpoint (it belongs
  // to the toolbar's platform): fall back to the global platform's default.
  const displayEndpoint =
    reflectGlobal && globalEndpoint !== undefined
      ? globalEndpoint
      : reflectGlobal && globalPlatform !== undefined
        ? (PLATFORM_ENDPOINTS[globalPlatform] ?? "")
        : endpoint;

  // An override only exists relative to global-config values; when the global
  // config stops defining platform/endpoint, snap back to normal behavior.
  useEffect(() => {
    if (!hasGlobalContext) {
      setPlatformOverride(false);
    }
  }, [hasGlobalContext]);

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
    // view state it does carry.
    const linkTab = pending.tab ?? legacyTabForView(pending);
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
      setFatal(
        `The global config is not valid JSON (${globalParse.error}). Fix it or clear the field to run.`,
      );
      return true;
    }
    if (inheritedParse.error) {
      setFatal(
        `The inherited config is not valid JSON (${inheritedParse.error}). Fix it or clear the field to run.`,
      );
      return true;
    }
    if (endpoint && !isValidEndpoint(endpoint)) {
      setFatal(
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

  async function onRun(
    overrideInjected?: InjectionMap,
    overrideInputs?: RunInputs,
    opts?: { preserveScroll?: boolean; keepTab?: boolean; suppressTokens?: boolean },
  ): Promise<TraceResult | null> {
    const injectedPresets = overrideInjected ?? injected;
    if (!overrideInputs && blockedByLayerErrors()) {
      return null;
    }
    const inputs: RunInputs = overrideInputs ?? buildInputs();
    setRunning(true);
    setFatal(null);
    try {
      const traceResult = await run(
        { ...inputs, injectedPresets },
        // Security 2026-07-25: EVERY run while the guard stands — a manual Run
        // click, an injection or apply-fix re-run, the link's own auto-run —
        // leaves the tokens behind. `opts.suppressTokens` is the explicit
        // channel for `loadShareToken` (use-share-link.ts), whose own
        // `setUntrustedGuard` has not committed to state yet when it starts
        // this run.
        { suppressTokens: opts?.suppressTokens === true || untrustedGuardRef.current !== null },
      );
      // Roadmap 023: hold the current scroll so re-running an edited config
      // doesn't jump the user back to the top (captured right before the result
      // state commits, so an abandoned in-flight run can't pin a stale offset).
      preserveScrollRef.current = opts?.preserveScroll ? window.scrollY : null;
      setResult(traceResult);
      const firstError = (Object.entries(traceResult.stageStatus) as [StageId, string][]).find(
        ([, status]) => status === "error",
      );
      setSelectedStage(firstError?.[0] ?? "preset");
      // Roadmap 028: a run lands on the short Overview — or straight on
      // Problems when a stage errored, the tabbed equivalent of the old
      // "select the first errored stage". `keepTab` is for re-runs the user
      // triggered from inside an instrument (injecting a preset, applying a
      // fix), which land themselves.
      if (!opts?.keepTab) {
        setTab(firstError ? "problems" : "overview");
      }
      focusResultsRef.current = true;
      // the engine chunk is loaded now — hydrate the hover docs and the 014
      // error-translation library
      void loadOptionIndex().then(setOptionIndex);
      void loadErrorTranslationLib().then(setErrorLib);
      return traceResult;
    } catch (err) {
      setFatal(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      return null;
    } finally {
      setRunning(false);
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
    // the Validate stage before the shell existed), not the Overview a plain
    // run lands on. Re-run preserving scroll (Apply fix lives in that same
    // panel), then land there and toast the fresh error count.
    const next = await onRun(undefined, buildInputs(nextContent), {
      preserveScroll: true,
      keepTab: true,
    });
    if (next) {
      setSelectedStage("validate");
      setTab("problems");
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

  /** The one way the guard changes — ref first, so a same-tick reader sees it. */
  function applyUntrustedGuard(next: UntrustedEndpointGuard | null) {
    untrustedGuardRef.current = next;
    setUntrustedGuard(next);
  }

  /**
   * Security 2026-07-25: the user typing in the platform/endpoint fields is a
   * deliberate act that REPLACES the context a link installed, so it ends the
   * guard. Whatever they typed is then governed by the ordinary hand-typed
   * rules (`isValidEndpoint` for storage, `blockedByLayerErrors` for Run).
   */
  function clearUntrustedGuard() {
    applyUntrustedGuard(null);
  }

  function onPlatformChange(value: string) {
    // With a global config supplying platform/endpoint, a manual change is an
    // explicit override (008/010) — flagged with a visible warning below.
    if (hasGlobalContext) {
      setPlatformOverride(true);
    }
    clearUntrustedGuard();
    setPlatform(value);
    if (isValidPlatform(value)) {
      persistLocal(PLATFORM_KEY, value);
    }
    // Snap the endpoint to the new platform's default; the user can still edit.
    const next = PLATFORM_ENDPOINTS[value] ?? "";
    setEndpoint(next);
    persistLocal(ENDPOINT_KEY, next);
  }

  // Roadmap 030: the endpoint is validated (http(s) only — the "dangerous
  // URL" rule) before it is persisted; an invalid value stays only in the
  // live field (see `blockedByLayerErrors`'s endpoint case, which blocks Run
  // rather than silently using it) and is never written to storage.
  function onEndpointChange(value: string) {
    if (hasGlobalContext) {
      setPlatformOverride(true);
    }
    clearUntrustedGuard();
    setEndpoint(value);
    if (isValidEndpoint(value)) {
      persistLocal(ENDPOINT_KEY, value);
    } else {
      localRemove(ENDPOINT_KEY);
    }
  }

  /** "Continue without tokens": the banner collapses to the standing reminder
   *  beside Run. The suppression itself is deliberately untouched — this is an
   *  acknowledgement, not a decision about credentials. */
  function onAcknowledgeUntrusted() {
    const guard = untrustedGuardRef.current;
    if (guard) {
      applyUntrustedGuard({ ...guard, acknowledged: true });
    }
  }

  /** "Use my tokens with <host>": the explicit, host-named opt-in. From here
   *  the endpoint is treated exactly like a hand-typed one — later runs carry
   *  credentials and the platform/endpoint may persist to localStorage. */
  function onTrustUntrustedHost() {
    applyUntrustedGuard(null);
    if (isValidPlatform(platform)) {
      persistLocal(PLATFORM_KEY, platform);
    }
    if (isValidEndpoint(endpoint)) {
      persistLocal(ENDPOINT_KEY, endpoint);
    }
  }

  const authState: AuthState = !oauthConfig
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
   * bounced them to the Overview would hide its own answer.
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
    // there rather than bouncing them to the Overview (028).
    void onRun(next, undefined, { preserveScroll: true, keepTab: true });
  };
  const onInject = useCallback(
    (key: string, contentObj: Record<string, unknown>) => onInjectRef.current?.(key, contentObj),
    [],
  );

  const usesLocal = displayPlatform !== "github";

  // Roadmap 048: every number derived from a finished run — the tab-strip
  // counts, the migration-stepper inputs and the Overview digest they must
  // agree with — as one pure derivation over the result and the effective
  // config's reported stats.
  const {
    migrateSteps,
    finalMigrated,
    migrateStepperMounted,
    errorCount,
    warningCount,
    resultsTabs,
    digest,
  } = useRunSummary(result, effectiveStats);

  /**
   * Roadmap 067: ⌘⏎ (Ctrl+Enter) runs the pipeline from anywhere on the page.
   * Inside the editor the same chord is handled by CodeMirror instead
   * (`run-keymap.ts`) — it has to be, or Renovate's config would gain a blank
   * line every time someone ran it — and that handler marks the event handled,
   * which is what keeps the two from both firing.
   *
   * `preloadRunChunks` is called for the same reason the button calls it on
   * hover and focus: a shortcut has no hover, so without this the engine
   * download would serialize behind the keypress.
   */
  useShortcut(
    RUN_SHORTCUT,
    () => {
      preloadRunChunks();
      void onRun(undefined, undefined, { preserveScroll: Boolean(result) });
    },
    { enabled: !running },
  );

  /**
   * Roadmap 067: the app's two jump targets, defined once.
   *
   * The skip links, the tier-1 `e` / `r` keys and F6's pane cycle all land
   * through these, so a link and a key can never disagree about where "the
   * editor" or "the results" is.
   *
   * The config target is the EDITOR, not the column: landing on the column
   * (what the bare fragment jump did) put the reader on the pre-run welcome
   * blurb with the editor still two tab stops away, which reads as the link
   * having done nothing. Safe to drop someone into a text box now, because 067
   * also stopped the editor from trapping Tab.
   */
  function focusEditor() {
    configEditorRef.current?.focus();
  }

  /** The results equivalent: the tab strip is the first thing worth acting on
   *  there, and a focused tab announces which one is selected. */
  function focusResults(attemptsLeft = 12) {
    const column = resultsColRef.current;
    const selectedTab =
      column?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null;
    // The results half is a lazy chunk (031), so on the FIRST run neither the
    // column nor its tab strip exists yet when ⌘⇧⏎ asks for them. Wait a few
    // frames for the real landing rather than dumping focus on the bare column
    // — and give up rather than spin, because a chunk that never arrives is a
    // failed run, not a focus problem.
    if (!selectedTab && attemptsLeft > 0) {
      requestAnimationFrame(() => focusResults(attemptsLeft - 1));
      return;
    }
    if (!column) {
      return;
    }
    column.scrollIntoView(motionScrollOptions("start"));
    (selectedTab ?? column).focus({ preventScroll: true });
  }

  function skipToConfig(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    focusEditor();
  }

  function skipToResults(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    focusResults();
  }

  /**
   * Roadmap 067 tier 1. Bare `e` / `r` because the modified space is a
   * minefield (⌘⇧E is Firefox's network panel, ⌘⇧C/I/J are devtools) while
   * single letters are free — and `useShortcut` refuses to fire a bare key
   * while the user is typing, which includes a focused `<select>`.
   *
   * Everything here is inert while the shortcut sheet is open: it is a modal
   * dialog, and a key that acted on the page behind it would be acting on
   * something the user cannot see.
   */
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const showShortcuts = useCallback(() => setShortcutSheetOpen(true), []);
  const hideShortcuts = useCallback(() => setShortcutSheetOpen(false), []);
  const keysLive = !shortcutSheetOpen;

  useShortcut(FOCUS_EDITOR_SHORTCUT, focusEditor, { enabled: keysLive });
  useShortcut(FOCUS_RESULTS_SHORTCUT, () => focusResults(), {
    enabled: keysLive && Boolean(result),
  });
  useShortcut(HELP_SHORTCUT, showShortcuts, { enabled: keysLive });

  /**
   * F6 cycles the two panes. It is the platform convention and the only key
   * that works from INSIDE the editor without inventing a chord — at the cost
   * of shadowing the browser's own F6 while this page has focus. Both
   * directions do the same thing here, because two regions have no "backwards".
   */
  function cycleRegion() {
    const column = resultsColRef.current;
    const inResults = column?.contains(document.activeElement) === true;
    if (inResults || !result) {
      focusEditor();
    } else {
      focusResults();
    }
  }
  useShortcut(REGION_NEXT_SHORTCUT, cycleRegion, { enabled: keysLive });
  useShortcut(REGION_PREV_SHORTCUT, cycleRegion, { enabled: keysLive });

  /** `⌘⇧⏎` — run AND go read it. Plain ⌘⏎ deliberately leaves focus alone, so
   *  this is the explicit "take me there" variant; the focus move waits for the
   *  run to actually produce a result. */
  useShortcut(
    RUN_AND_READ_SHORTCUT,
    () => {
      preloadRunChunks();
      void (async () => {
        const traceResult = await onRun(undefined, undefined, {
          preserveScroll: Boolean(result),
        });
        if (traceResult) {
          focusResults();
        }
      })();
    },
    { enabled: keysLive && !running },
  );

  /** `1`–`7` — straight to that results tab, by position in the strip. */
  useTabDigits(
    resultsTabs.length,
    (index) => {
      const target = resultsTabs[index];
      if (!target) {
        return;
      }
      setTab(target.id);
      // The tab's own button is focused on the next frame, once the strip has
      // re-rendered with the new selection — otherwise this would focus the
      // tab the user just left.
      requestAnimationFrame(() => focusResults(0));
    },
    { enabled: keysLive && Boolean(result) },
  );

  /**
   * Roadmap 067: a finished run does NOT move focus — the user may still be
   * typing, and a share link can start a run they never asked for. It announces
   * itself instead, and the skip link is how a keyboard user gets to the
   * results in one keystroke.
   *
   * The counts come from `useRunSummary`, not from a second derivation, so this
   * sentence can no more disagree with the tab badges than the 029 digest can.
   */
  const [runAnnouncement, setRunAnnouncement] = useState("");
  const announcementSeq = useRef(0);
  useEffect(() => {
    if (!result) {
      return;
    }
    const problems = [
      errorCount === 0 ? null : `${errorCount} error${errorCount === 1 ? "" : "s"}`,
      warningCount === 0 ? null : `${warningCount} warning${warningCount === 1 ? "" : "s"}`,
    ].filter((part) => part !== null);
    announcementSeq.current += 1;
    // A live region only speaks when its text CHANGES, and two runs of the
    // same config produce the same sentence — so alternate an invisible
    // non-breaking space to make every run a mutation.
    const pad = announcementSeq.current % 2 === 0 ? " " : "";
    setRunAnnouncement(
      `Run finished — ${problems.length === 0 ? "no problems" : problems.join(", ")}.${pad}`,
    );
  }, [result, errorCount, warningCount]);

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
    };
  }

  // Roadmap 036: the copied state now lives in CopyButton — this is only the
  // share-link build, which mirrors the URL into the address bar too.
  async function onCopyLink() {
    await buildShareLinkAndCopy();
  }

  // Hoisted so its literal JSX call — props unchanged — stays textually in
  // this file (AdvancedZone.tsx is owned by a concurrent pass) while still
  // being handed to ConfigColumn as an already-built element, which keeps
  // ConfigColumn's own JSX shallow.
  const advancedZone = (
    <AdvancedZone
      open={advancedOpen}
      onOpenChange={setAdvancedOpen}
      hostSectionOpen={hostSectionOpen}
      onHostSectionOpenChange={setHostSectionOpen}
      globalParse={globalParse}
      inheritedParse={inheritedParse}
      displayPlatform={displayPlatform}
      displayEndpoint={displayEndpoint}
      onPlatformChange={onPlatformChange}
      onEndpointChange={onEndpointChange}
      reflectGlobal={reflectGlobal}
      globalPlatform={globalPlatform}
      globalEndpoint={globalEndpoint}
      platformOverride={platformOverride}
      hasGlobalContext={hasGlobalContext}
      onUseGlobalValues={() => setPlatformOverride(false)}
      usesLocal={usesLocal}
      platform={platform}
      oauthConfigured={Boolean(oauthConfig)}
      hostTokens={hostTokens}
      globalText={globalText}
      onGlobalTextChange={setGlobalText}
      inheritedText={inheritedText}
      onInheritedTextChange={applyInheritedText}
      inheritState={inheritState}
      inheritedSectionOpen={inheritedSectionOpen}
      onInheritedSectionOpenChange={setInheritedSectionOpen}
    />
  );

  return (
    <OptionDocsProvider index={optionIndex}>
      <main>
        {/* Roadmap 067: the first two tab stops on the page. Off-screen until
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
        {shareError ? (
          <div className="share-error-banner" role="alert">
            <strong className="share-error-banner-title">Shared link couldn’t be opened</strong>
            <span>{shareError}</span>
          </div>
        ) : null}
        {untrustedGuard && !untrustedGuard.acknowledged ? (
          <UntrustedHostBanner
            untrustedGuard={untrustedGuard}
            onAcknowledge={onAcknowledgeUntrusted}
            onTrust={onTrustUntrustedHost}
          />
        ) : null}
        <header className="app-header">
          <AppBrand />
          {/* Roadmap 066: the GitHub session moved here from the config
              toolbar — the corner every user looks in for an account control,
              and the corner 037 already called "about this session". */}
          <AppHeaderTools
            renovateVersion={result?.renovateVersion}
            oauthConfigured={Boolean(oauthConfig)}
            signedIn={signedIn}
            authUser={authUser}
            installUrl={INSTALL_URL}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            onShowShortcuts={showShortcuts}
          />
        </header>
        <p className="subtitle">
          Understand your Renovate config by watching Renovate&apos;s own code process it, step by
          step, right here in your browser. Nothing you paste leaves the page.
        </p>

        {/* Roadmap 028: config on the left, one tabbed results panel on the
            right; below ~60rem the two panes stack (config on top). Before the
            first run there is nothing to put beside the editor, so the config
            column simply keeps the full width. */}
        <div className={`app-split${result ? " has-results" : ""}`}>
          <ConfigColumn
            hasResult={Boolean(result)}
            onTryExample={() => loadConfigText(EXAMPLE_CONFIG)}
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
            onFileNameChange={(value) => setFileName(value as typeof fileName)}
            canRevert={content !== loadedContent}
            onRevert={() => loadConfigText(loadedContent)}
            onSignIn={onSignIn}
            untrustedHost={untrustedGuard ? untrustedGuard.host : null}
            onTrustUntrustedHost={onTrustUntrustedHost}
            running={running}
            onRun={() => void onRun(undefined, undefined, { preserveScroll: Boolean(result) })}
            onRunIntent={preloadRunChunks}
            onCopyLink={onCopyLink}
            advancedZone={advancedZone}
            fatal={fatal}
            repoAuthHint={repoAuthHint}
            authState={authState}
            installUrl={INSTALL_URL}
            notice={notice}
            onDismissNotice={() => setNotice(null)}
          />

          {result ? (
            <ResultsPane
              result={result}
              resultsColRef={resultsColRef}
              focusResultsRef={focusResultsRef}
              tabs={resultsTabs}
              tab={tab}
              onSelectTab={setTab}
              backTab={backTab}
              onBack={() => setTab(backTab ?? "overview")}
              validateHasErrors={validateHasErrors}
              jumpToTab={jumpToTab}
              migrateSteps={migrateSteps}
              selectPresetNode={selectPresetNode}
              focusEditorRepoIndex={focusEditorRepoIndex}
              errorLib={errorLib}
              digest={digest}
              onWhereFrom={onWhereFrom}
              selectedStage={selectedStage}
              onSelectStage={setSelectedStage}
              deferredStage={deferredStage}
              migrateStepperMounted={migrateStepperMounted}
              finalMigrated={finalMigrated}
              migrationStepIndex={migrationStepIndex}
              onMigrationStepChange={setMigrationStepIndex}
              onInject={onInject}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              authState={authState}
              onSignIn={onSignIn}
              installUrl={INSTALL_URL}
              onRunAgain={onRunAgain}
              onEffectiveStats={setEffectiveStats}
              effectiveFilterNonce={effectiveFilterNonce}
              pendingRuleFocus={pendingRuleFocus}
              onRuleFocused={onRuleFocused}
              simRequest={simRequest}
              onCopySimLink={buildShareLinkAndCopy}
              mergeStepIndex={mergeStepIndex}
              onMergeStepChange={setMergeStepIndex}
              errorCount={errorCount}
              warningCount={warningCount}
              ruleProvenance={ruleProvenance}
              onJumpToSimRule={onJumpToSimRule}
              onApplyFix={onApplyFix}
            />
          ) : null}
        </div>
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
      {toast ? (
        <div className="rcv-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
      {shortcutSheetOpen ? <ShortcutSheet onClose={hideShortcuts} /> : null}
      {/* Roadmap 067: the run's outcome for anyone not watching the screen.
          Always mounted — a live region has to exist BEFORE its text changes
          or the change is not announced. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {runAnnouncement}
      </p>
    </OptionDocsProvider>
  );
}
