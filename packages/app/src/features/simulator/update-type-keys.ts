import type * as EngineModule from "@renovate-config-debugger/engine";

/**
 * Roadmap 046: the update-type blocks Renovate's flattening consumes, an
 * app-local copy of the engine's `UPDATE_TYPE_KEYS` — typed against the real
 * export so a drift fails the build, but without a static VALUE import that
 * would pull the renovate chunk into the initial bundle (the same pattern as
 * 033's `STAGE_IDS`).
 */
export const UPDATE_TYPE_KEYS: typeof EngineModule.UPDATE_TYPE_KEYS = [
  "major",
  "minor",
  "patch",
  "pin",
  "digest",
  "lockFileMaintenance",
  "replacement",
];
