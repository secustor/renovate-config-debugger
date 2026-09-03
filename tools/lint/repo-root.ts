import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The repo root, for the two house rules that read the tree:
 * `comment-cites-what-exists` resolves citations against the real files, and
 * `complete-enumeration-restatement` scrapes its registries out of them.
 *
 * It lives here rather than in either rule because a second copy of a helper
 * that has a home is the exact class three rules of this plugin
 * (`prefer-is-helpers`, `use-json-helpers`, `use-json-snippet`) were landed to
 * prevent — the plugin does not get to exempt itself. Memoized once per lint
 * process, so the two rules share ONE walk rather than one each.
 */
let cached: string | undefined;
export function repoRoot(): string {
  if (cached !== undefined) {
    return cached;
  }
  let dir = import.meta.dirname;
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("tools/lint/repo-root.ts: no pnpm-workspace.yaml above the lint plugin");
    }
    dir = parent;
  }
  cached = dir;
  return cached;
}
