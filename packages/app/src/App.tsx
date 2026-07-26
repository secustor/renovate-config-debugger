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
  RepoPlatform,
  StageId,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { AdvancedZone } from "./components/AdvancedZone";
import type { ConfigEditorHandle } from "./components/ConfigEditor";
import { ConfigEditorCard } from "./components/ConfigEditorCard";
import { CopyButton } from "./components/CopyButton";
import type { EffectiveStats } from "./components/EffectiveConfig";
import { type AuthState, GithubAuthHint } from "./components/GithubAuthHint";
import {
  identityForNodeId,
  nodeIdForIdentity,
  presetTreeSummary,
} from "./components/preset-tree-stats";
import type { ResultsTabDescriptor } from "./components/ResultsPanel";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { WelcomePanel } from "./components/WelcomePanel";
import { legacyTabForView, type ResultsTabId } from "./results-tabs";
import { buildRunDigest, type DigestInput, type DigestProblem } from "./run-digest";
import { OptionDocsProvider } from "./option-docs";
import { buildPresetLookup, type PresetHoverContext } from "./preset-hover";
import { findPackageRuleOffsets } from "./rule-locate";
import { useRuleProvenance } from "./rule-provenance";
import {
  beginSignIn,
  getOAuthConfig,
  getStoredUser,
  installUrl,
  isSignedIn,
  REVOKE_URL,
  signOut,
  type StoredUser,
} from "./oauth";
import {
  type ErrorTranslationLib,
  getRenovateVersion,
  loadErrorTranslationLib,
  loadOptionIndex,
  loadRepoConfig,
  preloadEngine,
  run,
} from "./run";
import type {
  ShareFileName,
  ShareSimulator,
  ShareState,
  ShareView,
  UntrustedEndpointGuard,
} from "./share";
import { useBackToTopVisible, useHomeEndPageScroll } from "./scroll-ergonomics";
import {
  isValidEndpoint,
  isValidPlatform,
  isValidRepoHost,
  isValidRepoRefPart,
  parseLayerJson,
} from "./input-schemas";
import { PLATFORM_ENDPOINTS } from "./platform-endpoints";
import { ENDPOINT_KEY, localRemove, persistLocal, PLATFORM_KEY, readLocal } from "./storage";
import { useHostTokens } from "./use-host-tokens";
import { type RunInputs, useShareLink } from "./use-share-link";

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

/** Platforms whose repos can be fetched from the browser (roadmap 007/010). */
const FETCHABLE_PLATFORMS = new Set<RepoPlatform>(["github", "gitlab", "gitea", "forgejo"]);

/** Known public hosts → the platform that serves their repos. */
const HOST_PLATFORM: Record<string, RepoPlatform> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "gitea.com": "gitea",
  "codeberg.org": "forgejo",
};

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
  import("./components/ResultsColumn").then((m) => ({ default: m.ResultsColumn })),
);

/** Roadmap 031: warms the two chunks a Run needs — the engine, and the
 *  results column that renders its output — so neither download serializes
 *  behind the click. Both dynamic imports are module-cached (idempotent). */
function preloadRunChunks(): void {
  preloadEngine();
  void import("./components/ResultsColumn").catch(() => {});
}

/** Strips a trailing `.git` and slashes from a repo path. */
function stripRepoSuffix(path: string): string {
  return path.replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
}

/**
 * Parses a repo reference liberally: `org/repo`, `github.com/org/repo`, a full
 * URL (`https://gitlab.com/org/repo`), or scp-style (`git@github.com:org/repo.git`).
 * Returns the host (null for a bare slug) and the repo path (may be nested for
 * GitLab subgroups), or null when it is not a recognizable reference.
 */
function parseRepoRef(raw: string): { host: string | null; repo: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const scp = /^git@([^:]+):(.+)$/.exec(trimmed);
  if (scp?.[1] && scp[2]) {
    return { host: scp[1], repo: stripRepoSuffix(scp[2]) };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const repo = stripRepoSuffix(u.pathname);
      return repo ? { host: u.host, repo } : null;
    } catch {
      return null;
    }
  }
  const path = stripRepoSuffix(trimmed);
  const segments = path.split("/");
  // A first segment that looks like a domain (contains a dot) is treated as a
  // host; owners/groups never contain dots on the supported hosts.
  if (segments.length >= 3 && segments[0]?.includes(".")) {
    return { host: segments[0], repo: segments.slice(1).join("/") };
  }
  if (segments.length < 2 || segments.some((s) => s === "")) {
    return null;
  }
  return { host: null, repo: path };
}

type InjectionMap = Record<string, Record<string, unknown>>;

// Roadmap 030: parses an optional JSON config layer (008), pollution-checked
// (own `__proto__`/`constructor`/`prototype` keys anywhere, including nested
// `packageRules[n]`, are rejected). Empty text = layer off, unchanged; the
// "must be a JSON object" message and native JSON.parse error text are kept
// verbatim — both `layer-editor-error` render sites (AdvancedZone) depend on
// them.
const parseLayerText = parseLayerJson;

/** Starts the redirect sign-in, stashing the current fragment to restore it. */
function onSignIn(): void {
  void beginSignIn(window.location.hash);
}

/**
 * Security 2026-07-25: the banner shown while an untrusted-endpoint guard
 * stands. It names the host and states plainly that nothing is being sent to
 * it. Never a `window.confirm` — a modal would block the run (and every
 * automated/persona session) on a decision the user cannot even evaluate yet,
 * since the endpoint only becomes visible once the link has loaded. The two
 * ways out are the banner's own buttons, so the choice is always explicit and
 * always names the host.
 */
function untrustedEndpointMessage(endpoints: readonly string[]): string {
  const list = endpoints.map((endpoint) => `“${endpoint}”`).join(" and ");
  return (
    `This link asks the analysis to contact ${list}, which is not one of the public code hosts this app trusts. ` +
    `It was opened WITHOUT your GitHub sign-in and without any token you have saved — nothing was sent to that host — ` +
    `and your saved platform settings were left unchanged. ` +
    `Every run keeps leaving your tokens behind until you decide otherwise below; you can review the host under Advanced options → “Repository host & access tokens”.`
  );
}

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
  // 008 layer inputs (JSON text; empty = layer off) + the explicit override of
  // the global config's platform/endpoint (010 "reflect, then override").
  const [globalText, setGlobalText] = useState("");
  const [inheritedText, setInheritedText] = useState("");
  const [platformOverride, setPlatformOverride] = useState(false);
  // The single collapsed home of everything a typical repo user never touches
  // (self-hosted layers, platform context, tokens). Auto-opens when a share
  // link arrives carrying self-hosted layers, so their effect isn't invisible.
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  // this body is a hoisted function declaration, and the hook re-reads the
  // host object every render, so nothing goes stale.
  const { shareError, simRequest, buildShareLinkAndCopy } = useShareLink(oauthConfig, {
    onRun: (inputs, opts) => onRun(undefined, inputs, opts),
    loadConfigText,
    setFileName,
    setPlatform,
    setEndpoint,
    setGlobalText,
    setInheritedText,
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
  });
  // Load-from-repo disclosure (039): collapsed by default — the form only
  // exists while `repoFormOpen`, and the button that opens it lives in the
  // editor card's title bar.
  const [repoFormOpen, setRepoFormOpen] = useState(false);
  const repoToggleRef = useRef<HTMLButtonElement>(null);
  const [repoInput, setRepoInput] = useState("");
  const [repoRef, setRepoRef] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  // When a GitHub load fails with a not-found/auth/rate-limit error, offer the
  // sign-in / install hint next to the failure (009). null = no hint.
  const [repoAuthHint, setRepoAuthHint] = useState<{ rateLimited: boolean } | null>(null);
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
  const inheritedParse = useMemo(() => parseLayerText(inheritedText), [inheritedText]);
  // Platform context values the global config carries (008/010 interplay): the
  // control reflects them unless the user explicitly overrides.
  const globalPlatform =
    typeof globalParse.config?.platform === "string" ? globalParse.config.platform : undefined;
  const globalEndpoint =
    typeof globalParse.config?.endpoint === "string" ? globalParse.config.endpoint : undefined;
  const hasGlobalContext = globalPlatform !== undefined || globalEndpoint !== undefined;
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

  // Granular migrate-stage steps (004); the migrate stage shows the stepper
  // when any exist, otherwise falls back to the whole-stage blob diff.
  const migrateSteps = useMemo(
    () =>
      result?.events.filter((e) => e.stage === "migrate" && e.kind === "migration-applied") ?? [],
    [result],
  );
  const finalMigrated = useMemo(
    () =>
      result?.events.findLast((e) => e.stage === "migrate" && e.kind === "stage-complete")?.after,
    [result],
  );

  // Roadmap 028: the migration stepper lives in the Rewrites tab and stays
  // mounted whenever the run produced steps, so a link can always carry its
  // index (it no longer depends on which stage is selected).
  const migrateStepperMounted = migrateSteps.length > 0;

  // Roadmap 028: preset-resolution failures render in the Problems tab
  // alongside the validator's errors/warnings, so they count toward its badge.
  // One filter pass per result (032): the badge counts these and the digest
  // quotes the first one — both previously re-filtered the event stream.
  const presetErrors = useMemo(
    () => result?.events.filter((e) => e.kind === "preset-error") ?? [],
    [result],
  );
  const presetErrorCount = presetErrors.length;
  const errorCount = (result?.errors.length ?? 0) + presetErrorCount;
  const warningCount = result?.warnings.length ?? 0;
  const presetSummary = useMemo(() => presetTreeSummary(result?.presetTree), [result]);
  const presetCount = presetSummary?.resolved ?? 0;

  // Roadmap 028: the tab strip's ambient counts. A tab whose run produced
  // nothing keeps its place (dimmed, showing its zero) rather than
  // disappearing; `undefined` marks the tabs that have no count to give.
  const resultsTabs: ResultsTabDescriptor[] = [
    { id: "overview" },
    { id: "pipeline" },
    { id: "rewrites", count: migrateSteps.length },
    { id: "presets", count: presetCount },
    // Provenance is computed asynchronously by the effective-config view; no
    // badge until it reports, rather than a wrong zero.
    { id: "effective", count: effectiveStats?.keys },
    { id: "simulator" },
    {
      id: "problems",
      count: errorCount + warningCount,
      tone: errorCount > 0 ? "error" : warningCount > 0 ? "warn" : undefined,
    },
  ];

  /**
   * Roadmap 029: the Overview's plain-English digest. Assembled from exactly
   * the derivations that feed the tab badges above (preset summary, migration
   * steps, the effective-config view's reported stats, the problem counts), so
   * a number in the paragraph can never disagree with the badge beside it.
   * The clause logic itself lives in the pure `run-digest` module.
   */
  const digest = useMemo(() => {
    if (!result) {
      return [];
    }
    // The Problems tab lists validator errors, then warnings, then preset
    // failures — the digest quotes whichever of those comes first.
    const firstProblem: DigestProblem | undefined = result.errors[0]
      ? { severity: "error", topic: result.errors[0].topic, message: result.errors[0].message }
      : result.warnings[0]
        ? {
            severity: "warning",
            topic: result.warnings[0].topic,
            message: result.warnings[0].message,
          }
        : presetErrors[0]
          ? { severity: "error", topic: "Preset", message: presetErrors[0].title }
          : undefined;
    const input: DigestInput = {
      // A parse failure ends the run: the only honest thing to report is why.
      ...(result.stageStatus.parse === "error"
        ? { fatalParse: result.errors[0]?.message ?? "the file could not be parsed" }
        : {}),
      refused: result.stageStatus.validate === "error",
      errors: errorCount,
      warnings: warningCount,
      ...(firstProblem ? { firstProblem } : {}),
      migrations: {
        count: migrateSteps.length,
        // Named only when the digest will use them (≤ 2 rewrites); a rename
        // reads best as `old → new`, anything else by the key it acted on.
        labels:
          migrateSteps.length <= 2
            ? migrateSteps.map((step) => {
                const info = step.migration;
                if (!info) {
                  return step.title;
                }
                return info.key && info.newKey
                  ? `${info.key} → ${info.newKey}`
                  : (info.key ?? info.name);
              })
            : [],
      },
      presets: {
        // Nested extends (packageRules[n].extends) are not entries the user
        // wrote at the top level, so they are not named as such.
        entries: (result.presetTree?.children ?? []).filter((c) => !c.nested).map((c) => c.name),
        resolved: presetCount,
        optionSetting: presetSummary?.optionSetting ?? 0,
        rules: presetSummary?.rules ?? 0,
        // The tree's own error count, so the clause matches the Presets tab it
        // links to (the Problems badge additionally counts validator errors).
        failed: presetSummary?.errors ?? 0,
        injected: result.usedInjections.length,
      },
      effective: {
        options: effectiveStats?.keys ?? null,
        overridden: effectiveStats?.overridden ?? null,
      },
      layers: {
        global: Boolean(result.layerConfigs?.globalResolved),
        inherited: Boolean(result.layerConfigs?.inheritedResolved),
      },
    };
    return buildRunDigest(input);
  }, [
    result,
    presetErrors,
    errorCount,
    warningCount,
    migrateSteps,
    presetCount,
    presetSummary,
    effectiveStats,
  ]);

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

  /** Roadmap 023/039: closing the repo panel — by Cancel, by Escape, or by a
   *  load that succeeded — hands focus back to the button that opened it. The
   *  panel is gone, so focus must land somewhere deliberate, and that button
   *  is both where the user came from and what describes what just closed. */
  function closeRepoForm() {
    setRepoFormOpen(false);
    repoToggleRef.current?.focus();
  }

  // Fetches a repo's Renovate config file and runs it. Derives the platform
  // from a known host (and sets the platform context so a later run resolves
  // `local>` correctly); a bare slug uses the current platform context.
  async function onLoadRepo() {
    const parsed = parseRepoRef(repoInput);
    const trimmedRef = repoRef.trim();
    // Roadmap 030: the parsed host/repo/ref are bounded and control-character
    // free before they compose a request URL/path — the same "Enter a repo
    // as..." notice covers a reference that parsed but shouldn't be trusted.
    if (
      !parsed ||
      !isValidRepoRefPart(parsed.repo) ||
      (parsed.host && !isValidRepoHost(parsed.host)) ||
      !isValidRepoRefPart(trimmedRef)
    ) {
      setNotice("Enter a repo as owner/repo, github.com/owner/repo, or a full repository URL.");
      return;
    }
    let repoPlatform: RepoPlatform;
    let repoEndpoint: string;
    const knownHost = parsed.host ? HOST_PLATFORM[parsed.host] : undefined;
    if (parsed.host && !knownHost) {
      setNotice(
        `Unknown host ${parsed.host}. Set its host and API endpoint under Advanced options → "Repository host & access tokens", then load with the owner/repo form.`,
      );
      return;
    }
    if (knownHost) {
      repoPlatform = knownHost;
      repoEndpoint = PLATFORM_ENDPOINTS[knownHost] ?? "";
    } else {
      if (!FETCHABLE_PLATFORMS.has(platform as RepoPlatform)) {
        setNotice(
          `The current repository host (${platform}) can't be fetched from the browser. Choose github, gitlab, gitea or forgejo under Advanced options → "Repository host & access tokens", or use a full URL.`,
        );
        return;
      }
      repoPlatform = platform as RepoPlatform;
      repoEndpoint = endpoint;
    }

    if (blockedByLayerErrors()) {
      return;
    }
    // Security 2026-07-25: a load from a KNOWN host replaces the platform
    // context with that host's shipped default, so it ends a link's guard —
    // nothing untrusted is left in force. A bare `owner/repo` load reuses the
    // current endpoint, which may be exactly the host the link chose, so it
    // stays suppressed (both for the file probe and the run that follows).
    const suppressTokens = !knownHost && untrustedGuardRef.current !== null;
    if (knownHost) {
      applyUntrustedGuard(null);
    }
    setRepoLoading(true);
    setFatal(null);
    setNotice(null);
    setRepoAuthHint(null);
    try {
      const loaded = await loadRepoConfig(
        {
          platform: repoPlatform,
          repo: parsed.repo,
          endpoint: repoEndpoint || undefined,
          ref: trimmedRef || undefined,
        },
        { suppressTokens },
      );
      const nextFileName: ShareFileName = loaded.fileName.endsWith(".json5")
        ? "renovate.json5"
        : "renovate.json";
      if (knownHost) {
        setPlatform(repoPlatform);
        persistLocal(PLATFORM_KEY, repoPlatform);
        setEndpoint(repoEndpoint);
        persistLocal(ENDPOINT_KEY, repoEndpoint);
      }
      loadConfigText(loaded.content);
      setFileName(nextFileName);
      setNotice(`Loaded ${loaded.fileName} from ${parsed.repo}`);
      // Roadmap 039: the panel's job is done — it collapses so the config it
      // just fetched gets the height back. A FAILED load leaves it open: the
      // reference in it is what the user has to correct.
      closeRepoForm();
      await onRun(
        undefined,
        {
          fileName: nextFileName,
          content: loaded.content,
          platform: repoPlatform,
          endpoint: repoEndpoint || endpoint,
          globalConfig: globalParse.config,
          inheritedConfig: inheritedParse.config,
          platformOverride: platformOverride && hasGlobalContext,
        },
        { suppressTokens },
      );
    } catch (err) {
      const e = err as { name?: string; probed?: string[]; err?: { message?: string } };
      let detail = "";
      if (e?.name === "RepoConfigNotFoundError") {
        const count = e.probed?.length ?? 0;
        setFatal(
          `No Renovate config found in ${parsed.repo} (tried ${count} locations). It may keep its config elsewhere, on a non-default branch, or in a private repo needing a token.`,
        );
      } else {
        detail = e?.err?.message ?? (err instanceof Error ? err.message : String(err));
        setFatal(
          `Could not load from ${repoEndpoint || "the default endpoint"}: ${detail}. For a private repo, sign in or add a token; some hosts block browser (CORS) requests entirely.`,
        );
      }
      // Offer the sign-in / install hint for GitHub loads that look like a
      // private-repo (not-found) or auth/rate-limit failure (009).
      if (oauthConfig && repoPlatform === "github") {
        const rateLimited = /rate limit or missing token/i.test(detail);
        if (e?.name === "RepoConfigNotFoundError" || rateLimited) {
          setRepoAuthHint({ rateLimited });
        }
      }
    } finally {
      setRepoLoading(false);
    }
  }

  return (
    <OptionDocsProvider index={optionIndex}>
      <main>
        {shareError ? (
          <div className="share-error-banner" role="alert">
            <strong className="share-error-banner-title">Shared link couldn’t be opened</strong>
            <span>{shareError}</span>
          </div>
        ) : null}
        {untrustedGuard && !untrustedGuard.acknowledged ? (
          <div className="share-error-banner share-warning-banner" role="alert">
            <strong className="share-error-banner-title">
              Shared link points at an untrusted host — running without your tokens
            </strong>
            <span>{untrustedEndpointMessage(untrustedGuard.endpoints)}</span>
            {/* Two explicit choices, both naming the host. Neither is a
                dismissal: "continue" only collapses this to the standing
                reminder beside Run, the suppression itself stays on. */}
            <div className="share-warning-actions">
              <button type="button" className="share-warning-ack" onClick={onAcknowledgeUntrusted}>
                Continue without tokens
              </button>
              <button type="button" className="share-warning-trust" onClick={onTrustUntrustedHost}>
                Use my tokens with {untrustedGuard.host}
              </button>
            </div>
          </div>
        ) : null}
        <header className="app-header">
          <h1>Renovate Config Visualizer</h1>
          {/* Roadmap 037: the theme override sits beside the version badge —
              the header's existing "about this session" corner. */}
          <span className="app-header-tools">
            <ThemeSwitch />
            {result ? (
              <span className="version-badge">Renovate v{result.renovateVersion}</span>
            ) : null}
          </span>
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
          <div className="config-col">
            {result ? null : <WelcomePanel onTryExample={() => loadConfigText(EXAMPLE_CONFIG)} />}

            <ConfigEditorCard
              editorKey={editorKey}
              editorRef={configEditorRef}
              fileName={fileName}
              value={content}
              onChange={setContent}
              presetHover={presetHover}
              repoFormOpen={repoFormOpen}
              repoToggleRef={repoToggleRef}
              onToggleRepoForm={() => (repoFormOpen ? closeRepoForm() : setRepoFormOpen(true))}
              repo={repoInput}
              onRepoChange={setRepoInput}
              gitRef={repoRef}
              onRefChange={setRepoRef}
              repoLoading={repoLoading}
              onLoadRepo={() => void onLoadRepo()}
              onCloseRepoForm={closeRepoForm}
            />

            <div className="toolbar">
              {/* Roadmap 039: `.ctl` gives form controls the same metrics as
                  `.btn`, so this row is ONE height end to end. */}
              <select
                className="ctl"
                value={fileName}
                onChange={(e) => setFileName(e.target.value as typeof fileName)}
              >
                <option value="renovate.json">renovate.json</option>
                <option value="renovate.json5">renovate.json5</option>
              </select>
              {/* Roadmap 035: rendered only when there is something to revert.
                  It used to be permanently present and merely `disabled`, which
                  looked identical to the enabled state — an offer of an action
                  that silently did nothing. Absence is the honest signal. */}
              {content === loadedContent ? null : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => loadConfigText(loadedContent)}
                  title="Restore the config text as it was last loaded — the default, an example, a share link, a repo fetch, or an applied fix — discarding edits made since"
                >
                  Revert to loaded config
                </button>
              )}
              {oauthConfig ? (
                signedIn ? (
                  <span className="gh-auth-chip" title="Signed in with GitHub">
                    {authUser?.avatarUrl ? (
                      <img
                        className="gh-auth-avatar"
                        src={authUser.avatarUrl}
                        alt=""
                        width={18}
                        height={18}
                      />
                    ) : null}
                    <span className="gh-auth-login">{authUser?.login || "signed in"}</span>
                    <button type="button" className="gh-auth-signout" onClick={onSignOut}>
                      Sign out
                    </button>
                    <a
                      className="gh-auth-revoke"
                      href={REVOKE_URL}
                      target="_blank"
                      rel="noreferrer"
                      title="Revoke this app's access on GitHub (sign-out only clears the local token)"
                    >
                      revoke
                    </a>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={onSignIn}
                    title="Sign in to reach private GitHub presets and repositories (read-only)"
                  >
                    Sign in with GitHub
                  </button>
                )
              ) : null}
              <span className="toolbar-spacer" />
              {/* Security 2026-07-25: the standing reminder. Small, but right
                  where the risk materializes — the Run button — and it never
                  goes away on its own, because the suppression it describes
                  never does either. The opt-in stays reachable from here so a
                  user who acknowledged the banner is not stuck. */}
              {untrustedGuard ? (
                <span
                  className="untrusted-endpoint-chip"
                  title="A shared link chose this host. Runs leave your sign-in and tokens behind until you allow it."
                >
                  runs against {untrustedGuard.host} without tokens
                  <button
                    type="button"
                    className="untrusted-endpoint-allow"
                    onClick={onTrustUntrustedHost}
                  >
                    use my tokens
                  </button>
                </span>
              ) : null}
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void onRun(undefined, undefined, { preserveScroll: Boolean(result) })
                }
                // Roadmap 031: hover/focus signal Run intent — start the
                // engine download then (no-op when the idle preload or an
                // earlier run already fetched it).
                onPointerEnter={preloadRunChunks}
                onFocus={preloadRunChunks}
                disabled={running}
                title="Process this config with Renovate's own code — it never leaves your browser"
              >
                {running ? "Running…" : "Run"}
              </button>
              {/* Roadmap 036: the shared copy affordance. `buildShareLinkAndCopy`
                  writes the clipboard itself (it also mirrors the URL into the
                  address bar), so this passes `onCopy`, not `getText`. */}
              <CopyButton
                onCopy={onCopyLink}
                label="Copy link"
                title="Copy a link that reopens this config and view — never includes your tokens"
              />
            </div>

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
              onInheritedTextChange={setInheritedText}
            />

            {fatal ? <p style={{ color: "var(--error)" }}>{fatal}</p> : null}
            {repoAuthHint ? (
              <GithubAuthHint
                authState={authState}
                rateLimited={repoAuthHint.rateLimited}
                onSignIn={onSignIn}
                installUrl={INSTALL_URL}
              />
            ) : null}
            {notice ? (
              <p className="app-notice">
                {notice}
                <button
                  type="button"
                  className="app-notice-dismiss"
                  onClick={() => setNotice(null)}
                >
                  dismiss
                </button>
              </p>
            ) : null}
          </div>

          {result ? (
            <div className="results-col" ref={resultsColRef}>
              {/* Roadmap 031: the results chunk is preloaded at idle and on
                  Run intent, so this fallback is a formality — and once the
                  lazy module has resolved, re-renders never suspend, so the
                  mounted shell (and all its per-tab state) is never torn
                  down by the boundary. */}
              <Suspense fallback={null}>
                <ResultsColumn
                  result={result}
                  resultsColRef={resultsColRef}
                  focusResultsRef={focusResultsRef}
                  tabs={resultsTabs}
                  tab={tab}
                  onSelectTab={setTab}
                  backTab={backTab}
                  onBack={() => setTab(backTab ?? "overview")}
                  digest={digest}
                  validateHasErrors={validateHasErrors}
                  jumpToTab={jumpToTab}
                  onWhereFrom={onWhereFrom}
                  selectedStage={selectedStage}
                  onSelectStage={setSelectedStage}
                  deferredStage={deferredStage}
                  migrateSteps={migrateSteps}
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
                  selectPresetNode={selectPresetNode}
                  onEffectiveStats={setEffectiveStats}
                  effectiveFilterNonce={effectiveFilterNonce}
                  focusEditorRepoIndex={focusEditorRepoIndex}
                  pendingRuleFocus={pendingRuleFocus}
                  onRuleFocused={onRuleFocused}
                  errorLib={errorLib}
                  simRequest={simRequest}
                  onCopySimLink={buildShareLinkAndCopy}
                  errorCount={errorCount}
                  warningCount={warningCount}
                  ruleProvenance={ruleProvenance}
                  onJumpToSimRule={onJumpToSimRule}
                  onApplyFix={onApplyFix}
                />
              </Suspense>
            </div>
          ) : null}
        </div>
      </main>
      {showBackToTop ? (
        <button
          type="button"
          className="back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
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
    </OptionDocsProvider>
  );
}
