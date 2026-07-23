import type {
  OptionIndex,
  PipelineInput,
  RepoConfigRequest,
  RepoConfigResult,
  TraceResult,
} from "@renovate-config-visualizer/engine";

const TOKEN_KEYS = {
  githubToken: "rcv.githubToken",
  gitlabToken: "rcv.gitlabToken",
  giteaToken: "rcv.giteaToken",
  forgejoToken: "rcv.forgejoToken",
} as const;

type Engine = typeof import("@renovate-config-visualizer/engine");

/**
 * Pushes the per-host tokens from localStorage into the engine's preset auth.
 * Shared by every entry point that fetches (pipeline runs AND repo-config
 * loads) so both reach private repos / lift rate limits identically.
 */
function ensureAuth(engine: Engine): void {
  engine.setPresetAuth({
    githubToken: localStorage.getItem(TOKEN_KEYS.githubToken) ?? undefined,
    gitlabToken: localStorage.getItem(TOKEN_KEYS.gitlabToken) ?? undefined,
    giteaToken: localStorage.getItem(TOKEN_KEYS.giteaToken) ?? undefined,
    forgejoToken: localStorage.getItem(TOKEN_KEYS.forgejoToken) ?? undefined,
  });
}

/**
 * Dynamic import keeps the heavy renovate chunk out of the initial page load;
 * Vite code-splits it automatically behind this call.
 */
export async function run(input: PipelineInput): Promise<TraceResult> {
  const engine = await import("@renovate-config-visualizer/engine");
  ensureAuth(engine);
  return engine.runPipeline(input);
}

/** Option metadata for hover docs; cheap once the engine chunk is loaded. */
export async function loadOptionIndex(): Promise<OptionIndex> {
  const engine = await import("@renovate-config-visualizer/engine");
  return engine.getOptionIndex();
}

/** The bundled Renovate version — for the shareable-link version-drift check. */
export async function getRenovateVersion(): Promise<string> {
  const engine = await import("@renovate-config-visualizer/engine");
  return engine.renovateVersion;
}

/** Probes a repository for its Renovate config file (roadmap 007). */
export async function loadRepoConfig(req: RepoConfigRequest): Promise<RepoConfigResult> {
  const engine = await import("@renovate-config-visualizer/engine");
  ensureAuth(engine);
  return engine.fetchRepoConfig(req);
}
