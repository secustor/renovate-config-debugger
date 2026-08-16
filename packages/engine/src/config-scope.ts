import { getOptions } from "./renovate-adapter";

/**
 * Which config options a repository config may actually reach — the
 * `globalOnly` class, named once.
 *
 * Renovate declares 100+ options as `globalOnly`: they are read from the
 * self-hosted global config and are neither settable by a repo config nor
 * reachable by a `packageRules` entry. Two consumers need that class:
 *
 * - the pipeline, which strips it from the inherited-config layer exactly as
 *   Renovate's own `removeGlobalConfig` does (roadmap 008);
 * - the CLI/MCP projections (roadmap 070), which prune it from a
 *   PER-DEPENDENCY config document, where every one of those keys is provably
 *   inert.
 *
 * It lives in its own module so the second consumer does not have to import
 * the pipeline (and with it the whole run machinery) to ask a question about
 * option metadata.
 */

let cachedGlobalOnly: ReadonlySet<string> | undefined;

/** The names of every `globalOnly` option of the pinned Renovate. Cached —
 *  `getOptions()` is a fixed table, and callers ask per config document. */
export function globalOnlyOptionNames(): ReadonlySet<string> {
  if (cachedGlobalOnly) {
    return cachedGlobalOnly;
  }
  const names = new Set<string>();
  for (const option of getOptions()) {
    if (option.globalOnly) {
      names.add(option.name);
    }
  }
  cachedGlobalOnly = names;
  return cachedGlobalOnly;
}

/**
 * Renovate's `removeGlobalConfig` (dist/config/index.js) reimplemented — the
 * upstream module also drags the full modules/manager graph (100+ Node-only
 * manager modules) into any bundle that imports it, so the visualizer keeps
 * this pure 7-line getOptions() loop local instead of deep-importing it.
 *
 * `keepInherited` is upstream's carve-out for the INHERITED layer, where the
 * `inheritConfigSupport` options are legal; on any other document (a repo
 * config, a per-dependency config) pass `false`.
 */
export function removeGlobalConfig(
  config: Record<string, unknown>,
  keepInherited: boolean,
): Record<string, unknown> {
  const outputConfig = { ...config };
  for (const option of getOptions()) {
    if (keepInherited && option.inheritConfigSupport) {
      continue;
    }
    if (option.globalOnly) {
      delete outputConfig[option.name];
    }
  }
  return outputConfig;
}
