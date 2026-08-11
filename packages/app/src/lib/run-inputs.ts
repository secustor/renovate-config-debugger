import type { ShareFileName } from "./share";

/** Everything a pipeline run is built from — assembled by App, consumed by the
 *  share-link and repo-load hooks. Lives in the shared layer because three
 *  modules read it; it is the run contract, not a share-link detail. */
export interface RunInputs {
  fileName: ShareFileName;
  content: string;
  platform: string;
  endpoint: string;
  /** Parsed 008 layers; absent = layer off. */
  globalConfig?: Record<string, unknown>;
  inheritedConfig?: Record<string, unknown>;
  /** The user explicitly overrode the global config's platform/endpoint. */
  platformOverride?: boolean;
}

/**
 * Roadmap 067 review: one whole run request — the inputs plus everything else
 * that decides what the run does and what its commit does to the reader.
 * `App.onRun` assembles one of these per request and asks `runRequestKey`
 * whether it is already running.
 */
export interface RunRequest {
  readonly inputs: RunInputs;
  /** Preset bodies the user injected by hand (roadmap 026). */
  readonly injectedPresets: Readonly<Record<string, Record<string, unknown>>>;
  /** Whether this run leaves the host tokens behind (the untrusted-endpoint
   *  guard, or a share link's explicit request). */
  readonly suppressTokens: boolean;
  /** Which fatal banner the run is allowed to clear — see `App.applyFatal`. */
  readonly fatalSeq: number;
  readonly preserveScroll: boolean;
  readonly keepTab: boolean;
}

/**
 * Roadmap 067 review: what makes two run requests THE SAME request — the
 * question `onRun` asks before queueing a second one behind the first.
 *
 * Every field above is in here, because every one of them changes what the user
 * would end up looking at. Two requests that agree on all of them cannot produce
 * two different screens, so the second is answered by the run already in flight;
 * two that differ anywhere both run. That is the whole rule, and it is about the
 * REQUEST rather than about which entry point made it — the distinction the
 * `coalesce` opt-out could not draw.
 *
 * Written out field by field rather than `JSON.stringify(request)` so the order
 * is this function's and not each call site's object literal's: three modules
 * build a `RunInputs` and they need not agree on key order. The nested layers
 * and the injected presets keep whatever order their own parse produced, which
 * two presses of one key share; where two structurally equal objects did differ
 * in order, they would get two keys and both would run, which is the harmless
 * direction.
 *
 * NOT in the key: the host tokens, which `run()` reads at fetch time instead of
 * taking from `RunInputs`. So two identical requests fold even if a token was
 * added between them — but only while the first is still in flight, which is
 * before its failure is on screen; the retry that answers that failure is made
 * afterwards and always runs.
 */
export function runRequestKey(request: RunRequest): string {
  const { inputs } = request;
  return JSON.stringify([
    inputs.fileName,
    inputs.content,
    inputs.platform,
    inputs.endpoint,
    inputs.globalConfig ?? null,
    inputs.inheritedConfig ?? null,
    inputs.platformOverride === true,
    request.injectedPresets,
    request.suppressTokens,
    request.fatalSeq,
    request.preserveScroll,
    request.keepTab,
  ]);
}
