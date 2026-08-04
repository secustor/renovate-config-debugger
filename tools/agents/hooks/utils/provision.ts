/**
 * Brings a checkout to a working state: the toolchain from `mise.toml`, then
 * the workspace's dependencies.
 */
import { exec } from "./exec.ts";

export async function provision(cwd?: string): Promise<boolean> {
  // Non-fatal: a session on a machine without mise still works as long as the
  // node/pnpm on PATH satisfy `engines` — it just isn't the pinned pair.
  // (`mise.toml`'s postinstall hook runs `pnpm install` for us when mise is
  // present; the explicit install below is what covers the case where it
  // isn't, and is a no-op otherwise.)
  const mise = await exec("mise", ["install"], { cwd });
  if (!mise.ok) {
    console.error("[hooks] mise install failed or mise is absent — continuing");
  }

  const install = await exec("pnpm", ["install"], { cwd });
  if (!install.ok) {
    console.error("[hooks] pnpm install failed — the session has no deps");
  }
  return install.ok;
}
