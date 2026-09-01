import type { PresetNode } from "@renovate-config-debugger/engine";
import { AUTH_OR_RATE_LIMIT_HINT } from "@renovate-config-debugger/engine/contracts";

/**
 * The app's reader of the engine's failure messages.
 *
 * Renovate rethrows a plain `Error` through its preset machinery, so the only
 * thing that survives the trip from the shim to here is the message string —
 * which makes the wording an API. It is DECLARED once, in
 * `engine/src/contracts.ts`, and imported by both sides: the shim builds its
 * message with the constant, this file builds its matcher from the same one.
 *
 * The engine used to carry a "VERBATIM STRINGS … must stay byte-identical"
 * banner naming this file by path, because the phrase was written out at both
 * ends and nothing could check that they agreed. There is no second copy now,
 * so there is nothing to keep in step and no instruction to obey.
 *
 * `./contracts` is a leaf subpath with no imports of its own — reaching the
 * engine ROOT for a value would pull the whole Renovate graph onto a static
 * path, which is what `.oxlintrc.json`'s engine-root ban exists to stop.
 */

/**
 * Whether a failure message is the shim's auth / rate-limit flavor, as opposed
 * to a preset that genuinely is not there. Renovate rethrows these WITHOUT the
 * rewrite it applies to `dep not found`, which is why the fetcher's own wording
 * survives all the way to the app.
 *
 * Compared case-insensitively by lowering both sides rather than by building a
 * `RegExp` from the constant: a shared string needs no escaping this way, and
 * cannot become a pattern by accident if the phrase ever gains punctuation.
 */
export function isGithubRateLimited(message: string | undefined): boolean {
  return (message ?? "").toLowerCase().includes(AUTH_OR_RATE_LIMIT_HINT.toLowerCase());
}

/**
 * A failed GitHub preset node whose error is the private-repo (not-found) or
 * auth/rate-limit kind — the cases where signing in is the likely fix (009).
 *
 * Two message shapes per flavor, because renovate rewrites one of them: the
 * fetcher's raw `dep not found` is replaced by renovate's validation copy
 * ("Cannot find preset's package (…)") when the preset error is thrown, and
 * the engine mirrors that rewrite onto the node (preset-tree.ts, "Throwing
 * preset error") — so by the time the app reads the node, only the rewritten
 * form remains. Rate-limit errors are rethrown by renovate WITHOUT a rewrite,
 * which is what `isGithubRateLimited` reads — that wording is a verbatim
 * cross-package contract with the engine's shim, and lives in one place now.
 */
export function githubAuthFailure(node: PresetNode): { match: boolean; rateLimited: boolean } {
  if (node.state !== "error" || node.source?.presetSource !== "github") {
    return { match: false, rateLimited: false };
  }
  const msg = node.error?.message ?? "";
  const rateLimited = isGithubRateLimited(msg);
  const notFound = /dep not found|Cannot find preset's package/i.test(msg);
  return { match: rateLimited || notFound, rateLimited };
}

/**
 * Roadmap 009 (auth-failure surfacing): the preset as the user would WRITE it,
 * rebuilt from the node's structured source when its raw `name` isn't already
 * that form. The tree's `name` is the raw `extends` entry, which for a github
 * preset is normally exactly `github>owner/repo[:preset]` — so it is preferred
 * whenever it still mentions the repo, and only a node whose name drifted (a
 * bare `owner/repo` shorthand, a `local>` rewrite) gets the synthesized form.
 */
export function githubPresetDisplayName(node: PresetNode): string {
  const repo = node.source?.repo;
  if (!repo) {
    return node.name;
  }
  return node.name.includes(repo) ? node.name : `github>${repo}`;
}

/** One failing GitHub preset, as the run-level banner (009) names it — and the
 *  banner's own prop type. Carries the naming, not the node: a banner that
 *  prints one sentence has no use for a tree node. */
export interface GithubAuthFailureNode {
  /** Display form, e.g. `github>secustor/private-presets`. */
  name: string;
  /** This particular failure was a rate limit rather than a not-found. */
  rateLimited: boolean;
}

/** Every sign-in-fixable GitHub failure in a run, plus the aggregate flavor. */
export interface GithubAuthFailures {
  /** Deduped by repository — one unreachable repo extended from five places is
   *  ONE thing to fix, and naming it five times reads as five problems. */
  failures: GithubAuthFailureNode[];
  /** Any failure was a rate limit — tunes the hint's copy toward "sign in to
   *  raise the limit" rather than "sign in to reach a private repo". */
  rateLimited: boolean;
}

/**
 * Roadmap 009 (auth-failure surfacing): walks a finished run's preset tree for
 * the failures signing in could fix, so the app can say so ONCE at run level
 * instead of only inside the detail panel of a node the user has to find first.
 * Pure (no React, no engine) — the whole decision is unit-testable.
 */
export function collectGithubAuthFailures(root: PresetNode | undefined): GithubAuthFailures {
  const failures: GithubAuthFailureNode[] = [];
  const seenRepos = new Set<string>();
  let rateLimited = false;
  // Iterative walk: `config:recommended` alone expands to ~1,100 nodes, and a
  // recursive one would also be at the mercy of a pathological chain depth.
  const stack: PresetNode[] = root ? [root] : [];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    // An internal preset (`config:*`, `group:*`, …) is a static definition
    // inside renovate itself and can only reference other internal presets —
    // nothing sign-in-fixable can live below one, so the whole subtree is
    // skipped (review, PR #61). Only an EXPLICIT "internal" prunes: the root
    // user-config node has no parsed source and must always descend.
    if (node.source?.presetSource === "internal") {
      continue;
    }
    // Children pushed in reverse so the walk still reports them left-to-right —
    // the banner names the FIRST failure, which must be the first one the user
    // would find in the tree.
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) {
        stack.push(child);
      }
    }
    const failure = githubAuthFailure(node);
    if (!failure.match) {
      continue;
    }
    rateLimited ||= failure.rateLimited;
    const dedupeKey = node.source?.repo ?? node.name;
    if (seenRepos.has(dedupeKey)) {
      continue;
    }
    seenRepos.add(dedupeKey);
    failures.push({ name: githubPresetDisplayName(node), rateLimited: failure.rateLimited });
  }
  return { failures, rateLimited };
}
