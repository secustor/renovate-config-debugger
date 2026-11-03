/**
 * Browser shim for `@renovatebot/base-image`, which renovate's util/exec graph
 * imports (renovate ≥ 44.19x). Upstream re-exports `@containerbase/base`, whose
 * module scope reads `../package.json` through `createRequire` — undefined in
 * the browser, and a "Cannot find module" crash in the CLI's inlined bundle,
 * where `import.meta.url` is the chunk. Three names reach the config pipeline:
 * `toolNames` (validation's `constraints` key check), `tools` and
 * `isContainerbase` (exec-only paths that never run here). The tool table stays
 * upstream's own data — the package's exported `tools.json`, resolved by the
 * plugin — so validation's verdicts don't drift from Renovate's.
 */
import { tools } from "@containerbase/base/tools.json";

export { tools };

export const toolNames: string[] = Object.keys(tools);

export function isContainerbase(): boolean {
  return false;
}
