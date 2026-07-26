/**
 * Roadmap 014 — a small curated library that translates a handful of
 * recurring Renovate validator messages into plain language plus a concrete,
 * conservative suggested edit. Renders ALONGSIDE the original message (see
 * `packages/app/src/components/MessagesPanel.tsx` /
 * `packages/app/src/components/RuleSimulator.tsx`), never instead of it.
 *
 * Every matcher parses the EXACT message text Renovate's own validator
 * produces (see upstream's `config/validation.js` and
 * `validation-helpers/regex-glob-matchers.js`, under renovate's package
 * `dist/`) — a change to those strings upstream simply stops the pattern
 * matching, falling back to today's plain rendering; it never mis-fires.
 *
 * Deliberately conservative: a `suggestFix` only returns a result when it can
 * locate the exact value the message is about in the given config snapshot
 * (usually because Renovate's own message embeds the config path, e.g.
 * `packageRules[1].matchPackageNames: ...`) and the edit is unambiguous. When
 * it can't, it returns `null` and the UI shows the explanation without an
 * "Apply fix" button.
 */

import { snapshot } from "./trace/delta";
import type { ValidationMessage } from "./trace/model";
import { getOptionIndex, type OptionDoc } from "./option-docs";

/** One step of a JSON path: an object key, or an array index. */
export type ConfigPathSegment = string | number;

export interface ErrorFixResult {
  /** Path (root-relative) to the value this fix changes. */
  path: ConfigPathSegment[];
  /** Value-replace fixes: the new value to set at `path`. */
  value?: unknown;
  /** Rename fixes: the new key name; `path`'s last segment is the old key. */
  renameTo?: string;
  /** Remove fixes: delete the key/index `path` points at. */
  remove?: true;
  /** The value at `path` before the fix (for a before/after snippet). */
  before: unknown;
  /** The value at `path` after the fix; `undefined` for a `remove` fix. */
  after: unknown;
  /** One-line human summary of the edit, e.g. "Remove `*` from `matchPackageNames`". */
  summary: string;
  /** The whole config with the fix applied — the plain "parsed config → fixed config" function roadmap 014 asks for. */
  fixedConfig: Record<string, unknown>;
}

export interface ErrorTranslation {
  id: string;
  matches(message: ValidationMessage): boolean;
  explain(message: ValidationMessage): string;
  /** Renovate option name(s) the message concerns, for a 003 docs-link. */
  optionNames(message: ValidationMessage): string[];
  /**
   * Overrides the 003 option-index docs link with a more specific docs page
   * (e.g. matcher semantics rather than a single option's reference entry),
   * when the explanation cites something the option index doesn't cover.
   */
  docsUrl?: string;
  /** `config` is the exact snapshot the message was validated against. */
  suggestFix?(message: ValidationMessage, config: Record<string, unknown>): ErrorFixResult | null;
}

export interface TranslatedMessage {
  id: string;
  explanation: string;
  fix: ErrorFixResult | null;
  docsUrl?: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Parses a Renovate `currentPath` string, e.g. `packageRules[1].matchPackageNames`
 *  or a bare top-level key, into path segments. */
export function parseConfigPath(pathStr: string): ConfigPathSegment[] {
  const segments: ConfigPathSegment[] = [];
  // Named groups so the two alternatives narrow by name rather than by index:
  // exactly one of them participates in any given match.
  const re = /(?<key>[^.[\]]+)|\[(?<index>\d+)\]/g;
  for (const { groups } of pathStr.matchAll(re)) {
    if (groups?.index !== undefined) {
      segments.push(Number(groups.index));
    } else if (groups?.key !== undefined) {
      segments.push(groups.key);
    }
  }
  return segments;
}

/**
 * Walks `container` to the parent of `path`'s last segment and returns it
 * together with that segment — the shared prologue of the three `with*`
 * editors below. `null` for an empty path (nothing to address).
 */
function resolveParent(
  container: Record<string, unknown>,
  path: ConfigPathSegment[],
): { parent: Record<PropertyKey, unknown>; last: ConfigPathSegment } | null {
  const last = path.at(-1);
  if (last === undefined) {
    return null;
  }
  let cur = container as Record<PropertyKey, unknown>;
  for (const seg of path.slice(0, -1)) {
    cur = cur[seg] as Record<PropertyKey, unknown>;
  }
  return { parent: cur, last };
}

function getAtPath(obj: unknown, path: ConfigPathSegment[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<PropertyKey, unknown>)[seg];
  }
  return cur;
}

function withValueAtPath(
  config: Record<string, unknown>,
  path: ConfigPathSegment[],
  value: unknown,
): Record<string, unknown> {
  const clone = snapshot(config);
  const target = resolveParent(clone, path);
  if (target) {
    target.parent[target.last] = value;
  }
  return clone;
}

function withKeyRemoved(
  config: Record<string, unknown>,
  path: ConfigPathSegment[],
): Record<string, unknown> {
  const clone = snapshot(config);
  const target = resolveParent(clone, path);
  if (!target) {
    return clone;
  }
  const { parent, last } = target;
  if (Array.isArray(parent) && typeof last === "number") {
    parent.splice(last, 1);
  } else {
    delete parent[last];
  }
  return clone;
}

function withKeyRenamed(
  config: Record<string, unknown>,
  path: ConfigPathSegment[],
  newKey: string,
): Record<string, unknown> {
  const clone = snapshot(config);
  const target = resolveParent(clone, path);
  if (!target) {
    return clone;
  }
  const { parent, last } = target;
  const value = parent[last];
  delete parent[last];
  parent[newKey] = value;
  return clone;
}

/** Unique `` `identifier` `` tokens mentioned in a free-text message. */
function backtickedTokens(text: string): string[] {
  const seen = new Set<string>();
  for (const [, token] of text.matchAll(/`([A-Za-z][\w]*)`/g)) {
    if (token !== undefined) {
      seen.add(token);
    }
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// 1. Redundant `*`/`**` alongside other patterns
// ---------------------------------------------------------------------------
// Message shape (upstream's config/validation-helpers/regex-glob-matchers.js):
// `${currentPath}: Your input contains * or ** along with other patterns. Please remove them, as * or ** matches all patterns.`

const REDUNDANT_GLOB_RE =
  /^(.+?): Your input contains \* or \*\* along with other patterns\. Please remove them, as \* or \*\* matches all patterns\.$/;

const REDUNDANT_GLOB_STAR_DOCS_URL =
  "https://docs.renovatebot.com/string-pattern-matching/#negative-matching";

const redundantGlobStar: ErrorTranslation = {
  id: "redundant-glob-star",
  matches: (m) => REDUNDANT_GLOB_RE.test(m.message),

  explain: (m) => {
    const match = REDUNDANT_GLOB_RE.exec(m.message);
    const path = match?.[1] ?? "this list";
    return (
      `\`*\`/\`**\` already matches everything, so listing it alongside other patterns in ` +
      `\`${path}\` is redundant — newer Renovate rejects the combination outright. The suggested ` +
      `fix below drops \`*\`/\`**\` and keeps the rest, which is safe when every remaining entry is ` +
      `a negation (\`!name\`): Renovate's array-matching rule already treats a negation-only array ` +
      `as matching everything except what it excludes — the exact "match everything but…" behavior ` +
      `\`*\` plus those negations was producing (see "Negative matching" at ${REDUNDANT_GLOB_STAR_DOCS_URL}). ` +
      `If a remaining entry is a plain, non-negated pattern instead, dropping \`*\`/\`**\` narrows the ` +
      `match to just what's listed — check that's what you want.`
    );
  },

  docsUrl: REDUNDANT_GLOB_STAR_DOCS_URL,

  optionNames: (m) => {
    const pathStr = REDUNDANT_GLOB_RE.exec(m.message)?.[1];
    if (pathStr === undefined) {
      return [];
    }
    const last = parseConfigPath(pathStr).at(-1);
    return typeof last === "string" ? [last] : [];
  },

  suggestFix: (m, config) => {
    const pathStr = REDUNDANT_GLOB_RE.exec(m.message)?.[1];
    if (pathStr === undefined) {
      return null;
    }
    const path = parseConfigPath(pathStr);
    if (path.length === 0) {
      return null;
    }
    const arr = getAtPath(config, path);
    if (!Array.isArray(arr) || !arr.every((v) => typeof v === "string")) {
      return null;
    }
    const removed = arr.filter((v) => v === "*" || v === "**");
    const filtered = arr.filter((v) => v !== "*" && v !== "**");
    // Conservative: nothing to remove, or removing it would leave nothing
    // (the message's own precondition is "along with OTHER patterns", so this
    // shouldn't happen against a config the message was actually produced
    // from — bail rather than guess if it does).
    if (removed.length === 0 || filtered.length === 0) {
      return null;
    }
    return {
      path,
      value: filtered,
      before: arr,
      after: filtered,
      summary: `Remove ${removed.map((v) => `\`${v}\``).join(" and ")} from \`${pathStr}\``,
      fixedConfig: withValueAtPath(config, path, filtered),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Deprecated option (that the migrate stage doesn't rename automatically)
// ---------------------------------------------------------------------------
// Message shape (upstream's config/validation.js `getDeprecationMessage`):
// `The '${option}' option is deprecated: ${deprecationMsg}`
// By the time `validate` runs, `migrate` (004) has already applied every
// automatic rename (`RenamePropertyMigration`), so a key surviving to this
// warning has NO automatic replacement in the general case — the fix below
// only fires for the rare case where the deprecation text itself names
// exactly one other real option to switch to.

const DEPRECATED_RE = /^The '([^']+)' option is deprecated: (.+)$/;

const deprecatedOption: ErrorTranslation = {
  id: "deprecated-option",
  matches: (m) => m.topic === "Deprecation Warning" && DEPRECATED_RE.test(m.message),

  explain: (m) => {
    const match = DEPRECATED_RE.exec(m.message);
    const key = match?.[1] ?? "This option";
    const detail = match?.[2] ?? "";
    return (
      `\`${key}\` is deprecated${detail ? `: ${detail}` : "."} The app's migration step ` +
      `(roadmap 004 — see the Migrations panel) already renames options where Renovate provides a ` +
      `direct automatic replacement; \`${key}\` reaching validation means Renovate has no single ` +
      `automatic mapping for it, so it needs a manual look.`
    );
  },

  optionNames: (m) => {
    const key = DEPRECATED_RE.exec(m.message)?.[1];
    return key === undefined ? [] : [key];
  },

  suggestFix: (m, config) => {
    const [, key, detail] = DEPRECATED_RE.exec(m.message) ?? [];
    if (key === undefined || detail === undefined) {
      return null;
    }
    if (!(key in config)) {
      // Not present at the root of this snapshot — can't confidently locate
      // it (e.g. it's nested), so no auto-fix.
      return null;
    }
    const knownOptions = getOptionIndex().options;
    const [newKey, ...alsoNamed] = backtickedTokens(detail).filter(
      (c) => c !== key && knownOptions.has(c),
    );
    if (newKey === undefined || alsoNamed.length > 0) {
      // Zero or ambiguous (more than one) alternative named — be conservative.
      return null;
    }
    if (newKey in config) {
      // Don't clobber an existing value under the new name.
      return null;
    }
    const value = config[key];
    return {
      path: [key],
      renameTo: newKey,
      before: value,
      after: value,
      summary: `Rename \`${key}\` to \`${newKey}\``,
      fixedConfig: withKeyRenamed(config, [key], newKey),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Global-only option set in repo config (008's boundary warning)
// ---------------------------------------------------------------------------
// Message shape (upstream's config/validation.js):
// `The "${key}" option is a global option reserved only for Renovate's global
// configuration and cannot be configured within a repository's config file.`

const GLOBAL_ONLY_RE =
  /^The "([^"]+)" option is a global option reserved only for Renovate's global configuration and cannot be configured within a repository's config file\.$/;

const globalOnlyOption: ErrorTranslation = {
  id: "global-only-option",
  matches: (m) => GLOBAL_ONLY_RE.test(m.message),

  explain: (m) => {
    const match = GLOBAL_ONLY_RE.exec(m.message);
    const key = match?.[1] ?? "This option";
    return (
      `\`${key}\` only works in Renovate's global/self-hosted config (roadmap 008's global config ` +
      `layer) — a repository's own config file can't set it, so as written it has no effect at all. ` +
      `Move it to the self-hosted config, or remove it here.`
    );
  },

  optionNames: (m) => {
    const key = GLOBAL_ONLY_RE.exec(m.message)?.[1];
    return key === undefined ? [] : [key];
  },

  suggestFix: (m, config) => {
    const key = GLOBAL_ONLY_RE.exec(m.message)?.[1];
    if (key === undefined) {
      return null;
    }
    // Conservative: only offer removal when the key is at the root of this
    // snapshot (the overwhelming common case for global-only options, which
    // have no `parents` restricting them elsewhere) — a nested occurrence is
    // left alone rather than guessed at.
    if (!(key in config)) {
      return null;
    }
    const value = config[key];
    return {
      path: [key],
      remove: true,
      before: value,
      after: undefined,
      summary: `Remove \`${key}\` from the repository config`,
      fixedConfig: withKeyRemoved(config, [key]),
    };
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const ERROR_TRANSLATIONS: ErrorTranslation[] = [
  redundantGlobStar,
  deprecatedOption,
  globalOnlyOption,
];

/**
 * Matches `message` against the curated library. `config` should be the exact
 * config snapshot the message was validated against (e.g. the pipeline's
 * post-massage, pre-preset-merge snapshot for a top-level `validate` message);
 * pass `null` when no such snapshot is available to skip fix computation.
 */
export function translateMessage(
  message: ValidationMessage,
  config: Record<string, unknown> | null,
): TranslatedMessage | null {
  const translation = ERROR_TRANSLATIONS.find((t) => t.matches(message));
  if (!translation) {
    return null;
  }
  const fix = config && translation.suggestFix ? translation.suggestFix(message, config) : null;
  const doc = translation
    .optionNames(message)
    .map((name) => getOptionIndex().options.get(name))
    .find((d): d is OptionDoc => Boolean(d));
  return {
    id: translation.id,
    explanation: translation.explain(message),
    fix,
    docsUrl: translation.docsUrl ?? doc?.url,
  };
}

/**
 * Fallback for messages the curated library doesn't recognize (the common
 * case): if the raw text mentions a real option name — quoted with backticks,
 * single, or double quotes, Renovate's validator uses all three — surface a
 * docs link for it (roadmap 003's option index), same as the option hover
 * cards do.
 */
export function findMentionedOption(message: ValidationMessage): OptionDoc | undefined {
  const index = getOptionIndex();
  const tokens = message.message.matchAll(/[`'"]([A-Za-z][\w]*)[`'"]/g);
  for (const [, token] of tokens) {
    const doc = token === undefined ? undefined : index.options.get(token);
    if (doc) {
      return doc;
    }
  }
  return undefined;
}
