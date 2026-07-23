import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  OptionIndex,
  RepoPlatform,
  StageId,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { ConfigEditor } from "./components/ConfigEditor";
import { EffectiveConfig } from "./components/EffectiveConfig";
import { MessagesPanel } from "./components/MessagesPanel";
import { MigrationSteps } from "./components/MigrationSteps";
import { identityForNodeId, nodeIdForIdentity, PresetTree } from "./components/PresetTree";
import { StageDiff } from "./components/StageDiff";
import { StageTimeline } from "./components/StageTimeline";
import { OptionDocsProvider } from "./option-docs";
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
}

function readStored(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback;
}

function persist(key: string, value: string): void {
  if (value) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
}

export function App() {
  const [content, setContent] = useState(DEFAULT_CONFIG);
  const [fileName, setFileName] = useState<"renovate.json" | "renovate.json5">("renovate.json");
  const [token, setToken] = useState(() => readStored(TOKEN_KEY, ""));
  const [gitlabToken, setGitlabToken] = useState(() => readStored(GITLAB_TOKEN_KEY, ""));
  const [giteaToken, setGiteaToken] = useState(() => readStored(GITEA_TOKEN_KEY, ""));
  const [forgejoToken, setForgejoToken] = useState(() => readStored(FORGEJO_TOKEN_KEY, ""));
  const [platform, setPlatform] = useState(() => readStored(PLATFORM_KEY, "github"));
  const [endpoint, setEndpoint] = useState(() =>
    readStored(ENDPOINT_KEY, "https://api.github.com"),
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

  useEffect(() => {
    setSelectedNodeId(null);
    setMigrationStepIndex(0);
  }, [result]);

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

  async function onRun(overrideInjected?: InjectionMap, overrideInputs?: RunInputs) {
    const injectedPresets = overrideInjected ?? injected;
    const inputs: RunInputs = overrideInputs ?? { fileName, content, platform, endpoint };
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

  // On mount: if the URL carries a shared config, decode it, populate state and
  // auto-run so the link opens the same analysis. Runs once.
  useEffect(() => {
    const shareToken = readShareToken(window.location.hash);
    if (!shareToken) {
      return;
    }
    let cancelled = false;
    void (async () => {
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
      persist(PLATFORM_KEY, nextPlatform);
      setEndpoint(nextEndpoint);
      persist(ENDPOINT_KEY, nextEndpoint);
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
      persist(key, value);
    };
  }
  const onTokenChange = makeTokenHandler(TOKEN_KEY, setToken);

  function onPlatformChange(value: string) {
    setPlatform(value);
    persist(PLATFORM_KEY, value);
    // Snap the endpoint to the new platform's default; the user can still edit.
    const next = PLATFORM_ENDPOINTS[value] ?? "";
    setEndpoint(next);
    persist(ENDPOINT_KEY, next);
  }

  function onEndpointChange(value: string) {
    setEndpoint(value);
    persist(ENDPOINT_KEY, value);
  }

  function onInject(key: string, contentObj: Record<string, unknown>) {
    const next = { ...injected, [key]: contentObj };
    setInjected(next);
    void onRun(next);
  }

  const usesLocal = platform !== "github";

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
        `Unknown host ${parsed.host}. Set the platform and endpoint in "Platform context" below, then load with the owner/repo form.`,
      );
      return;
    }
    if (knownHost) {
      repoPlatform = knownHost;
      repoEndpoint = PLATFORM_ENDPOINTS[knownHost] ?? "";
    } else {
      if (!FETCHABLE_PLATFORMS.has(platform as RepoPlatform)) {
        setNotice(
          `The current platform context (${platform}) can't be fetched from the browser. Choose github, gitlab, gitea or forgejo in "Platform context", or use a full URL.`,
        );
        return;
      }
      repoPlatform = platform as RepoPlatform;
      repoEndpoint = endpoint;
    }

    setRepoLoading(true);
    setFatal(null);
    setNotice(null);
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
        persist(PLATFORM_KEY, repoPlatform);
        setEndpoint(repoEndpoint);
        persist(ENDPOINT_KEY, repoEndpoint);
      }
      setContent(loaded.content);
      setFileName(nextFileName);
      setNotice(`Loaded ${loaded.fileName} from ${parsed.repo}`);
      await onRun(undefined, {
        fileName: nextFileName,
        content: loaded.content,
        platform: repoPlatform,
        endpoint: repoEndpoint || endpoint,
      });
    } catch (err) {
      const e = err as { name?: string; probed?: string[]; err?: { message?: string } };
      if (e?.name === "RepoConfigNotFoundError") {
        const count = e.probed?.length ?? 0;
        setFatal(
          `No Renovate config found in ${parsed.repo} (tried ${count} locations). It may keep its config elsewhere, on a non-default branch, or in a private repo needing a token.`,
        );
      } else {
        const detail = e?.err?.message ?? (err instanceof Error ? err.message : String(err));
        setFatal(
          `Could not load from ${repoEndpoint || "the default endpoint"}: ${detail}. For a private repo add a token below; some hosts block browser (CORS) requests entirely.`,
        );
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
          Paste a repo config and step through what Renovate actually does with it — parsing,
          migration, massaging, validation, preset resolution and merging, powered by
          Renovate&apos;s own code running in your browser.
        </p>

        <ConfigEditor fileName={fileName} value={content} onChange={setContent} />

        <form
          className="repo-load"
          onSubmit={(e) => {
            e.preventDefault();
            void onLoadRepo();
          }}
        >
          <input
            type="text"
            className="repo-load-ref"
            placeholder="Load from repo — owner/repo, github.com/owner/repo, or a full URL"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
          />
          <input
            type="text"
            className="repo-load-branch"
            placeholder="ref (default branch)"
            value={repoRef}
            onChange={(e) => setRepoRef(e.target.value)}
          />
          <button type="submit" disabled={repoLoading || repoInput.trim() === ""}>
            {repoLoading ? "Loading…" : "Load"}
          </button>
        </form>

        <div className="toolbar">
          <select value={fileName} onChange={(e) => setFileName(e.target.value as typeof fileName)}>
            <option value="renovate.json">renovate.json</option>
            <option value="renovate.json5">renovate.json5</option>
          </select>
          <input
            type="password"
            placeholder="GitHub token (optional, for preset rate limits) — stays in your browser"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
          />
          <button type="button" className="primary" onClick={() => onRun()} disabled={running}>
            {running ? "Running…" : "Run pipeline"}
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

        <details className="advanced-settings">
          <summary>
            Platform context &amp; per-host tokens
            <span className="advanced-hint">
              {" "}
              — defines `local&gt;` and bare `owner/repo` presets
            </span>
          </summary>
          <div className="advanced-body">
            <div className="advanced-row">
              <label>
                Platform
                <select value={platform} onChange={(e) => onPlatformChange(e.target.value)}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grow">
                Endpoint
                <input
                  type="text"
                  placeholder={PLATFORM_ENDPOINTS[platform] || "not fetched in the browser"}
                  value={endpoint}
                  onChange={(e) => onEndpointChange(e.target.value)}
                />
              </label>
            </div>
            {usesLocal && !(platform in PLATFORM_ENDPOINTS && PLATFORM_ENDPOINTS[platform]) ? (
              <p className="advanced-note">
                <code>{platform}</code> presets are not fetched in the browser — a real Renovate run
                reaches them. You can still provide their content manually from a failed node below.
              </p>
            ) : null}
            <div className="advanced-row">
              <label className="grow">
                GitLab token (PRIVATE-TOKEN)
                <input
                  type="password"
                  placeholder="optional — stays in your browser"
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
                  placeholder="optional — stays in your browser"
                  value={giteaToken}
                  onChange={(e) => makeTokenHandler(GITEA_TOKEN_KEY, setGiteaToken)(e.target.value)}
                />
              </label>
              <label className="grow">
                Forgejo token
                <input
                  type="password"
                  placeholder="optional — stays in your browser"
                  value={forgejoToken}
                  onChange={(e) =>
                    makeTokenHandler(FORGEJO_TOKEN_KEY, setForgejoToken)(e.target.value)
                  }
                />
              </label>
            </div>
          </div>
        </details>

        {fatal ? <p style={{ color: "var(--error)" }}>{fatal}</p> : null}
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
                Stage: {selectedStage}
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
            />
            <EffectiveConfig result={result} onSelectPreset={setSelectedNodeId} />
          </>
        ) : null}
      </main>
    </OptionDocsProvider>
  );
}
