import type { PresetNode, PresetSourceRef } from "@renovate-config-debugger/engine";
import { GLOSSARY, type GlossaryEntry } from "@/data/glossary-data";
import { githubAuthFailure } from "@/lib/github-failure";

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
