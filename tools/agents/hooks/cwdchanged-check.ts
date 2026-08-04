/**
 * CwdChanged — provision a checkout that has never been installed.
 *
 * Fires on every working-directory change, `EnterWorktree` included. A fresh
 * git worktree has no node_modules at all, so without this the first check
 * run in it fails on a missing binary rather than on the code.
 *
 * Guarded on node_modules being absent: an ordinary `cd` within an installed
 * checkout must stay free.
 */
import { access } from "node:fs/promises";
import { join } from "node:path";
import { getRepoRoot } from "./utils/git.ts";
import { readHookInput } from "./utils/hook-input.ts";
import { provision } from "./utils/provision.ts";

const { cwd } = await readHookInput();
const root = await getRepoRoot(cwd);
if (!root) {
  process.exit(0);
}

const installed = await access(join(root, "node_modules")).then(
  () => true,
  () => false,
);
if (installed) {
  process.exit(0);
}

await provision(root);
