import {
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
import { ConfigEditor, type ConfigEditorHandle } from "./components/ConfigEditor";
import { EffectiveConfig, type EffectiveStats } from "./components/EffectiveConfig";
import { type AuthState, GithubAuthHint } from "./components/GithubAuthHint";
import { HypotheticalBanner } from "./components/HypotheticalBanner";
import { MessagesPanel } from "./components/MessagesPanel";
import { MigrationSteps } from "./components/MigrationSteps";
import { OverviewTab } from "./components/OverviewTab";
import {
  identityForNodeId,
  nodeIdForIdentity,
  PresetTree,
  presetTreeSummary,
} from "./components/PresetTree";
import { ResultsPanel, type ResultsTabDescriptor } from "./components/ResultsPanel";
import { RuleSimulator } from "./components/RuleSimulator";
import { StageDiff } from "./components/StageDiff";
import { STAGE_EXPLAINERS, STAGE_LABELS, StageTimeline } from "./components/StageTimeline";
import { Term } from "./glossary";
import { legacyTabForView, type ResultsTabId } from "./results-tabs";
import { buildRunDigest, type DigestInput, type DigestProblem } from "./run-digest";
import { OptionDocsProvider } from "./option-docs";
import { buildPresetLookup, type PresetHoverContext } from "./preset-hover";
import { findPackageRuleOffsets } from "./rule-locate";
import { useRuleProvenance } from "./rule-provenance";
import {
  beginSignIn,
  completeCallback,
  getOAuthConfig,
  getStoredUser,
  installUrl,
  isSignedIn,
  readCallbackParams,
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
  run,
} from "./run";
import {
  buildShareUrl,
  decideHashChangeAction,
  decideShareRunPolicy,
  decodeShareResult,
  encodeShare,
  readShareToken,
  type ShareDecodeError,
  type ShareFileName,
  type ShareSimulator,
  type ShareView,
} from "./share";
import { useBackToTopVisible, useHomeEndPageScroll } from "./scroll-ergonomics";
import {
  isValidEndpoint,
  isValidPlatform,
  isValidRepoHost,
  isValidRepoRefPart,
  isValidToken,
  parseLayerJson,
} from "./input-schemas";
import { PLATFORM_ENDPOINTS, PLATFORMS } from "./platform-endpoints";

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

const TOKEN_KEY = "rcv.githubToken";
const GITLAB_TOKEN_KEY = "rcv.gitlabToken";
const GITEA_TOKEN_KEY = "rcv.giteaToken";
const FORGEJO_TOKEN_KEY = "rcv.forgejoToken";
const PLATFORM_KEY = "rcv.platform";
const ENDPOINT_KEY = "rcv.endpoint";

/** Platforms whose repos can be fetched from the browser (roadmap 007/010). */
const FETCHABLE_PLATFORMS = new Set<RepoPlatform>(["github", "gitlab", "gitea", "forgejo"]);

/** Known public hosts → the platform that serves their repos. */
const HOST_PLATFORM: Record<string, RepoPlatform> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "gitea.com": "gitea",
  "codeberg.org": "forgejo",
};

/** Roadmap 016: the editor's undo-hint label — "Cmd" on macOS/iOS, "Ctrl"
 *  elsewhere. Evaluated once; the platform doesn't change mid-session. */
const MOD_KEY_LABEL = /Mac|iPhone|iPad|iPod/i.test(
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent,
)
  ? "Cmd"
  : "Ctrl";

/** Roadmap 028: the viewport below which the two panes stack (config on top,
 *  results below) — must stay in sync with index.css's `.app-split` media
 *  query, since the post-Run scroll-into-view only applies while stacked. */
const STACKED_VIEWPORT_QUERY = "(max-width: 60rem)";

/** Roadmap 028: how much of the stacked results pane has to be on screen for a
 *  Run to have visibly produced something. Below this, the run is landed on. */
const MIN_VISIBLE_RESULTS_PX = 200;

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

/** Roadmap 018: a share link's simulator inputs, applied once by nonce. */
interface SimRequest {
  form: Record<string, string>;
  autoSimulate: boolean;
  nonce: number;
}

interface RunInputs {
  fileName: ShareFileName;
  content: string;
  platform: string;
  endpoint: string;
  /** Parsed 008 layers; absent = layer off. */
  globalConfig?: Record<string, unknown>;
  inheritedConfig?: Record<string, unknown>;
  /** The user explicitly overrode the global config's platform/endpoint. */
  platformOverride?: boolean;
}

// Roadmap 030: parses an optional JSON config layer (008), pollution-checked
// (own `__proto__`/`constructor`/`prototype` keys anywhere, including nested
// `packageRules[n]`, are rejected). Empty text = layer off, unchanged; the
// "must be a JSON object" message and native JSON.parse error text are kept
// verbatim — both `layer-editor-error` render sites below depend on them.
const parseLayerText = parseLayerJson;

/** Non-secret settings (platform/endpoint) persist across tabs → localStorage.
 *  Roadmap 030: a value that fails `isValid` is silently reset to the
 *  default and the bad stored value is removed — storage can drift across
 *  app versions or be hand-edited, and it must never poison every later run. */
function readLocal(key: string, fallback: string, isValid: (v: string) => boolean): string {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  if (isValid(raw)) {
    return raw;
  }
  localStorage.removeItem(key);
  return fallback;
}

function persistLocal(key: string, value: string): void {
  if (value) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
}

/** Per-host tokens are secrets → sessionStorage (cleared when the tab closes).
 *  Roadmap 030: same silent-fallback-and-remove rule as {@link readLocal}. */
function readSession(key: string, fallback: string, isValid: (v: string) => boolean): string {
  const raw = sessionStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  if (isValid(raw)) {
    return raw;
  }
  sessionStorage.removeItem(key);
  return fallback;
}

function persistSession(key: string, value: string): void {
  if (value) {
    sessionStorage.setItem(key, value);
  } else {
    sessionStorage.removeItem(key);
  }
}

// One-time migration (009): the four PAT fields move from localStorage to
// sessionStorage. Copy any legacy value across (without clobbering a session
// value) and drop the localStorage copy. Runs once at module load, before the
// component reads its initial state. platform/endpoint stay in localStorage.
const TOKEN_STORAGE_KEYS = [TOKEN_KEY, GITLAB_TOKEN_KEY, GITEA_TOKEN_KEY, FORGEJO_TOKEN_KEY];
for (const key of TOKEN_STORAGE_KEYS) {
  const legacy = localStorage.getItem(key);
  if (legacy !== null) {
    if (sessionStorage.getItem(key) === null) {
      sessionStorage.setItem(key, legacy);
    }
    localStorage.removeItem(key);
  }
}

/** Starts the redirect sign-in, stashing the current fragment to restore it. */
function onSignIn(): void {
  void beginSignIn(window.location.hash);
}

/**
 * Roadmap 027: the prominent banner shown when a `#config=` token was present
 * but unreadable, tailored to the failure mode. Every message says what to do
 * (get a fresh link, check the whole URL was copied), since the fix is always
 * on the sender's side.
 */
const SHARE_ERROR_MESSAGES: Record<ShareDecodeError, string> = {
  damaged:
    "This shared link is damaged and couldn’t be read. Ask the sender to copy the link again, and make sure the whole URL was copied. Showing the default config instead.",
  cutOff:
    "This shared link appears to be cut off. Ask the sender to copy the link again, and make sure the whole URL was copied. Showing the default config instead.",
  incompatible:
    "This shared link was made by an incompatible version of the app and couldn’t be read. Ask the sender for a fresh link. Showing the default config instead.",
};

/**
 * Security 2026-07-25: the banner shown when a link aims the run at an endpoint
 * that is not one of the shipped public hosts. It names the host, states
 * plainly that nothing was sent to it, and describes the deliberate way to
 * proceed. Never a `window.confirm` — a modal would block the run (and every
 * automated/persona session) on a decision the user cannot even evaluate yet,
 * since the endpoint only becomes visible once the link has loaded.
 */
function untrustedEndpointMessage(endpoints: readonly string[]): string {
  const list = endpoints.map((endpoint) => `“${endpoint}”`).join(" and ");
  return (
    `This link asks the analysis to contact ${list}, which is not one of the public code hosts this app trusts. ` +
    `It was opened WITHOUT your GitHub sign-in and without any token you have saved — nothing was sent to that host — ` +
    `and your saved platform settings were left unchanged. ` +
    `If you know and trust this host, review it under Advanced options → “Repository host & access tokens” and press Run to use your tokens against it.`
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
  const [token, setToken] = useState(() => readSession(TOKEN_KEY, "", isValidToken));
  const [gitlabToken, setGitlabToken] = useState(() =>
    readSession(GITLAB_TOKEN_KEY, "", isValidToken),
  );
  const [giteaToken, setGiteaToken] = useState(() =>
    readSession(GITEA_TOKEN_KEY, "", isValidToken),
  );
  const [forgejoToken, setForgejoToken] = useState(() =>
    readSession(FORGEJO_TOKEN_KEY, "", isValidToken),
  );
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
  // Roadmap 027: a token was present but unreadable — a prominent, top-of-page
  // banner (not the dismissable notice), so a broken link never reads as
  // "nothing happened". Cleared whenever a share load succeeds.
  const [shareError, setShareError] = useState<string | null>(null);
  // Security 2026-07-25: a link that decoded fine but points the run at an
  // untrusted endpoint — same prominent banner, and it stays until the user
  // acknowledges it (it explains why this run had no access to their tokens).
  const [shareWarning, setShareWarning] = useState<string | null>(null);
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
  const [copied, setCopied] = useState(false);
  // Roadmap 016: End/Home always scroll the page, never a nested card's own
  // scroll box; a back-to-top button appears once the page has scrolled down.
  useHomeEndPageScroll();
  const showBackToTop = useBackToTopVisible();
  // View state pending from a decoded link, applied once the run produces a
  // result (identities → node ids need the resolved tree). A ref, not state, so
  // consuming it does not trigger a render.
  const pendingViewRef = useRef<ShareView | null>(null);
  // Roadmap 018: a decoded link's simulator inputs, handed to the RuleSimulator
  // to pre-fill (and, when `autoSimulate`, run) once the pipeline run this link
  // triggered has produced its result. A fresh nonce per link lets the child
  // apply each request exactly once; set AFTER the run so the child applies it
  // against the freshly-run config, on both mount and hashchange.
  const [simRequest, setSimRequest] = useState<SimRequest | null>(null);
  const simNonceRef = useRef(0);
  // Roadmap 017: the last `#config=` token (or null) the app itself wrote
  // into the address bar via `history.replaceState` — Copy link, clearing an
  // unreadable share link, or restoring a pre-sign-in fragment after OAuth.
  // The hashchange listener compares against this to ignore its own writes
  // (replaceState doesn't fire `hashchange`, but this stays correct even if
  // a browser ever did, or a future navigation replays the same URL).
  const lastWrittenTokenRef = useRef<string | null>(null);
  // Roadmap 017: mirrors of `content`/`loadedContent` for the hashchange
  // listener, which is registered once (empty deps) and would otherwise
  // close over the state from that first render.
  const contentRef = useRef(content);
  contentRef.current = content;
  const loadedContentRef = useRef(loadedContent);
  loadedContentRef.current = loadedContent;
  // Roadmap 017: guards a decode against a later hashchange (or unmount)
  // superseding it before its async work (decodeShareResult, getRenovateVersion)
  // resolves.
  const decodeGenerationRef = useRef(0);
  // The flag must be (re)set in the effect BODY, not only in the ref
  // initializer: React StrictMode (dev) mounts, runs the cleanup, then mounts
  // again — a cleanup-only latch stays false forever after the second mount,
  // which silently cancelled every share-link decode under `vite dev`.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Load-from-repo form.
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
  /** Roadmap 028: a tab the user chose explicitly — clears the back affordance. */
  function setTab(next: ResultsTabId) {
    tabRef.current = next;
    setTabState(next);
    setBackTab(null);
  }

  /** Roadmap 028: a programmatic jump (a cross-instrument link, an Overview
   *  pill) — records where the user was so one click returns them. */
  function jumpToTab(next: ResultsTabId) {
    const from = tabRef.current;
    if (from === next) {
      return;
    }
    tabRef.current = next;
    setTabState(next);
    setBackTab(from);
  }

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

  /** A validation message's REPO-config `packageRules[repoIndex]` → the editor line. */
  function focusEditorRepoIndex(repoIndex: number) {
    const offset = packageRuleOffsets?.[repoIndex];
    if (offset !== undefined) {
      configEditorRef.current?.highlightOffset(offset);
    }
  }

  /** Roadmap 016: the one path every authoritative content load goes
   *  through — sets the text, moves the "revert to loaded config" baseline
   *  to match, and remounts the editor (see `editorKey`'s comment). */
  function loadConfigText(text: string) {
    setContent(text);
    setLoadedContent(text);
    setEditorKey((k) => k + 1);
  }

  /** Roadmap 017: the one path every self-initiated hash write goes through —
   *  updates the address bar and records the token (or lack of one) so the
   *  hashchange listener can recognize its own writes. */
  function writeHash(url: string, shareToken: string | null) {
    lastWrittenTokenRef.current = shareToken;
    history.replaceState(null, "", url);
  }

  /** Drops the `#config=` fragment, keeping any query string. */
  function clearShareHash() {
    writeHash(window.location.pathname + window.location.search, null);
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

  // Roadmap 028: on a stacked (narrow) viewport the results pane sits below
  // the fold, so a Run would otherwise look like it did nothing — land on the
  // consequence (023's pattern). Runs AFTER the preserve-scroll layout effect
  // above and only when the pane really is off-screen, so a scroll-preserving
  // re-run keeps the position it restored.
  useEffect(() => {
    if (!result || !focusResultsRef.current) {
      return;
    }
    focusResultsRef.current = false;
    const el = resultsColRef.current;
    if (!el || !window.matchMedia(STACKED_VIEWPORT_QUERY).matches) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (visible < MIN_VISIBLE_RESULTS_PX) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

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
  }, [result]);

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
        // Security 2026-07-25: only ever set by `loadShareToken` for a link
        // aimed at an untrusted endpoint. A Run the user presses themselves
        // always carries their credentials — by then they have seen the
        // endpoint in the toolbar (and `blockedByLayerErrors` gates it).
        { suppressTokens: opts?.suppressTokens === true },
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

  /**
   * Roadmap 007/017: decodes a share token, populates every piece of state
   * a link can carry, and runs — the single decode→populate→run path shared
   * by the mount effect (a link opened fresh) and the hashchange listener
   * below (a link opened while the app is already running). `isCancelled`
   * lets either caller abandon the result of a decode a later event has
   * superseded (component unmount, or a second hashchange arriving before
   * the first finishes its awaits).
   */
  async function loadShareToken(shareToken: string, isCancelled: () => boolean): Promise<void> {
    const decoded = await decodeShareResult(shareToken);
    if (isCancelled()) {
      return;
    }
    if (!decoded.ok) {
      setShareError(SHARE_ERROR_MESSAGES[decoded.reason]);
      // A previous link's untrusted-host warning does not apply to this one.
      setShareWarning(null);
      clearShareHash();
      return;
    }
    setShareError(null);
    const payload = decoded.payload;
    // Security 2026-07-25: decide — before anything is applied — whether this
    // link may use the user's credentials and rewrite their stored settings.
    const policy = decideShareRunPolicy(payload);
    setShareWarning(
      policy.suppressTokens ? untrustedEndpointMessage(policy.untrustedEndpoints) : null,
    );
    const nextPlatform = payload.platform ?? "github";
    const nextEndpoint = payload.endpoint ?? "https://api.github.com";
    loadConfigText(payload.config);
    setFileName(payload.fileName);
    // The link's platform/endpoint always reach the UI (transparency: the user
    // must be able to SEE the host that was asked for) but only a trusted one
    // is written to localStorage — a link must never silently repoint a
    // persistent setting at an arbitrary host, where it would outlive the tab
    // and quietly apply to later, credentialed runs.
    setPlatform(nextPlatform);
    setEndpoint(nextEndpoint);
    if (policy.persistPlatformSettings) {
      persistLocal(PLATFORM_KEY, nextPlatform);
      persistLocal(ENDPOINT_KEY, nextEndpoint);
    }
    // 008 layers ride along in v2 links; absent = layers off.
    setGlobalText(payload.globalConfig ? JSON.stringify(payload.globalConfig, null, 2) : "");
    setInheritedText(
      payload.inheritedConfig ? JSON.stringify(payload.inheritedConfig, null, 2) : "",
    );
    setPlatformOverride(payload.platformOverride === true);
    if (payload.globalConfig || payload.inheritedConfig || policy.suppressTokens) {
      setAdvancedOpen(true);
    }
    pendingViewRef.current = payload.view ?? null;
    const current = await getRenovateVersion();
    if (!isCancelled() && payload.renovate && payload.renovate !== current) {
      setNotice(
        `This link was created with Renovate v${payload.renovate}; you're on v${current} — results may differ.`,
      );
    }
    if (!isCancelled()) {
      // Awaited (not fire-and-forget) so a carried simulator descriptor is
      // armed AFTER the result commits — the RuleSimulator then applies it
      // against the freshly-run config, identically on mount and hashchange.
      await onRun(
        undefined,
        {
          fileName: payload.fileName,
          content: payload.config,
          platform: nextPlatform,
          endpoint: nextEndpoint,
          globalConfig: payload.globalConfig,
          inheritedConfig: payload.inheritedConfig,
          platformOverride: payload.platformOverride === true,
        },
        { suppressTokens: policy.suppressTokens },
      );
    }
    if (!isCancelled() && payload.sim) {
      setSimRequest({
        form: payload.sim.form,
        autoSimulate: payload.sim.autoSimulate === true,
        nonce: ++simNonceRef.current,
      });
    }
  }

  // On mount: first complete an OAuth callback if the URL carries one (QUERY
  // params ?code&state), then — reading the possibly-restored fragment — decode
  // a shared config, populate state and auto-run. OAuth runs before the share
  // decode so a share link survives a sign-in round-trip. Runs once.
  useEffect(() => {
    const generation = ++decodeGenerationRef.current;
    const isCancelled = () => !mountedRef.current || decodeGenerationRef.current !== generation;
    void (async () => {
      // 1. OAuth callback (009): validate state, exchange via the Worker, store
      // the token, then strip the query and restore the pre-sign-in fragment.
      const callback = oauthConfig ? readCallbackParams(window.location.search) : null;
      if (callback) {
        try {
          const { user, returnHash } = await completeCallback(callback.code, callback.state);
          if (isCancelled()) {
            return;
          }
          setSignedIn(true);
          setAuthUser(user);
          writeHash(window.location.pathname + returnHash, readShareToken(returnHash));
        } catch (err) {
          if (isCancelled()) {
            return;
          }
          setNotice(
            `GitHub sign-in failed: ${err instanceof Error ? err.message : String(err)}. You can still use the app signed out.`,
          );
          writeHash(window.location.pathname, null);
          return;
        }
      }

      // 2. Shared config (007) from the URL fragment (survives the OAuth strip).
      const shareToken = readShareToken(window.location.hash);
      if (!shareToken) {
        return;
      }
      await loadShareToken(shareToken, isCancelled);
    })();
  }, []);

  // Roadmap 017: a share link opened while the app is already running is a
  // hash-only navigation — nothing reloads, so without this listener nothing
  // happens (no load, no run, no error). `decideHashChangeAction` (pure, in
  // share.ts) decides whether the new hash carries a token worth loading and
  // whether loading it would clobber unsaved edits; `event.oldURL` is what
  // lets a declined confirm restore exactly the hash that was showing before
  // the navigation, so the address bar never lies about what's on screen.
  // Registered once (empty deps) — `contentRef`/`loadedContentRef` keep it
  // reading current state despite that.
  useEffect(() => {
    function onHashChange(event: HashChangeEvent) {
      const decision = decideHashChangeAction(
        window.location.hash,
        lastWrittenTokenRef.current,
        contentRef.current !== loadedContentRef.current,
      );
      if (decision.action === "ignore") {
        return;
      }
      if (
        decision.needsConfirm &&
        !window.confirm("Load shared config? Your current edits will be replaced.")
      ) {
        const oldHash = new URL(event.oldURL).hash;
        writeHash(
          window.location.pathname + window.location.search + oldHash,
          readShareToken(oldHash),
        );
        return;
      }
      const generation = ++decodeGenerationRef.current;
      const isCancelled = () => !mountedRef.current || decodeGenerationRef.current !== generation;
      void loadShareToken(decision.token, isCancelled);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Roadmap 030: a token is validated (no control chars, sane length — the
  // header-injection rule) before it is ever written to storage; the field
  // still reflects whatever was typed (so the user isn't blocked mid-edit),
  // it just isn't persisted while invalid — see the token inputs' inline
  // error text below for the same check surfaced in the UI.
  function makeTokenHandler(key: string, setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      if (isValidToken(value)) {
        persistSession(key, value);
      } else {
        sessionStorage.removeItem(key);
      }
    };
  }
  const onTokenChange = makeTokenHandler(TOKEN_KEY, setToken);

  function onPlatformChange(value: string) {
    // With a global config supplying platform/endpoint, a manual change is an
    // explicit override (008/010) — flagged with a visible warning below.
    if (hasGlobalContext) {
      setPlatformOverride(true);
    }
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
    setEndpoint(value);
    if (isValidEndpoint(value)) {
      persistLocal(ENDPOINT_KEY, value);
    } else {
      localStorage.removeItem(ENDPOINT_KEY);
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

  function onInject(key: string, contentObj: Record<string, unknown>) {
    const next = { ...injected, [key]: contentObj };
    setInjected(next);
    // Injecting preset content is done FROM the preset tree — keep the user
    // there rather than bouncing them to the Overview (028).
    void onRun(next, undefined, { preserveScroll: true, keepTab: true });
  }

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
  const presetErrorCount = useMemo(
    () => result?.events.filter((e) => e.kind === "preset-error").length ?? 0,
    [result],
  );
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
    const presetErrors = result.events.filter((e) => e.kind === "preset-error");
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
  }, [result, errorCount, warningCount, migrateSteps, presetCount, presetSummary, effectiveStats]);

  // Encodes the CURRENT state (config + view, optionally simulator inputs) into
  // a link, copies it, and mirrors it into the address bar. Never continuously
  // syncs the hash (huge configs would thrash the URL) — on demand only. Tokens
  // are never encoded (see share.ts); `sim` carries only dependency-descriptor
  // form fields (roadmap 018).
  async function buildShareLinkAndCopy(sim?: ShareSimulator) {
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
    const shareToken = await encodeShare({
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
    });
    const url = buildShareUrl(shareToken);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be unavailable (insecure context); the URL bar still updates.
    }
    writeHash(url, shareToken);
  }

  async function onCopyLink() {
    await buildShareLinkAndCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
    setRepoLoading(true);
    setFatal(null);
    setNotice(null);
    setRepoAuthHint(null);
    try {
      const loaded = await loadRepoConfig({
        platform: repoPlatform,
        repo: parsed.repo,
        endpoint: repoEndpoint || undefined,
        ref: trimmedRef || undefined,
      });
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
      await onRun(undefined, {
        fileName: nextFileName,
        content: loaded.content,
        platform: repoPlatform,
        endpoint: repoEndpoint || endpoint,
        globalConfig: globalParse.config,
        inheritedConfig: inheritedParse.config,
        platformOverride: platformOverride && hasGlobalContext,
      });
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
        {shareWarning ? (
          <div className="share-error-banner share-warning-banner" role="alert">
            <strong className="share-error-banner-title">
              Shared link points at an untrusted host — opened without your tokens
            </strong>
            <span>{shareWarning}</span>
            <button
              type="button"
              className="share-warning-ack"
              onClick={() => setShareWarning(null)}
            >
              Got it
            </button>
          </div>
        ) : null}
        <header className="app-header">
          <h1>Renovate Config Visualizer</h1>
          {result ? (
            <span className="version-badge">Renovate v{result.renovateVersion}</span>
          ) : null}
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
            {result ? null : (
              <section className="welcome" aria-label="How it works">
                <ol className="welcome-steps">
                  <li>
                    <strong>Bring a config.</strong> Paste your <code>renovate.json</code> below,
                    load it straight from a repository, or{" "}
                    <button
                      type="button"
                      className="linklike"
                      onClick={() => loadConfigText(EXAMPLE_CONFIG)}
                    >
                      try an example
                    </button>
                    .
                  </li>
                  <li>
                    <strong>Run it.</strong> The same code the real bot uses resolves your{" "}
                    <Term id="preset">presets</Term>, applies{" "}
                    <Term id="migration">config migration</Term> and validates every option.
                  </li>
                  <li>
                    <strong>Explore the result.</strong> Step through each stage, hover any option
                    for its docs, and simulate which <Term id="packageRules">packageRules</Term>{" "}
                    would apply to a dependency update.
                  </li>
                </ol>
                <p className="welcome-footnote">
                  New to Renovate? Start with the{" "}
                  <a href="https://docs.renovatebot.com/" target="_blank" rel="noreferrer">
                    official docs ↗
                  </a>
                  . Your config and any tokens stay in this browser tab.
                </p>
              </section>
            )}

            <form
              className="repo-load"
              onSubmit={(e) => {
                e.preventDefault();
                void onLoadRepo();
              }}
            >
              <span className="repo-load-label">Load from a repository</span>
              <input
                type="text"
                className="repo-load-ref"
                placeholder="owner/repo, github.com/owner/repo, or a full repository URL"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
              />
              <input
                type="text"
                className="repo-load-branch"
                placeholder="branch or tag (optional)"
                value={repoRef}
                onChange={(e) => setRepoRef(e.target.value)}
              />
              <button type="submit" disabled={repoLoading || repoInput.trim() === ""}>
                {repoLoading ? "Loading…" : "Load"}
              </button>
            </form>

            <ConfigEditor
              key={editorKey}
              ref={configEditorRef}
              fileName={fileName}
              value={content}
              onChange={setContent}
              presetHover={presetHover}
            />
            <p className="editor-hint">
              <kbd>{MOD_KEY_LABEL}</kbd>+<kbd>Z</kbd> to undo, <kbd>Shift</kbd>+
              <kbd>{MOD_KEY_LABEL}</kbd>+<kbd>Z</kbd> to redo.
            </p>

            <div className="toolbar">
              <select
                value={fileName}
                onChange={(e) => setFileName(e.target.value as typeof fileName)}
              >
                <option value="renovate.json">renovate.json</option>
                <option value="renovate.json5">renovate.json5</option>
              </select>
              <button
                type="button"
                className="secondary"
                onClick={() => loadConfigText(loadedContent)}
                disabled={content === loadedContent}
                title="Restore the config text as it was last loaded — the default, an example, a share link, a repo fetch, or an applied fix — discarding edits made since"
              >
                Revert to loaded config
              </button>
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
                    className="gh-signin"
                    onClick={onSignIn}
                    title="Sign in to reach private GitHub presets and repositories (read-only)"
                  >
                    Sign in with GitHub
                  </button>
                )
              ) : null}
              <span className="toolbar-spacer" />
              <button
                type="button"
                className="primary"
                onClick={() => onRun(undefined, undefined, { preserveScroll: Boolean(result) })}
                disabled={running}
                title="Process this config with Renovate's own code — it never leaves your browser"
              >
                {running ? "Running…" : "Run"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void onCopyLink()}
                title="Copy a link that reopens this config and view — never includes your tokens"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            <details
              className="advanced-zone"
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
            >
              <summary>
                Advanced options
                <span className="advanced-hint">
                  {" "}
                  — repository host, access tokens, self-hosted bot config
                </span>
                {globalParse.config || inheritedParse.config ? (
                  <span className="advanced-active-chip">self-hosted config active</span>
                ) : null}
                {globalParse.error || inheritedParse.error ? (
                  <span className="advanced-active-chip invalid">invalid JSON</span>
                ) : null}
              </summary>

              <p className="advanced-intro">
                Everything here is optional — the defaults suit a repository on github.com using the
                hosted Renovate app.
              </p>

              <details className="advanced-settings">
                <summary>
                  Repository host &amp; access tokens
                  <span className="advanced-hint">
                    {" "}
                    — where presets that live in other repositories are fetched from
                  </span>
                </summary>
                <div className="advanced-body">
                  <p className="advanced-note">
                    Some presets live in other repositories on your{" "}
                    <Term id="platform">code host</Term> (referenced as{" "}
                    <Term id="localPreset">
                      <code>local&gt;</code>
                    </Term>{" "}
                    or a bare <code>owner/repo</code>). Set the host and API endpoint they should
                    resolve against.
                  </p>
                  <div className="advanced-row">
                    <label>
                      Platform
                      <select
                        value={displayPlatform}
                        onChange={(e) => onPlatformChange(e.target.value)}
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        {!PLATFORMS.includes(displayPlatform) ? (
                          <option value={displayPlatform}>{displayPlatform}</option>
                        ) : null}
                      </select>
                    </label>
                    <label className="grow">
                      Endpoint
                      <input
                        type="text"
                        placeholder={
                          PLATFORM_ENDPOINTS[displayPlatform] || "not fetched in the browser"
                        }
                        value={displayEndpoint}
                        onChange={(e) => onEndpointChange(e.target.value)}
                      />
                    </label>
                  </div>
                  {/* Roadmap 030: the "dangerous URL" rule, surfaced inline
                      (014/023 style) — the same check that gates Run in
                      `blockedByLayerErrors` and the one that keeps a bad
                      value out of storage in `onEndpointChange`. */}
                  {displayEndpoint && !isValidEndpoint(displayEndpoint) ? (
                    <p className="layer-editor-error">
                      Not a valid endpoint: must be an http(s) URL. The pipeline won&apos;t run
                      until this is fixed or the field is cleared.
                    </p>
                  ) : null}
                  {reflectGlobal ? (
                    <p className="advanced-note platform-from-global">
                      <span className="badge prov-global">from global config</span>{" "}
                      {globalPlatform !== undefined ? (
                        <>
                          platform <code>{globalPlatform}</code>
                        </>
                      ) : null}
                      {globalPlatform !== undefined && globalEndpoint !== undefined
                        ? " and "
                        : null}
                      {globalEndpoint !== undefined ? (
                        <>
                          endpoint <code>{globalEndpoint}</code>
                        </>
                      ) : null}{" "}
                      come from the pasted global config — a real Renovate run would use them.
                      Changing the control overrides them for this visualization.
                    </p>
                  ) : null}
                  {platformOverride && hasGlobalContext ? (
                    <p className="advanced-note platform-override-warning">
                      Overriding <code>platform</code>/<code>endpoint</code> from the global config
                      — a real Renovate run would use{" "}
                      <code>{globalPlatform ?? displayPlatform}</code>
                      {" / "}
                      <code>
                        {globalEndpoint ??
                          (PLATFORM_ENDPOINTS[globalPlatform ?? ""] || "the platform default")}
                      </code>
                      .{" "}
                      <button
                        type="button"
                        className="platform-override-clear"
                        onClick={() => setPlatformOverride(false)}
                      >
                        use global config values
                      </button>
                    </p>
                  ) : null}
                  {usesLocal &&
                  !(platform in PLATFORM_ENDPOINTS && PLATFORM_ENDPOINTS[platform]) ? (
                    <p className="advanced-note">
                      <code>{platform}</code> presets are not fetched in the browser — a real
                      Renovate run reaches them. You can still provide their content manually from a
                      failed node below.
                    </p>
                  ) : null}
                  {oauthConfig ? (
                    <p className="advanced-note">
                      Signing in with GitHub (top of the page) is the recommended way to reach
                      private GitHub presets and repos. A personal access token is only a fallback —
                      for GitHub Enterprise Server, when the app installation can&apos;t be
                      approved, or if the sign-in service is unavailable.
                    </p>
                  ) : (
                    <p className="advanced-note">
                      A GitHub personal access token lifts preset rate limits and reaches private
                      repositories. It stays in this browser tab only.
                    </p>
                  )}
                  <div className="advanced-row">
                    <label className="grow">
                      GitHub personal access token (fallback)
                      <input
                        type="password"
                        placeholder="optional — stays in this browser tab"
                        value={token}
                        onChange={(e) => onTokenChange(e.target.value)}
                      />
                    </label>
                    <label className="grow">
                      GitLab token (PRIVATE-TOKEN)
                      <input
                        type="password"
                        placeholder="optional — stays in this browser tab"
                        value={gitlabToken}
                        onChange={(e) =>
                          makeTokenHandler(GITLAB_TOKEN_KEY, setGitlabToken)(e.target.value)
                        }
                      />
                    </label>
                    <label className="grow">
                      Gitea token
                      <input
                        type="password"
                        placeholder="optional — stays in this browser tab"
                        value={giteaToken}
                        onChange={(e) =>
                          makeTokenHandler(GITEA_TOKEN_KEY, setGiteaToken)(e.target.value)
                        }
                      />
                    </label>
                    <label className="grow">
                      Forgejo token
                      <input
                        type="password"
                        placeholder="optional — stays in this browser tab"
                        value={forgejoToken}
                        onChange={(e) =>
                          makeTokenHandler(FORGEJO_TOKEN_KEY, setForgejoToken)(e.target.value)
                        }
                      />
                    </label>
                  </div>
                  {/* Roadmap 030: the "header injection" rule (control
                      characters, incl. CR/LF, or an unreasonable length) —
                      a token failing this was never written to storage
                      (see `makeTokenHandler`). */}
                  {(
                    [
                      ["GitHub", token],
                      ["GitLab", gitlabToken],
                      ["Gitea", giteaToken],
                      ["Forgejo", forgejoToken],
                    ] as const
                  )
                    .filter(([, value]) => value && !isValidToken(value))
                    .map(([label]) => (
                      <p className="layer-editor-error" key={label}>
                        {label} token contains characters that can&apos;t be sent in a request
                        header, or is too long — it was not saved.
                      </p>
                    ))}
                </div>
              </details>

              <details className="advanced-settings">
                <summary>
                  Global config
                  <span className="advanced-hint">
                    {" "}
                    — bot-level settings from a self-hosted administrator
                    {globalParse.config ? " · active" : ""}
                    {globalParse.error ? " · invalid JSON" : ""}
                  </span>
                </summary>
                <div className="advanced-body">
                  <p className="advanced-note">
                    Running your own Renovate bot? Paste its{" "}
                    <Term id="globalConfig">global config</Term> as JSON to model the full layer
                    stack: it merges between Renovate&apos;s defaults and your repo config, after
                    its own <code>globalExtends</code> presets. Options like <code>platform</code>,{" "}
                    <code>endpoint</code> or <code>onboarding</code> become run context instead of
                    merging. Leave empty to run without this layer.
                  </p>
                  <textarea
                    className="layer-editor"
                    placeholder='{ "globalExtends": ["config:best-practices"], "platform": "gitlab" }'
                    value={globalText}
                    onChange={(e) => setGlobalText(e.target.value)}
                    spellCheck={false}
                    rows={8}
                  />
                  {globalParse.error ? (
                    <p className="layer-editor-error">
                      Not valid JSON: {globalParse.error}. The pipeline won&apos;t run until this
                      parses or the field is cleared.
                    </p>
                  ) : null}
                </div>
              </details>

              <details className="advanced-settings">
                <summary>
                  Inherited config
                  <span className="advanced-hint">
                    {" "}
                    — org-wide defaults shared across repositories
                    {inheritedParse.config ? " · active" : ""}
                    {inheritedParse.error ? " · invalid JSON" : ""}
                  </span>
                </summary>
                <div className="advanced-body">
                  <p className="advanced-note">
                    Defaults a self-hosted bot shares across repositories via{" "}
                    <Term id="inheritedConfig">
                      <code>inheritConfig</code>
                    </Term>
                    . Validated with Renovate&apos;s inherit rules, its presets resolved, bot-only
                    options stripped — then merged between the global layer and the repo config.
                    Leave empty to run without this layer.
                  </p>
                  <textarea
                    className="layer-editor"
                    placeholder='{ "extends": ["github>my-org/renovate-config"], "automerge": false }'
                    value={inheritedText}
                    onChange={(e) => setInheritedText(e.target.value)}
                    spellCheck={false}
                    rows={8}
                  />
                  {inheritedParse.error ? (
                    <p className="layer-editor-error">
                      Not valid JSON: {inheritedParse.error}. The pipeline won&apos;t run until this
                      parses or the field is cleared.
                    </p>
                  ) : null}
                </div>
              </details>
            </details>

            {fatal ? <p style={{ color: "var(--error)" }}>{fatal}</p> : null}
            {repoAuthHint ? (
              <GithubAuthHint
                authState={authState}
                rateLimited={repoAuthHint.rateLimited}
                onSignIn={onSignIn}
                installUrl={installUrl()}
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
              <ResultsPanel
                tabs={resultsTabs}
                active={tab}
                onSelect={setTab}
                back={backTab}
                onBack={() => setTab(backTab ?? "overview")}
                panels={{
                  overview: (
                    <OverviewTab
                      digest={digest}
                      banner={validateHasErrors ? <HypotheticalBanner /> : null}
                      onOpen={jumpToTab}
                      onWhereFrom={() => {
                        jumpToTab("effective");
                        setEffectiveFilterNonce((n) => n + 1);
                      }}
                    />
                  ),
                  pipeline: (
                    <>
                      <StageTimeline
                        result={result}
                        selected={selectedStage}
                        onSelect={setSelectedStage}
                      />
                      <div className="card">
                        <div className="card-title">
                          Stage: {STAGE_LABELS[selectedStage]}
                          <span className="card-title-hint">
                            {" "}
                            — {STAGE_EXPLAINERS[selectedStage].plain}
                          </span>
                          {deferredStage !== selectedStage ? (
                            <span className="rendering-note"> rendering…</span>
                          ) : null}
                        </div>
                        {/* Roadmap 023: the presets/merge stages run on a config a real
                            Renovate run would have already rejected — say so. */}
                        {validateHasErrors &&
                        (deferredStage === "preset" || deferredStage === "merge") ? (
                          <HypotheticalBanner />
                        ) : null}
                        {/* Roadmap 028: Pipeline always shows the whole-stage diff —
                            the per-rewrite stepper is the Rewrites tab's job. */}
                        {deferredStage === "migrate" && migrateSteps.length > 0 ? (
                          <p className="stage-crosslink">
                            {migrateSteps.length} rewrite{migrateSteps.length === 1 ? "" : "s"}{" "}
                            applied ·{" "}
                            <button
                              type="button"
                              className="linklike"
                              onClick={() => jumpToTab("rewrites")}
                            >
                              step through them one by one →
                            </button>
                          </p>
                        ) : null}
                        <StageDiff result={result} stage={deferredStage} />
                      </div>
                    </>
                  ),
                  rewrites: migrateStepperMounted ? (
                    <div className="card">
                      <div className="card-title">
                        Rewrites
                        <span className="card-title-hint">
                          {" "}
                          — the deprecated options Renovate rewrote, one at a time
                        </span>
                      </div>
                      <MigrationSteps
                        steps={migrateSteps}
                        finalConfig={finalMigrated}
                        index={migrationStepIndex}
                        onIndexChange={setMigrationStepIndex}
                      />
                    </div>
                  ) : (
                    <p className="empty-note">
                      No rewrites — this config already uses current option names.
                    </p>
                  ),
                  presets: result.presetTree?.children.length ? (
                    <PresetTree
                      result={result}
                      onInject={onInject}
                      selectedId={selectedNodeId}
                      onSelectNode={setSelectedNodeId}
                      authState={authState}
                      onSignIn={onSignIn}
                      installUrl={installUrl()}
                    />
                  ) : (
                    <p className="empty-note">
                      No presets — this config has no <code>extends</code> entries to resolve.
                    </p>
                  ),
                  effective: result.finalConfig ? (
                    <>
                      {validateHasErrors ? <HypotheticalBanner /> : null}
                      <EffectiveConfig
                        result={result}
                        onSelectPreset={selectPresetNode}
                        onStats={setEffectiveStats}
                        focusFilterNonce={effectiveFilterNonce}
                      />
                    </>
                  ) : (
                    <p className="empty-note">
                      No effective config — the pipeline did not get far enough to merge one.
                    </p>
                  ),
                  simulator: result.finalConfig ? (
                    <RuleSimulator
                      result={result}
                      onSelectPreset={selectPresetNode}
                      onJumpToEditor={focusEditorRepoIndex}
                      focusRuleIndex={pendingRuleFocus}
                      onRuleFocused={() => setPendingRuleFocus(null)}
                      errorLib={errorLib}
                      simRequest={simRequest}
                      onCopySimLink={buildShareLinkAndCopy}
                      configInvalid={validateHasErrors}
                    />
                  ) : (
                    <p className="empty-note">
                      Nothing to simulate — the pipeline produced no effective config.
                    </p>
                  ),
                  problems:
                    errorCount + warningCount > 0 ? (
                      <MessagesPanel
                        result={result}
                        ruleAttribution={ruleProvenance}
                        onJumpToEditor={focusEditorRepoIndex}
                        onJumpToSimRule={(index) => {
                          setPendingRuleFocus(index);
                          jumpToTab("simulator");
                        }}
                        errorLib={errorLib}
                        onApplyFix={applyErrorFix}
                      />
                    ) : (
                      <p className="empty-note">
                        No errors or warnings — Renovate accepted every option in this config.
                      </p>
                    ),
                }}
              />
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
