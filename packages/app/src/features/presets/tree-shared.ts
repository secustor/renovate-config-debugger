import type { PresetNode, PresetSourceRef } from "@renovate-config-debugger/engine";
import { GLOSSARY, type GlossaryEntry } from "@/data/glossary-data";

/**
 * A failed GitHub preset node whose error is the private-repo (not-found) or
 * auth/rate-limit kind — the cases where signing in is the likely fix (009).
 *
 * Two message shapes per flavor, because renovate rewrites one of them: the
 * fetcher's raw `dep not found` is replaced by renovate's validation copy
 * ("Cannot find preset's package (…)") when the preset error is thrown, and
 * the engine mirrors that rewrite onto the node (preset-tree.ts, "Throwing
 * preset error") — so by the time the app reads the node, only the rewritten
 * form remains. Rate-limit errors are rethrown by renovate WITHOUT a rewrite
 * and keep the fetcher's `rate limit or missing token` wording.
 */
export function githubAuthFailure(node: PresetNode): { match: boolean; rateLimited: boolean } {
  if (node.state !== "error" || node.source?.presetSource !== "github") {
    return { match: false, rateLimited: false };
  }
  const msg = node.error?.message ?? "";
  const rateLimited = /rate limit or missing token/i.test(msg);
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

/** One failing GitHub preset, as the run-level banner (009) names it. Carries
 *  the naming, not the node: the banner is a shared component and may not
 *  reach into this feature (048), so what crosses that line is a sentence's
 *  worth of data. */
export interface GithubAuthFailureNode {
  /** Display form, e.g. `github>secustor/private-presets`. */
  name: string;
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

export type InjectionKeyFn = (id: {
  presetSource: string;
  repo?: string;
  presetPath?: string;
  presetName?: string;
  tag?: string;
}) => string;
export type ParseFn = (text: string) => Record<string, unknown>;

/** Injection key for a node, or null when its source could not be parsed. */
export function nodeInjectionKey(
  source: PresetSourceRef | undefined,
  keyFn: InjectionKeyFn | null,
): string | null {
  if (!source?.presetSource || !keyFn) {
    return null;
  }
  return keyFn({
    presetSource: source.presetSource,
    repo: source.repo,
    presetPath: source.presetPath,
    presetName: source.presetName,
    tag: source.tag,
  });
}

export type MergeFn = (
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
) => Record<string, unknown>;

export const STATE_LABELS: Record<PresetNode["state"], string | null> = {
  resolved: null,
  error: "failed",
  ignored: "ignored via ignorePresets",
  "already-seen": "skipped — already in its own ancestor chain",
  aborted: "not resolved — run aborted by an earlier error",
};

/** A row's state badge: the word it wears and the modifier that colors it. */
export interface StateBadge {
  label: string;
  /** Appended to the shared `badge state` base classes. */
  className: string;
}

/**
 * Roadmap 009 (auth-failure surfacing): what a row's state badge says. Plain
 * `failed` covers every error EXCEPT the two the user can act on — a GitHub
 * preset that signing in would reach (`no access`) and one that ran into the
 * unauthenticated rate limit (`rate limited`). Naming the cause in the badge
 * is what lets the tree be scanned for "which of these is about my token?"
 * without opening a single node. Lives here, next to {@link githubAuthFailure},
 * so TreeRow stays a renderer. Null = this state wears no badge at all.
 */
export function stateBadge(node: PresetNode): StateBadge | null {
  const label = STATE_LABELS[node.state];
  if (label === null) {
    return null;
  }
  const failure = githubAuthFailure(node);
  if (!failure.match) {
    return { label, className: `state-${node.state}` };
  }
  return failure.rateLimited
    ? { label: "rate limited", className: `state-${node.state} auth-rate-limited` }
    : { label: "no access", className: `state-${node.state} auth-no-access` };
}

/** Fixed row height keeps the windowing math trivial; rows never wrap. */
export const ROW_HEIGHT = 26;
export const INDENT = 14;
export const OVERSCAN = 8;

export const nf = new Intl.NumberFormat();

/** Roadmap 016: hover-card text for a preset's `src-<kind>` badge — internal
 *  presets reuse the summary header's wording; every fetched kind gets a
 *  kind-specific explanation of where it came from. */
export function sourceKindEntry(kind: string): GlossaryEntry {
  if (kind === "internal") {
    return GLOSSARY.presetSourceInternal;
  }
  const HOST_TEXT: Record<string, string> = {
    github: "Fetched from a repository on GitHub.",
    gitlab: "Fetched from a repository on GitLab.",
    gitea: "Fetched from a repository on Gitea.",
    forgejo: "Fetched from a repository on Forgejo.",
    npm: "Fetched from the npm registry package's config.",
    http: "Fetched from a raw HTTP(S) URL.",
    local: "Resolved as a `local>` preset against the configured platform and repository.",
  };
  return {
    name: `${kind} preset`,
    plain: HOST_TEXT[kind] ?? GLOSSARY.presetSourceFetched.plain,
  };
}

/** Regular English plural — every summary/badge word here happens to take a
 *  plain trailing "s", so one helper covers them all. */
export function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
