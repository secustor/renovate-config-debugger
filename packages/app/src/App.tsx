import { useDeferredValue, useMemo, useState } from "react";
import type { OptionIndex, StageId, TraceResult } from "@renovate-config-visualizer/engine";
import { ConfigEditor } from "./components/ConfigEditor";
import { EffectiveConfig } from "./components/EffectiveConfig";
import { MessagesPanel } from "./components/MessagesPanel";
import { MigrationSteps } from "./components/MigrationSteps";
import { PresetTree } from "./components/PresetTree";
import { StageDiff } from "./components/StageDiff";
import { StageTimeline } from "./components/StageTimeline";
import { OptionDocsProvider } from "./option-docs";
import { loadOptionIndex, run } from "./run";

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

type InjectionMap = Record<string, Record<string, unknown>>;

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
  const [optionIndex, setOptionIndex] = useState<OptionIndex | null>(null);

  async function onRun(overrideInjected?: InjectionMap) {
    const injectedPresets = overrideInjected ?? injected;
    setRunning(true);
    setFatal(null);
    try {
      const traceResult = await run({ fileName, content, platform, endpoint, injectedPresets });
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
              {deferredStage === "migrate" && migrateSteps.length > 0 ? (
                <MigrationSteps steps={migrateSteps} finalConfig={finalMigrated} />
              ) : (
                <StageDiff result={result} stage={deferredStage} />
              )}
            </div>
            <MessagesPanel result={result} />
            <PresetTree result={result} onInject={onInject} />
            <EffectiveConfig result={result} />
          </>
        ) : null}
      </main>
    </OptionDocsProvider>
  );
}
