import type { PresetNode, PresetSourceRef } from "@renovate-config-visualizer/engine";
import { GLOSSARY, type GlossaryEntry } from "@/data/glossary-data";

/**
 * A failed GitHub preset node whose error is the private-repo (not-found) or
 * auth/rate-limit kind — the cases where signing in is the likely fix (009).
 * Matches the exact strings the engine's github fetcher emits.
 */
export function githubAuthFailure(node: PresetNode): { match: boolean; rateLimited: boolean } {
  if (node.state !== "error" || node.source?.presetSource !== "github") {
    return { match: false, rateLimited: false };
  }
  const msg = node.error?.message ?? "";
  const rateLimited = /rate limit or missing token/i.test(msg);
  const notFound = /dep not found/i.test(msg);
  return { match: rateLimited || notFound, rateLimited };
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
