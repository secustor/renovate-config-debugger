import { useDeferredValue, useState } from "react";
import type { OptionIndex, StageId, TraceResult } from "@renovate-config-visualizer/engine";
import { ConfigEditor } from "./components/ConfigEditor";
import { EffectiveConfig } from "./components/EffectiveConfig";
import { MessagesPanel } from "./components/MessagesPanel";
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

export function App() {
  const [content, setContent] = useState(DEFAULT_CONFIG);
  const [fileName, setFileName] = useState<"renovate.json" | "renovate.json5">("renovate.json");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageId>("preset");
  // Large stage diffs (preset, merge) take a while to render; deferring the
  // stage keeps chip clicks responsive and makes the diff render
  // interruptible instead of blocking the main thread.
  const deferredStage = useDeferredValue(selectedStage);
  const [fatal, setFatal] = useState<string | null>(null);
  const [optionIndex, setOptionIndex] = useState<OptionIndex | null>(null);

  async function onRun() {
    setRunning(true);
    setFatal(null);
    try {
      const traceResult = await run({ fileName, content });
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

  function onTokenChange(value: string) {
    setToken(value);
    if (value) {
      localStorage.setItem(TOKEN_KEY, value);
    } else {
      localStorage.removeItem(TOKEN_KEY);
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
          <button type="button" className="primary" onClick={onRun} disabled={running}>
            {running ? "Running…" : "Run pipeline"}
          </button>
        </div>

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
              <StageDiff result={result} stage={deferredStage} />
            </div>
            <MessagesPanel result={result} />
            <PresetTree result={result} />
            <EffectiveConfig result={result} />
          </>
        ) : null}
      </main>
    </OptionDocsProvider>
  );
}
