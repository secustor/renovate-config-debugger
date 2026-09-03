import type {
  AppliedTextFix,
  AuthRefreshHandler,
  ErrorFixResult,
  OptionDoc,
  OptionIndex,
  PipelineInput,
  PresetAuth,
  RepoConfigRequest,
  RepoConfigResult,
  RepoFileRequest,
  RepoTreeRequest,
  RepoTreeResult,
  TraceResult,
  TranslatedMessage,
  ValidationMessage,
} from "@renovate-config-debugger/engine";
import { readCustomHostRules } from "@/lib/custom-host-rules";
import { HOST_TOKENS } from "@/data/host-tokens";
import { isValidToken } from "@/lib/input-schemas";
import { type Engine, loadEngine } from "./engine-chunk";
import { getValidToken, recoverRejectedToken } from "./oauth";
import { sessionGet } from "./storage";

// Per-host PATs live in sessionStorage (roadmap 009/010 storage rules): they
// are secrets, so they follow the OAuth token and clear when the tab closes.
// Platform/endpoint (non-secrets) stay in localStorage — see
// app/use-platform-context.ts.
// Roadmap 033: the hosts and their storage keys come from the one HOST_TOKENS
// table instead of being restated here.

/** Roadmap 030: the "header injection" rule applied at the last possible
 *  moment — right before a token is handed to the engine to place into a
 *  request header. `setHostToken` (hooks/use-host-tokens.ts) already keeps a
 *  bad value out of sessionStorage, but this is the actual use-time boundary,
 *  so it's checked again rather than trusted transitively (storage can still
 *  drift or be hand-edited between the write and this read). */
function sessionToken(key: string): string | undefined {
  const value = sessionGet(key);
  return value !== null && isValidToken(value) ? value : undefined;
}

/** What a run may ask of its CREDENTIALS — App.tsx's own `RunOptions` is the
 *  caller-side shape, and forwards its `suppressTokens` into this one. */
export interface RunAuthOptions {
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
 * silently refreshed when needed, wins over the GitHub PAT fallback. Roadmap
 * 076's custom credential rows ride along in the same object as `hostRules`,
 * so the `suppressTokens` overwrite below covers them too.
 */
function applyAuth(engine: Engine, oauthToken: string | null, opts?: RunAuthOptions): void {
  if (opts?.suppressTokens) {
    // Overwrite (never just skip): `setPresetAuth` replaces module state a
    // PREVIOUS run may have populated, so this is what actually guarantees no
    // token is attached to this run's fetches.
    engine.setPresetAuth({});
    return;
  }
  const auth: PresetAuth = {};
  for (const host of HOST_TOKENS) {
    auth[host.authKey] = sessionToken(host.storageKey);
  }
  // A GitHub OAuth token (silently refreshed by the caller) wins over the
  // GitHub PAT.
  auth.githubToken = oauthToken ?? auth.githubToken;
  // Roadmap 030, the same use-time boundary as `sessionToken`: each stored
  // rule is re-validated here, not trusted from when it was written.
  const hostRules = readCustomHostRules().filter((rule) => isValidToken(rule.token));
  if (hostRules.length > 0) {
    auth.hostRules = hostRules.map((rule) => ({
      matchHost: rule.host,
      hostType: rule.hostType,
      token: rule.token,
    }));
  }
  engine.setPresetAuth(auth);
}

/**
 * A GitHub 401 mid-run means the attached token was revoked before its
 * recorded expiry (another tab's refresh of the shared cookie grant rotates
 * it and revokes this tab's access token). The engine asks this handler once
 * per rejected request: recover a usable token — or drop the dead one — push
 * the new auth state, and let the transport retry. A rejected PAT or
 * credentials row is not renewable here, so the 401 surfaces as before.
 */
function makeAuthRefreshHandler(engine: Engine): AuthRefreshHandler {
  return async (hostType, _url, rejected) => {
    if (hostType !== "github") {
      return false;
    }
    const recovery = await recoverRejectedToken(rejected);
    if (!recovery.recovered || recovery.token === rejected) {
      return false;
    }
    // token: the sibling/refreshed replacement; null: the session ended, so
    // the retry (and the rest of the run) goes out without the dead token.
    applyAuth(engine, recovery.token);
    return true;
  };
}

/**
 * Roadmap 031: the engine chunk download and the OAuth token refresh (a
 * Worker round-trip when the token is stale) are independent, so they run
 * concurrently instead of back-to-back. Every ordering invariant holds:
 * both have settled before `setPresetAuth`, so any fetch the engine issues
 * still carries the refreshed token; while the untrusted-endpoint guard
 * stands (`suppressTokens`), the token machinery is never even touched —
 * exactly as before, no refresh request leaves the browser for a run that
 * must not use credentials, and no revoked-token recovery may re-attach one.
 */
async function engineWithAuth(opts?: RunAuthOptions): Promise<Engine> {
  const [engine, oauthToken] = await Promise.all([
    loadEngine(),
    opts?.suppressTokens ? null : getValidToken(),
  ]);
  applyAuth(engine, oauthToken, opts);
  engine.setAuthRefreshHandler(opts?.suppressTokens ? null : makeAuthRefreshHandler(engine));
  return engine;
}

/**
 * `loadEngine` keeps the heavy renovate chunk out of the initial page load;
 * Vite code-splits it automatically behind that call.
 */
export async function run(input: PipelineInput, opts?: RunAuthOptions): Promise<TraceResult> {
  const engine = await engineWithAuth(opts);
  return engine.runPipeline(input);
}

/** Option metadata for hover docs; cheap once the engine chunk is loaded. */
export async function loadOptionIndex(): Promise<OptionIndex> {
  const engine = await loadEngine();
  return engine.getOptionIndex();
}

/** The bundled Renovate version — for the shareable-link version-drift check. */
export async function getRenovateVersion(): Promise<string> {
  const engine = await loadEngine();
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
  const engine = await loadEngine();
  return {
    translateMessage: engine.translateMessage,
    findMentionedOption: engine.findMentionedOption,
    applyFixToText: engine.applyFixToText,
  };
}

/**
 * The engine's own `renovate`-key extractor, reached the same lazy way as the
 * option index and the error-translation library. Same reason as those two:
 * the answer is Renovate's, not the app's — a pasted
 * `…/blob/main/package.json` reference has to yield exactly what config
 * DISCOVERY would have yielded for that file, and the engine copy is the one
 * the pinned-Renovate CI covers.
 */
export async function extractPackageJsonConfig(raw: string): Promise<string | null> {
  const engine = await loadEngine();
  return engine.extractPackageJsonConfig(raw);
}

/** Probes a repository for its Renovate config file (roadmap 007). Takes the
 *  same `suppressTokens` seam as {@link run}: a repo load against an endpoint
 *  a share link chose must not carry credentials either. */
export async function loadRepoConfig(
  req: RepoConfigRequest,
  opts?: RunAuthOptions,
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
  opts?: RunAuthOptions,
): Promise<string | null> {
  const engine = await engineWithAuth(opts);
  return engine.fetchRepoFile(req);
}

/** Roadmap 078: one recursive git-tree listing (GitHub only) — the
 *  From-repository dependency picker's file walk. Same auth/`suppressTokens`
 *  seam as the loads above: the walk rides exactly the credentials the repo
 *  load it follows did. */
export async function loadRepoTree(
  req: RepoTreeRequest,
  opts?: RunAuthOptions,
): Promise<RepoTreeResult> {
  const engine = await engineWithAuth(opts);
  return engine.fetchRepoTree(req);
}
