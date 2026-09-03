/**
 * The bits of git the hooks need, over `exec` — no simple-git, for the reason
 * given in `exec.ts`.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { exec } from "./exec.ts";

async function git(args: string[], cwd?: string): Promise<string> {
  const result = await exec("git", args, { cwd, quiet: true });
  return result.ok ? result.output.trim() : "";
}

function lines(out: string): string[] {
  return out.split("\n").filter((line) => line.length > 0);
}

export async function getRepoRoot(cwd?: string): Promise<string | null> {
  return (await git(["rev-parse", "--show-toplevel"], cwd)) || null;
}

/**
 * Somewhere inside this worktree's git dir — `.git/…` in a normal checkout,
 * `.git/worktrees/<name>/…` in a worktree, which is what makes it the right
 * home for per-branch hook state: never committed, never wiped by an install,
 * and not shared between two worktrees checked out at different commits.
 */
export async function getGitStatePath(root: string, name: string): Promise<string | null> {
  const path = await git(["rev-parse", "--git-path", name], root);
  if (!path) {
    return null;
  }
  return isAbsolute(path) ? path : join(root, path);
}

/**
 * The commit this branch's work is measured against: the fork point from
 * origin/main, else the upstream branch, else HEAD — which narrows "changed"
 * to "uncommitted", the only honest answer left when neither ref exists.
 */
async function getBaseRef(root: string): Promise<string> {
  return (
    (await git(["merge-base", "origin/main", "HEAD"], root)) ||
    (await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root)) ||
    "HEAD"
  );
}

export interface WorkingSet {
  /** Repo-relative paths changed since the base ref, including untracked. */
  files: string[];
  /** Content hash of exactly those changes — see `stop-check.ts`. */
  fingerprint: string;
}

export async function getWorkingSet(root: string): Promise<WorkingSet> {
  const base = await getBaseRef(root);
  // No `--diff-filter`, and renames off: a deletion and BOTH halves of a move
  // have to reach the set, which only ever string-matches these paths.
  const tracked = lines(await git(["diff", "--name-only", "--no-renames", base], root));
  // `git diff` only sees files git already knows about, so a brand-new source
  // file — the case where running the tests matters most — is invisible to it.
  const untracked = lines(await git(["ls-files", "--others", "--exclude-standard"], root));

  // The patch covers committed *and* uncommitted edits to tracked files; the
  // untracked ones have to be hashed by hand, path included so that a rename
  // registers as a change.
  const hash = createHash("sha256").update(await git(["diff", base], root));
  for (const file of untracked) {
    hash.update(file);
    hash.update(await readFile(join(root, file)).catch(() => Buffer.alloc(0)));
  }

  return {
    files: [...new Set([...tracked, ...untracked])],
    fingerprint: hash.digest("hex"),
  };
}
