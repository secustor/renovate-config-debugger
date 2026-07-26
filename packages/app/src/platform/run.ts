import type {
  AppliedTextFix,
  ErrorFixResult,
  OptionDoc,
  OptionIndex,
  PipelineInput,
  RepoConfigRequest,
  RepoConfigResult,
  RepoFileRequest,
  TraceResult,
  TranslatedMessage,
  ValidationMessage,
} from "@renovate-config-visualizer/engine";
import type * as EngineModule from "@renovate-config-visualizer/engine";
import { HOST_TOKENS } from "@/data/host-tokens";
import { isValidToken } from "@/lib/input-schemas";
import { getValidToken } from "./oauth";
import { sessionGet } from "./storage";

// Per-host PATs live in sessionStorage (roadmap 009/010 storage rules): they
// are secrets, so they follow the OAuth token and clear when the tab closes.
// Platform/endpoint (non-secrets) stay in localStorage — see App.tsx.
// Roadmap 033: the hosts and their storage keys come from the one HOST_TOKENS
// table instead of being restated here.

// The engine is only ever loaded dynamically here (it is the heavy chunk), so
// this names its shape without pulling it into the initial bundle — a type-only
// import declaration rather than an inline `typeof import(…)` annotation.
type Engine = typeof EngineModule;

/** Roadmap 030: the "header injection" rule applied at the last possible
 *  moment — right before a token is handed to the engine to place into a
 *  request header. `makeTokenHandler` (App.tsx) already keeps a bad value out
 *  of sessionStorage, but this is the actual use-time boundary, so it's
 *  checked again rather than trusted transitively (storage can still drift
 *  or be hand-edited between the write and this read). */
function sessionToken(key: string): string | undefined {
  const value = sessionGet(key);
  return value !== null && isValidToken(value) ? value : undefined;
}

export interface RunOptions {
  /**
   * Security 2026-07-25: run with NO credentials at all. Set while an
   * `UntrustedEndpointGuard` stands — a share link pointed the platform
   * context at an endpoint that is not one of the shipped public hosts (see
   * `decideShareRunPolicy`) and the user has not explicitly opted in — so an
   * attacker-chosen host can never receive the user's OAuth token or PATs.
   * Expressed as an option on the run path rather than by mutating token
   * storage: the engine's preset auth is module-level state, so the
   * suppression has to be an explicit overwrite scoped to this one call.
   */
  suppressTokens?: boolean;
}

/**
 * Pushes the per-host tokens into the engine's preset auth. Shared by every
 * entry point that fetches (pipeline runs AND repo-config loads) so both reach
 * private repos / lift rate limits identically. A GitHub OAuth token (009),
 * silently refreshed when needed, wins over the GitHub PAT fallback.
 */
function applyAuth(engine: Engine, oauthToken: string | null, opts?: RunOptions): void {
  if (opts?.suppressTokens) {
    // Overwrite (never just skip): `setPresetAuth` replaces module state a
    // PREVIOUS run may have populated, so this is what actually guarantees no
    // token is attached to this run's fetches.
    engine.setPresetAuth({});
    return;
  }
  const auth: EngineModule.PresetAuth = {};
  for (const host of HOST_TOKENS) {
    auth[host.authKey] = sessionToken(host.storageKey);
  }
  // A GitHub OAuth token (silently refreshed by the caller) wins over the
  // GitHub PAT.
  auth.githubToken = oauthToken ?? auth.githubToken;
  engine.setPresetAuth(auth);
}

/**
 * Roadmap 031: the engine chunk download and the OAuth token refresh (a
 * Worker round-trip when the token is stale) are independent, so they run
 * concurrently instead of back-to-back. Every ordering invariant holds:
 * both have settled before `setPresetAuth`, so any fetch the engine issues
 * still carries the refreshed token; while the untrusted-endpoint guard
 * stands (`suppressTokens`), the token machinery is never even touched —
 * exactly as before, no refresh request leaves the browser for a run that
 * must not use credentials.
 */
async function engineWithAuth(opts?: RunOptions): Promise<Engine> {
  const [engine, oauthToken] = await Promise.all([
    import("@renovate-config-visualizer/engine"),
    opts?.suppressTokens ? null : getValidToken(),
  ]);
  applyAuth(engine, oauthToken, opts);
  return engine;
}

/**
 * Roadmap 031: warms the engine chunk (~437 kB gz) so the download overlaps
 * idle time or hover intent instead of serializing behind the Run click.
 * Idempotent — the dynamic import is module-cached, so a Run that beats the
 * preload simply awaits the same in-flight promise. Best-effort: a network
 * failure here is swallowed, the real import on Run will surface it.
 */
export function preloadEngine(): void {
  void import("@renovate-config-visualizer/engine").catch(() => {});
}

/**
 * Dynamic import keeps the heavy renovate chunk out of the initial page load;
 * Vite code-splits it automatically behind this call.
 */
export async function run(input: PipelineInput, opts?: RunOptions): Promise<TraceResult> {
  const engine = await engineWithAuth(opts);
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

/** Probes a repository for its Renovate config file (roadmap 007). Takes the
 *  same `suppressTokens` seam as {@link run}: a repo load against an endpoint
 *  a share link chose must not carry credentials either. */
export async function loadRepoConfig(
  req: RepoConfigRequest,
  opts?: RunOptions,
): Promise<RepoConfigResult> {
  const engine = await engineWithAuth(opts);
  return engine.fetchRepoConfig(req);
}

/** Roadmap 045: ONE named file from a repository (the inherited-config probe),
 *  null when it is absent. Same auth/`suppressTokens` seam as the two above —
 *  the probe rides exactly the platform context and credentials the repo load
 *  it follows did. */
export async function loadRepoFile(
  req: RepoFileRequest,
  opts?: RunOptions,
): Promise<string | null> {
  const engine = await engineWithAuth(opts);
  return engine.fetchRepoFile(req);
}
