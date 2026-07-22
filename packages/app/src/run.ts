import type { PipelineInput, TraceResult } from "@renovate-config-visualizer/engine";

/**
 * Dynamic import keeps the heavy renovate chunk out of the initial page load;
 * Vite code-splits it automatically behind this call.
 */
export async function run(input: PipelineInput): Promise<TraceResult> {
  const engine = await import("@renovate-config-visualizer/engine");
  const token = localStorage.getItem("rcv.githubToken");
  engine.setPresetAuth({ githubToken: token ?? undefined });
  return engine.runPipeline(input);
}
