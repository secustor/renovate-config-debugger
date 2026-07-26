import { DATASOURCE_NAMES, MANAGER_NAMES } from "./registry-names.generated";

/**
 * Roadmap 047: sorted datasource/manager name lists for the config-builder's
 * dropdowns, read from a generated snapshot of Renovate's own registries
 * (`registry-names.generated.ts`) rather than the registries themselves.
 *
 * `renovate/dist/modules/{datasource,manager}/api.js` are eager
 * `Map<name, implementation>` literals — importing either one from a module
 * the browser bundle reaches (as `renovate-adapter.ts` is) drags in every
 * datasource/manager implementation, reintroducing the whole
 * datasource/http/git/exec/AWS dependency subtree that `shims/datasource-index.ts`
 * deliberately stubs out of the browser build. `scripts/generate-registry-names.mjs`
 * reads those maps in plain Node instead and snapshots just the key sets.
 *
 * Note: Renovate also has non-map "custom" managers (regex, jsonata, …)
 * configured under `customManagers` rather than looked up by name in the
 * manager registry — they are intentionally absent from `listManagerNames`.
 */
export function listDatasourceNames(): string[] {
  return [...DATASOURCE_NAMES];
}

export function listManagerNames(): string[] {
  return [...MANAGER_NAMES];
}
