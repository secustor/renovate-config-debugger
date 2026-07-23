import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  OptionIndex,
  RepoPlatform,
  StageId,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { ConfigEditor } from "./components/ConfigEditor";
import { EffectiveConfig } from "./components/EffectiveConfig";
import { type AuthState, GithubAuthHint } from "./components/GithubAuthHint";
import { MessagesPanel } from "./components/MessagesPanel";
import { MigrationSteps } from "./components/MigrationSteps";
import { identityForNodeId, nodeIdForIdentity, PresetTree } from "./components/PresetTree";
import { RuleSimulator } from "./components/RuleSimulator";
import { StageDiff } from "./components/StageDiff";
import { STAGE_EXPLAINERS, STAGE_LABELS, StageTimeline } from "./components/StageTimeline";
import { Term } from "./glossary";
import { OptionDocsProvider } from "./option-docs";
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
import { getRenovateVersion, loadOptionIndex, loadRepoConfig, run } from "./run";
import {
  buildShareUrl,
  decodeShare,
  encodeShare,
  readShareToken,
  type ShareFileName,
  type ShareView,
} from "./share";

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

/** Platforms that resolve `local>` in the browser, with their default endpoint. */
const PLATFORM_ENDPOINTS: Record<string, string> = {
  github: "https://api.github.com",
  gitlab: "https://gitlab.com/api/v4",
  gitea: "https://gitea.com",
  forgejo: "https://codeberg.org",
  azure: "",
  bitbucket: "",
  "bitbucket-server": "",
  gerrit: "",
  codecommit: "",
  "scm-manager": "",
};

const PLATFORMS = Object.keys(PLATFORM_ENDPOINTS);

/** Platforms whose repos can be fetched from the browser (roadmap 007/010). */
const FETCHABLE_PLATFORMS = new Set<RepoPlatform>(["github", "gitlab", "gitea", "forgejo"]);

/** Known public hosts → the platform that serves their repos. */
const HOST_PLATFORM: Record<string, RepoPlatform> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "gitea.com": "gitea",
  "codeberg.org": "forgejo",
};

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

interface LayerParse {
  config?: Record<string, unknown>;
  error?: string;
}

/** Parses an optional JSON config layer (008). Empty text = layer off. */
function parseLayerText(text: string): LayerParse {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { error: "must be a JSON object" };
    }
    return { config: parsed as Record<string, unknown> };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Non-secret settings (platform/endpoint) persist across tabs → localStorage. */
function readLocal(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback;
}

function persistLocal(key: string, value: string): void {
  if (value) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
}

/** Per-host tokens are secrets → sessionStorage (cleared when the tab closes). */
function readSession(key: string, fallback: string): string {
  return sessionStorage.getItem(key) ?? fallback;
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

export function App() {
  const [content, setContent] = useState(DEFAULT_CONFIG);
  const [fileName, setFileName] = useState<"renovate.json" | "renovate.json5">("renovate.json");
  const [token, setToken] = useState(() => readSession(TOKEN_KEY, ""));
  const [gitlabToken, setGitlabToken] = useState(() => readSession(GITLAB_TOKEN_KEY, ""));
  const [giteaToken, setGiteaToken] = useState(() => readSession(GITEA_TOKEN_KEY, ""));
  const [forgejoToken, setForgejoToken] = useState(() => readSession(FORGEJO_TOKEN_KEY, ""));
  const [platform, setPlatform] = useState(() => readLocal(PLATFORM_KEY, "github"));
  const [endpoint, setEndpoint] = useState(() => readLocal(ENDPOINT_KEY, "https://api.github.com"));
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
  // Non-fatal notices (version drift, load-from-repo results, bad share link).
  const [notice, setNotice] = useState<string | null>(null);
  const [optionIndex, setOptionIndex] = useState<OptionIndex | null>(null);
  // Preset-tree selection is owned here so a provenance chain (005) can select
  // a preset node in the tree. Node ids restart every run, so reset on result.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Migration stepper index, owned here so a shareable link (007) can restore
  // the step; reset to 0 on a new result just like the uncontrolled stepper.
  const [migrationStepIndex, setMigrationStepIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  // View state pending from a decoded link, applied once the run produces a
  // result (identities → node ids need the resolved tree). A ref, not state, so
  // consuming it does not trigger a render.
  const pendingViewRef = useRef<ShareView | null>(null);
  // Load-from-repo form.
  const [repoInput, setRepoInput] = useState("");
  const [repoRef, setRepoRef] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  // When a GitHub load fails with a not-found/auth/rate-limit error, offer the
  // sign-in / install hint next to the failure (009). null = no hint.
  const [repoAuthHint, setRepoAuthHint] = useState<{ rateLimited: boolean } | null>(null);

  useEffect(() => {
    setSelectedNodeId(null);
    setMigrationStepIndex(0);
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
  }, [result]);

  // An unparseable 008 layer never silently runs without it — block instead.
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
    return false;
  }

  async function onRun(overrideInjected?: InjectionMap, overrideInputs?: RunInputs) {
    const injectedPresets = overrideInjected ?? injected;
    if (!overrideInputs && blockedByLayerErrors()) {
      return;
    }
    const inputs: RunInputs = overrideInputs ?? {
      fileName,
      content,
      platform,
      endpoint,
      globalConfig: globalParse.config,
      inheritedConfig: inheritedParse.config,
      platformOverride: platformOverride && hasGlobalContext,
    };
    setRunning(true);
    setFatal(null);
    try {
      const traceResult = await run({ ...inputs, injectedPresets });
      setResult(traceResult);
      const firstError = (Object.entries(traceResult.stageStatus) as [StageId, string][]).find(
        ([, status]) => status === "error",
      );
      setSelectedStage(firstError?.[0] ?? "preset");
      // the engine chunk is loaded now — hydrate the hover docs
      void loadOptionIndex().then(setOptionIndex);
    } catch (err) {
      setFatal(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    } finally {
      setRunning(false);
    }
  }

  // On mount: first complete an OAuth callback if the URL carries one (QUERY
  // params ?code&state), then — reading the possibly-restored fragment — decode
  // a shared config, populate state and auto-run. OAuth runs before the share
  // decode so a share link survives a sign-in round-trip. Runs once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 1. OAuth callback (009): validate state, exchange via the Worker, store
      // the token, then strip the query and restore the pre-sign-in fragment.
      const callback = oauthConfig ? readCallbackParams(window.location.search) : null;
      if (callback) {
        try {
          const { user, returnHash } = await completeCallback(callback.code, callback.state);
          if (cancelled) {
            return;
          }
          setSignedIn(true);
          setAuthUser(user);
          history.replaceState(null, "", window.location.pathname + returnHash);
        } catch (err) {
          if (cancelled) {
            return;
          }
          setNotice(
            `GitHub sign-in failed: ${err instanceof Error ? err.message : String(err)}. You can still use the app signed out.`,
          );
          history.replaceState(null, "", window.location.pathname);
          return;
        }
      }

      // 2. Shared config (007) from the URL fragment (survives the OAuth strip).
      const shareToken = readShareToken(window.location.hash);
      if (!shareToken) {
        return;
      }
      const payload = await decodeShare(shareToken);
      if (cancelled) {
        return;
      }
      if (!payload) {
        setNotice("This shared link could not be read; showing the default config instead.");
        history.replaceState(null, "", window.location.pathname + window.location.search);
        return;
      }
      const nextPlatform = payload.platform ?? "github";
      const nextEndpoint = payload.endpoint ?? "https://api.github.com";
      setContent(payload.config);
      setFileName(payload.fileName);
      setPlatform(nextPlatform);
      persistLocal(PLATFORM_KEY, nextPlatform);
      setEndpoint(nextEndpoint);
      persistLocal(ENDPOINT_KEY, nextEndpoint);
      // 008 layers ride along in v2 links; absent = layers off.
      setGlobalText(payload.globalConfig ? JSON.stringify(payload.globalConfig, null, 2) : "");
      setInheritedText(
        payload.inheritedConfig ? JSON.stringify(payload.inheritedConfig, null, 2) : "",
      );
      setPlatformOverride(payload.platformOverride === true);
      if (payload.globalConfig || payload.inheritedConfig) {
        setAdvancedOpen(true);
      }
      pendingViewRef.current = payload.view ?? null;
      const current = await getRenovateVersion();
      if (!cancelled && payload.renovate && payload.renovate !== current) {
        setNotice(
          `This link was created with Renovate v${payload.renovate}; you're on v${current} — results may differ.`,
        );
      }
      if (!cancelled) {
        void onRun(undefined, {
          fileName: payload.fileName,
          content: payload.config,
          platform: nextPlatform,
          endpoint: nextEndpoint,
          globalConfig: payload.globalConfig,
          inheritedConfig: payload.inheritedConfig,
          platformOverride: payload.platformOverride === true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function makeTokenHandler(key: string, setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      persistSession(key, value);
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
    persistLocal(PLATFORM_KEY, value);
    // Snap the endpoint to the new platform's default; the user can still edit.
    const next = PLATFORM_ENDPOINTS[value] ?? "";
    setEndpoint(next);
    persistLocal(ENDPOINT_KEY, next);
  }

  function onEndpointChange(value: string) {
    if (hasGlobalContext) {
      setPlatformOverride(true);
    }
    setEndpoint(value);
    persistLocal(ENDPOINT_KEY, value);
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
    void onRun(next);
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

  const migrateStepperMounted = deferredStage === "migrate" && migrateSteps.length > 0;

  // Encodes the CURRENT state (config + view) into a link and copies it. Never
  // continuously syncs the hash (huge configs would thrash the URL) — on demand
  // only. Also mirrors the copied link into the address bar.
  async function onCopyLink() {
    const renovate = result?.renovateVersion ?? (await getRenovateVersion());
    const view: ShareView = { stage: selectedStage };
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
    });
    const url = buildShareUrl(shareToken);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be unavailable (insecure context); the URL bar still updates.
    }
    history.replaceState(null, "", url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Fetches a repo's Renovate config file and runs it. Derives the platform
  // from a known host (and sets the platform context so a later run resolves
  // `local>` correctly); a bare slug uses the current platform context.
  async function onLoadRepo() {
    const parsed = parseRepoRef(repoInput);
    if (!parsed) {
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
        ref: repoRef.trim() || undefined,
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
      setContent(loaded.content);
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

        {result ? null : (
          <section className="welcome" aria-label="How it works">
            <ol className="welcome-steps">
              <li>
                <strong>Bring a config.</strong> Paste your <code>renovate.json</code> below, load
                it straight from a repository, or{" "}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => setContent(EXAMPLE_CONFIG)}
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
                <strong>Explore the result.</strong> Step through each stage, hover any option for
                its docs, and simulate which <Term id="packageRules">packageRules</Term> would apply
                to a dependency update.
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

        <ConfigEditor fileName={fileName} value={content} onChange={setContent} />

        <div className="toolbar">
          <select value={fileName} onChange={(e) => setFileName(e.target.value as typeof fileName)}>
            <option value="renovate.json">renovate.json</option>
            <option value="renovate.json5">renovate.json5</option>
          </select>
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
            onClick={() => onRun()}
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
                Some presets live in other repositories on your <Term id="platform">
                  code host
                </Term>{" "}
                (referenced as{" "}
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
              {reflectGlobal ? (
                <p className="advanced-note platform-from-global">
                  <span className="badge prov-global">from global config</span>{" "}
                  {globalPlatform !== undefined ? (
                    <>
                      platform <code>{globalPlatform}</code>
                    </>
                  ) : null}
                  {globalPlatform !== undefined && globalEndpoint !== undefined ? " and " : null}
                  {globalEndpoint !== undefined ? (
                    <>
                      endpoint <code>{globalEndpoint}</code>
                    </>
                  ) : null}{" "}
                  come from the pasted global config — a real Renovate run would use them. Changing
                  the control overrides them for this visualization.
                </p>
              ) : null}
              {platformOverride && hasGlobalContext ? (
                <p className="advanced-note platform-override-warning">
                  Overriding <code>platform</code>/<code>endpoint</code> from the global config — a
                  real Renovate run would use <code>{globalPlatform ?? displayPlatform}</code>
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
              {usesLocal && !(platform in PLATFORM_ENDPOINTS && PLATFORM_ENDPOINTS[platform]) ? (
                <p className="advanced-note">
                  <code>{platform}</code> presets are not fetched in the browser — a real Renovate
                  run reaches them. You can still provide their content manually from a failed node
                  below.
                </p>
              ) : null}
              {oauthConfig ? (
                <p className="advanced-note">
                  Signing in with GitHub (top of the page) is the recommended way to reach private
                  GitHub presets and repos. A personal access token is only a fallback — for GitHub
                  Enterprise Server, when the app installation can&apos;t be approved, or if the
                  sign-in service is unavailable.
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
                <Term id="globalConfig">global config</Term> as JSON to model the full layer stack:
                it merges between Renovate&apos;s defaults and your repo config, after its own{" "}
                <code>globalExtends</code> presets. Options like <code>platform</code>,{" "}
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
                  Not valid JSON: {globalParse.error}. The pipeline won&apos;t run until this parses
                  or the field is cleared.
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
                options stripped — then merged between the global layer and the repo config. Leave
                empty to run without this layer.
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
            <button type="button" className="app-notice-dismiss" onClick={() => setNotice(null)}>
              dismiss
            </button>
          </p>
        ) : null}

        {result ? (
          <>
            <StageTimeline result={result} selected={selectedStage} onSelect={setSelectedStage} />
            <div className="card">
              <div className="card-title">
                Stage: {STAGE_LABELS[selectedStage]}
                <span className="card-title-hint"> — {STAGE_EXPLAINERS[selectedStage].plain}</span>
                {deferredStage !== selectedStage ? (
                  <span className="rendering-note"> rendering…</span>
                ) : null}
              </div>
              {migrateStepperMounted ? (
                <MigrationSteps
                  steps={migrateSteps}
                  finalConfig={finalMigrated}
                  index={migrationStepIndex}
                  onIndexChange={setMigrationStepIndex}
                />
              ) : (
                <StageDiff result={result} stage={deferredStage} />
              )}
            </div>
            <MessagesPanel result={result} />
            <PresetTree
              result={result}
              onInject={onInject}
              selectedId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              authState={authState}
              onSignIn={onSignIn}
              installUrl={installUrl()}
            />
            <EffectiveConfig result={result} onSelectPreset={setSelectedNodeId} />
            <RuleSimulator result={result} />
          </>
        ) : null}
      </main>
    </OptionDocsProvider>
  );
}
