/**
 * PreToolUse — refuse Bash calls that would use the wrong package manager.
 *
 * The workspace is pnpm-only: `packageManager` is pinned, the lockfile is
 * pnpm's, and `pnpm-workspace.yaml` carries patches plus the allowBuilds
 * decisions. An `npm install` here silently produces a different (unpatched,
 * unpinned) node_modules that no CI run would reproduce.
 */
import { readHookInput } from "./utils/hook-input.ts";
import { deny } from "./utils/output.ts";

const { bashCommand } = await readHookInput();

if (bashCommand !== undefined) {
  // Word-bounded so that `pnpm dlx`, paths and prose ("… like npm-run-all")
  // don't trip it; `pnpm exec`/`pnpm dlx` remain the escape hatch.
  if (/(?:^|\s)(?:npm|npx|yarn)(?:\s|$)/.test(bashCommand)) {
    deny("This workspace is pnpm-only — use pnpm (or `pnpm dlx`) instead of npm/npx/yarn.");
  }
}
