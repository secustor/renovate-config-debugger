import type {
  AppliedTextFix,
  ErrorFixResult,
  OptionDoc,
  OptionIndex,
  PipelineInput,
  RepoConfigRequest,
  RepoConfigResult,
  TraceResult,
  TranslatedMessage,
  ValidationMessage,
} from "@renovate-config-visualizer/engine";
import { isValidToken } from "./input-schemas";
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

/** Roadmap 030: the "header injection" rule applied at the last possible
 *  moment — right before a token is handed to the engine to place into a
 *  request header. `makeTokenHandler` (App.tsx) already keeps a bad value out
 *  of sessionStorage, but this is the actual use-time boundary, so it's
 *  checked again rather than trusted transitively (storage can still drift
 *  or be hand-edited between the write and this read). */
function sessionToken(key: string): string | undefined {
  const value = sessionStorage.getItem(key);
  return value !== null && isValidToken(value) ? value : undefined;
}

export interface RunOptions {
  /**
   * Security 2026-07-25: run with NO credentials at all. Set for a run the
   * user did not aim themselves — a share link pointing at an endpoint that
   * is not one of the shipped public hosts (see `decideShareRunPolicy`) —
   * so an attacker-chosen host can never receive the user's OAuth token or
   * PATs. Expressed as an option on the run path rather than by mutating
   * token storage: the engine's preset auth is module-level state, so the
   * suppression has to be an explicit overwrite scoped to this one run.
   */
  suppressTokens?: boolean;
}

/**
 * Pushes the per-host tokens into the engine's preset auth. Shared by every
 * entry point that fetches (pipeline runs AND repo-config loads) so both reach
 * private repos / lift rate limits identically. A GitHub OAuth token (009),
 * silently refreshed when needed, wins over the GitHub PAT fallback.
 */
async function ensureAuth(engine: Engine, opts?: RunOptions): Promise<void> {
  if (opts?.suppressTokens) {
    // Overwrite (never just skip): `setPresetAuth` replaces module state a
    // PREVIOUS run may have populated, so this is what actually guarantees no
    // token is attached to this run's fetches.
    engine.setPresetAuth({});
    return;
  }
  const oauthToken = await getValidToken();
  engine.setPresetAuth({
    githubToken: oauthToken ?? sessionToken(TOKEN_KEYS.githubToken),
    gitlabToken: sessionToken(TOKEN_KEYS.gitlabToken),
    giteaToken: sessionToken(TOKEN_KEYS.giteaToken),
    forgejoToken: sessionToken(TOKEN_KEYS.forgejoToken),
  });
}

/**
 * Dynamic import keeps the heavy renovate chunk out of the initial page load;
 * Vite code-splits it automatically behind this call.
 */
export async function run(input: PipelineInput, opts?: RunOptions): Promise<TraceResult> {
  const engine = await import("@renovate-config-visualizer/engine");
  await ensureAuth(engine, opts);
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

/**
 * Roadmap 014's curated error-translation library, loaded the same lazy way
 * as the option index (they live in the same heavy engine chunk, already in
 * memory by the time a validation message is on screen — a run has to
 * complete first). Functions, not data, so callers keep calling them
 * per-message instead of the app re-implementing a lookup.
 */
export interface ErrorTranslationLib {
  translateMessage: (
    message: ValidationMessage,
    config: Record<string, unknown> | null,
  ) => TranslatedMessage | null;
  findMentionedOption: (message: ValidationMessage) => OptionDoc | undefined;
  applyFixToText: (text: string, fix: ErrorFixResult) => AppliedTextFix | null;
}

export async function loadErrorTranslationLib(): Promise<ErrorTranslationLib> {
  const engine = await import("@renovate-config-visualizer/engine");
  return {
    translateMessage: engine.translateMessage,
    findMentionedOption: engine.findMentionedOption,
    applyFixToText: engine.applyFixToText,
  };
}

/** Probes a repository for its Renovate config file (roadmap 007). */
export async function loadRepoConfig(req: RepoConfigRequest): Promise<RepoConfigResult> {
  const engine = await import("@renovate-config-visualizer/engine");
  await ensureAuth(engine);
  return engine.fetchRepoConfig(req);
}
