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
