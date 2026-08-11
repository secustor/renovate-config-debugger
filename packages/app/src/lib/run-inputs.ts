/**
 * Roadmap 067, eighth review: this module briefly also exported `runRequestKey`,
 * an identity `App.onRun` folded duplicate run requests by. It is gone, and the
 * reason belongs here because the idea will occur to the next reader too: the
 * key had to stay exhaustive over every input any run reads, and the host tokens
 * are not inputs at all — `platform/run.ts` takes them at fetch time — so a
 * token pasted while a run resolved changed nothing in the key, and the ⌘⏎ that
 * asked to retry WITH it folded into the tokenless run already in flight. The
 * fold bought one thing (three impatient presses on an unchanged config costing
 * one run instead of three) and cost correctness twice. `App.onRun` states the
 * rest.
 */
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
