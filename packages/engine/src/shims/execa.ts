/**
 * Browser stub for `execa` (reached from renovate's util/exec/common.js via the
 * manager artifact graphs). Nothing here ever spawns a process; since execa 10
 * its npm-run-path dep imports Node-only unicorn-magic exports, which the
 * browser build resolves to a missing-export hard error.
 */
export function execa(): never {
  throw new Error("subprocess execution is not available in the browser");
}
