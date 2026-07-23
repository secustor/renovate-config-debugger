import type {
  OptionIndex,
  PipelineInput,
  RepoConfigRequest,
  RepoConfigResult,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { getValidToken } from "./oauth";

// Per-host PATs now live in sessionStorage (roadmap 009/010 storage rules):
// they are secrets, so they follow the OAuth token and clear when the tab
// closes. Platform/endpoint (non-secrets) stay in localStorage — see App.tsx.
const TOKEN_KEYS = {
  githubToken: "rcv.githubToken",
  gitlabToken: "rcv.gitlabToken",
  giteaToken: "rcv.giteaToken",
  forgejoToken: "rcv.forgejoToken",
} as const;

type Engine = typeof import("@renovate-config-visualizer/engine");

/**
 * Pushes the per-host tokens into the engine's preset auth. Shared by every
 * entry point that fetches (pipeline runs AND repo-config loads) so both reach
 * private repos / lift rate limits identically. A GitHub OAuth token (009),
 * silently refreshed when needed, wins over the GitHub PAT fallback.
 */
async function ensureAuth(engine: Engine): Promise<void> {
  const oauthToken = await getValidToken();
  engine.setPresetAuth({
    githubToken: oauthToken ?? sessionStorage.getItem(TOKEN_KEYS.githubToken) ?? undefined,
    gitlabToken: sessionStorage.getItem(TOKEN_KEYS.gitlabToken) ?? undefined,
    giteaToken: sessionStorage.getItem(TOKEN_KEYS.giteaToken) ?? undefined,
    forgejoToken: sessionStorage.getItem(TOKEN_KEYS.forgejoToken) ?? undefined,
  });
}

/**
 * Dynamic import keeps the heavy renovate chunk out of the initial page load;
 * Vite code-splits it automatically behind this call.
 */
export async function run(input: PipelineInput): Promise<TraceResult> {
  const engine = await import("@renovate-config-visualizer/engine");
  await ensureAuth(engine);
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
  await ensureAuth(engine);
  return engine.fetchRepoConfig(req);
}
