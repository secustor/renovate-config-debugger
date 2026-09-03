import { type DependencyDescriptor, deriveUpdateType } from "@renovate-config-debugger/engine";

/**
 * The hypothetical update, finished the way a real lookup would finish it —
 * asked by `--dep`/`--deps-file` on the CLI and by the `dep`/`deps` parameters
 * over MCP (see `./pipeline` for what this layer is).
 */

/**
 * Every field of `DependencyDescriptor` is optional, so the descriptor is
 * whatever subset the caller supplied; for a MISSING field the matchers
 * themselves report what they could not read (`no-input`), which is a better
 * error than any shape check here could give. A key that is not a field at all
 * is the other half, and the simulator's own unknown-key note names it.
 * `updateType` is the one derived field: Renovate sets it from the version
 * pair long before packageRules run.
 */
export function finishDescriptor(dep: DependencyDescriptor): DependencyDescriptor {
  if (dep.updateType) {
    return dep;
  }
  const derived = deriveUpdateType(dep.currentValue, dep.newValue, dep.versioning);
  return derived ? { ...dep, updateType: derived } : dep;
}
