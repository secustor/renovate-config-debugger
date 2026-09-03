/**
 * Roadmap 094 — one pattern list, one input, explained.
 *
 * Every `match*` list option (`matchPackageNames`, `matchFileNames`, …) goes
 * through upstream's `matchRegexOrGlobList`, and that function is what the
 * verdict here IS: `matches` is its return value, never a re-derivation. What
 * this module adds is the per-entry breakdown a reader needs to see WHY — which
 * positive hit, which negative blocked — and it gets that by asking the same
 * upstream predicate one entry at a time (`matchRegexOrGlob`), so the two
 * views cannot disagree. The proof is `pattern-match.test.ts`, which checks
 * `matches` against a direct call for every case.
 */
import { getOptionIndex } from "./option-docs";
import {
  getRegexPredicate,
  isRegexMatch,
  matchRegexOrGlob,
  matchRegexOrGlobList,
} from "./renovate-adapter";

/** How upstream reads one entry: `*` short-circuits, `/…/` is a regex,
 *  anything else is a minimatch glob. */
export type PatternKind = "any" | "regex" | "glob";

export interface ParsedPattern {
  kind: PatternKind;
  /** A leading `!` — the entry must NOT match for the list to match. */
  negative: boolean;
  /** Regexes are case-sensitive unless written `/…/i`; globs never are
   *  (`nocase: true` upstream). */
  caseInsensitive: boolean;
  /** Written as a regex that does not compile. Upstream's validator rejects
   *  the config; its matcher silently falls back to treating the text as a
   *  glob, which is what `hit` then reports. */
  invalid: boolean;
}

export interface PatternEntryMatch extends ParsedPattern {
  pattern: string;
  /**
   * Whether the entry's BODY matched the input. For a positive entry this is
   * the match; for a negative one it means the entry BLOCKS the list (upstream
   * inverts negatives, so this is the inverse of its predicate's answer).
   */
  hit: boolean;
  /** For a positive glob that missed: a rewrite upstream's matcher DOES
   *  accept for this input, when one of the two URL-shaped traps explains the
   *  miss (see `globRewrites`). */
  suggestion?: string;
}

/** Why the list did not match, when it did not. */
export type PatternMissReason = "empty" | "no-positive" | "blocked";

export interface PatternListMatch {
  /** Upstream's own answer — `matchRegexOrGlobList(input, patterns)`. */
  matches: boolean;
  entries: PatternEntryMatch[];
  reason: PatternMissReason | null;
}

const REGEX_FLAGS = /\/(i?)$/;

export function parsePattern(pattern: string): ParsedPattern {
  if (pattern === "*") {
    return { kind: "any", negative: false, caseInsensitive: true, invalid: false };
  }
  const negative = pattern.startsWith("!");
  if (isRegexMatch(pattern)) {
    return {
      kind: "regex",
      negative,
      caseInsensitive: REGEX_FLAGS.exec(pattern)?.[1] === "i",
      invalid: getRegexPredicate(pattern) === null,
    };
  }
  return { kind: "glob", negative, caseInsensitive: true, invalid: false };
}

/**
 * The rewrites a missed positive glob is tried against, in order — the two
 * minimatch traps a URL-shaped input falls into: `**` glued to text is a
 * single-SEGMENT wildcard (so `**quay.io` never crosses the `https://`
 * slashes; `**\/quay.io` does), and a trailing `/**` demands a path (so
 * `quay.io/**` misses the bare host; `quay.io{/,}**` takes both). Only a
 * candidate upstream's own matcher accepts is ever suggested.
 */
function globRewrites(pattern: string): string[] {
  const optionalPath = pattern.endsWith("/**") ? `${pattern.slice(0, -3)}{/,}**` : pattern;
  const segmented =
    optionalPath.startsWith("**") && !optionalPath.startsWith("**/")
      ? `**/${optionalPath.slice(2)}`
      : optionalPath;
  return [...new Set([optionalPath, segmented])].filter((candidate) => candidate !== pattern);
}

function explainEntry(pattern: string, input: string): PatternEntryMatch {
  const parsed = parsePattern(pattern);
  const predicate = matchRegexOrGlob(input, pattern);
  const hit = parsed.negative ? !predicate : predicate;
  const entry: PatternEntryMatch = { ...parsed, pattern, hit };
  if (parsed.kind === "glob" && !parsed.negative && !hit) {
    const suggestion = globRewrites(pattern).find((candidate) =>
      matchRegexOrGlob(input, candidate),
    );
    if (suggestion !== undefined) {
      entry.suggestion = suggestion;
    }
  }
  return entry;
}

export function explainPatternMatch(patterns: readonly string[], input: string): PatternListMatch {
  const matches = matchRegexOrGlobList(input, [...patterns]);
  const entries = patterns.map((pattern) => explainEntry(pattern, input));
  let reason: PatternMissReason | null = null;
  if (!matches) {
    if (entries.length === 0) {
      reason = "empty";
    } else if (entries.some((entry) => entry.negative && entry.hit)) {
      reason = "blocked";
    } else {
      reason = "no-positive";
    }
  }
  return { matches, entries, reason };
}

/**
 * The `packageRules` options whose value is a LIST of these patterns — read
 * from the pinned option table (`patternMatch` + `parents: ["packageRules"]`
 * + array-typed), so a matcher upstream adds shows up here without an edit.
 * `matchCurrentValue`/`matchNewValue` are single patterns, not lists, and
 * `matchUpdateTypes` is an enum the table only flags as pattern-matched —
 * neither is what the list matcher evaluates.
 */
export function patternListOptionNames(): string[] {
  const names: string[] = [];
  for (const option of getOptionIndex().options.values()) {
    if (
      option.patternMatch &&
      option.type === "array" &&
      option.placement.kind === "restricted" &&
      option.placement.parents.includes("packageRules") &&
      option.allowedValues === undefined
    ) {
      names.push(option.name);
    }
  }
  return names.toSorted();
}
