/**
 * The shims' half of the pinned `renovate/dist` deep-import surface — the
 * companion to `src/renovate-adapter.ts`, and the second (and last) place to
 * look when a Renovate release moves a file.
 *
 * Why it is not simply the adapter: the adapter re-exports
 * `resolveConfigPresets` from `config/presets/index.js`, which is the very
 * module whose per-host children (`presets/github/index.js`, …) these shims
 * REPLACE. Routing a preset shim through the adapter would therefore close an
 * import cycle — shim → adapter → presets/index.js → shim — so the shims keep
 * their own door, and this module is it.
 *
 * The bar for a specifier belonging here is the same as the adapter's: it is
 * `renovate/dist/**`, so a version bump can move it. Everything the shims
 * import that is NOT a Renovate internal (their own `../auth`, `./url-path`,
 * json5, …) stays a normal import at the use site.
 */
export { getOptions } from "renovate/dist/config/options/index.js";
export { MigrationsService } from "renovate/dist/config/migrations/migrations-service.js";
export { mergeChildConfig } from "renovate/dist/config/utils.js";
export { clone } from "renovate/dist/util/clone.js";
export { regEx } from "renovate/dist/util/regex.js";
/**
 * Renovate's own preset plumbing, reused verbatim by every preset fetcher
 * shim: `fetchPreset` owns the file-name candidate chain and the sub-preset
 * lookup, `parsePreset` the JSON/JSON5 parsing, and the `PRESET_*` constants
 * are the sentinel messages `fetchPreset` matches on to decide "try the next
 * candidate" — which is why a shim throws `new Error(PRESET_DEP_NOT_FOUND)`
 * rather than inventing a not-found signal of its own.
 *
 * NOTE: this `parsePreset` is `presets/util.js`'s (content, fileName), NOT the
 * adapter's `presets/parse.js` export of the same name.
 */
export {
  fetchPreset,
  parsePreset,
  PRESET_DEP_NOT_FOUND,
  PRESET_INVALID,
  PRESET_NOT_FOUND,
  PRESET_RENOVATE_CONFIG_NOT_FOUND,
} from "renovate/dist/config/presets/util.js";
/** Renovate's "the host, not the config, is the problem" error. Thrown by the
 *  browser transports for a CORS/network failure and for 401/403/429, and
 *  unwrapped by the trace collector so the cause reaches the UI. */
export { ExternalHostError } from "renovate/dist/types/errors/external-host-error.js";
