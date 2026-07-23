import type { OptionIndex, PipelineInput, TraceResult } from "@renovate-config-visualizer/engine";

const TOKEN_KEYS = {
  githubToken: "rcv.githubToken",
  gitlabToken: "rcv.gitlabToken",
  giteaToken: "rcv.giteaToken",
  forgejoToken: "rcv.forgejoToken",
} as const;

/**
 * Dynamic import keeps the heavy renovate chunk out of the initial page load;
 * Vite code-splits it automatically behind this call.
 */
export async function run(input: PipelineInput): Promise<TraceResult> {
  const engine = await import("@renovate-config-visualizer/engine");
  engine.setPresetAuth({
    githubToken: localStorage.getItem(TOKEN_KEYS.githubToken) ?? undefined,
    gitlabToken: localStorage.getItem(TOKEN_KEYS.gitlabToken) ?? undefined,
    giteaToken: localStorage.getItem(TOKEN_KEYS.giteaToken) ?? undefined,
    forgejoToken: localStorage.getItem(TOKEN_KEYS.forgejoToken) ?? undefined,
  });
  return engine.runPipeline(input);
}

/** Option metadata for hover docs; cheap once the engine chunk is loaded. */
export async function loadOptionIndex(): Promise<OptionIndex> {
  const engine = await import("@renovate-config-visualizer/engine");
  return engine.getOptionIndex();
}
