import { globalOnlyOptionNames, removeGlobalConfig } from "@renovate-config-debugger/engine";
import { CliError } from "../io";
import { preview } from "../output";

/**
 * Roadmap 070: the projection over a CONFIG-SHAPED document — the effective
 * config, a per-dependency simulation result, a comparison's key delta —
 * shared by the CLI's `--format json` and the MCP server, the way
 * `projections/tree.ts` is shared by `rcd tree` and `get_preset_tree`.
 *
 * It exists because those documents are unusable as an answer at scale. A
 * `finalDependencyConfig` is ~25 kB over 396 top-level keys, 107 of which are
 * `globalOnly` options that no `packageRules` entry can read or write; and
 * `description` — a mergeable array Renovate concatenates on nearly every
 * merge — is re-embedded IN FULL on both sides of every diff that touches it
 * (4 kB per rule at `config:best-practices` scale).
 *
 * Two axes, one vocabulary on both transports:
 *
 * - `scope` selects a CLASS of key (`package-rules` drops the globalOnly
 *   class, `full` keeps everything);
 * - `keys` selects NAMED keys, and only ever narrows what `scope` left.
 *
 * The order is the decision, not an accident: `keys` runs after the scope
 * prune, so no combination of parameters can return a key the default answer
 * withheld. Every answer is a subset of the default answer — which is what
 * lets a caller reason about what it did NOT get. Widening is `scope`'s job
 * alone, and the payload always states which scope produced it.
 */

export const CONFIG_SCOPES = ["package-rules", "full"] as const;
export type ConfigScope = (typeof CONFIG_SCOPES)[number];

export interface ConfigViewRequest {
  /** Top-level option names to keep. Omitted: everything `scope` left. */
  keys?: readonly string[];
  scope: ConfigScope;
}

/**
 * Why a requested key is not in the answer. `absent` ("this document does not
 * carry that option") and `global-only` ("this VIEW cannot carry it") are
 * different answers, and a silently empty result is indistinguishable from a
 * bug, so the view names which one happened.
 *
 * A globalOnly name under `package-rules` always reads `global-only`, whether
 * or not the document held it: that is the reason the caller can act on —
 * `scope: "full"` is the parameter that changes the answer.
 */
export interface WithheldKey {
  key: string;
  reason: "absent" | "global-only";
}

/** What produced the document next to it. ~60 bytes, so a reader never has to
 *  infer which projection an answer came out of. */
export interface ConfigView {
  scope: ConfigScope;
  /** How many top-level keys the returned document has. */
  keys: number;
  /** `globalOnly` options the scope removed. Present only when it removed some. */
  droppedGlobalOnly?: number;
  /** Present only when `keys` named something the answer does not carry. */
  withheld?: WithheldKey[];
}

export interface ProjectedConfig {
  config: Record<string, unknown>;
  view: ConfigView;
}

/** The key-level decision, without a document: which of `present` survive the
 *  request, and the view that describes it. Shared by {@link projectConfig}
 *  and the comparison delta, which is a key LIST rather than a record. */
export function projectKeySet(
  present: readonly string[],
  request: ConfigViewRequest,
): { kept: Set<string>; view: ConfigView } {
  const globalOnly = globalOnlyOptionNames();
  const pruned =
    request.scope === "package-rules"
      ? present.filter((key) => !globalOnly.has(key))
      : [...present];
  const droppedGlobalOnly = present.length - pruned.length;
  if (!request.keys) {
    return {
      kept: new Set(pruned),
      view: {
        scope: request.scope,
        keys: pruned.length,
        ...(droppedGlobalOnly > 0 ? { droppedGlobalOnly } : {}),
      },
    };
  }
  const survivors = new Set(pruned);
  const kept = new Set<string>();
  const withheld: WithheldKey[] = [];
  for (const key of request.keys) {
    if (survivors.has(key)) {
      kept.add(key);
    } else {
      // The scope, not the document, is why a globalOnly key is gone — and
      // `keys` must never resurrect it. `scope: "full"` is the way back.
      withheld.push({
        key,
        reason: request.scope === "package-rules" && globalOnly.has(key) ? "global-only" : "absent",
      });
    }
  }
  return {
    kept,
    view: {
      scope: request.scope,
      keys: kept.size,
      ...(droppedGlobalOnly > 0 ? { droppedGlobalOnly } : {}),
      ...(withheld.length > 0 ? { withheld } : {}),
    },
  };
}

/** A config document, scope-pruned and then key-selected. Strictly
 *  subtractive: the result is always a subset of `config`. */
export function projectConfig(
  config: Record<string, unknown>,
  request: ConfigViewRequest,
): ProjectedConfig {
  if (request.scope === "package-rules" && !request.keys) {
    // The engine's own primitive on the whole-document path — one definition
    // of the globalOnly class, and the pipeline's regression guard covers it.
    const pruned = removeGlobalConfig(config, false);
    const dropped = Object.keys(config).length - Object.keys(pruned).length;
    return {
      config: pruned,
      view: {
        scope: request.scope,
        keys: Object.keys(pruned).length,
        ...(dropped > 0 ? { droppedGlobalOnly: dropped } : {}),
      },
    };
  }
  const { kept, view } = projectKeySet(Object.keys(config), request);
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (kept.has(key)) {
      projected[key] = value;
    }
  }
  return { config: projected, view };
}

/**
 * A before/after pair for one key. `MergedKey` (a rule's merge) and
 * `ConfigKeyDelta` (a comparison's delta) are structurally the same thing, so
 * the collapsing below is written once and generically — a delta's own extra
 * fields (`inA`, `beforeInherited`, …) ride through untouched.
 */
export interface KeyDiff {
  key: string;
  before?: unknown;
  after?: unknown;
}

/** An `append`-shaped diff, stated instead of re-embedded. */
export interface CollapsedKeyDiff {
  key: string;
  /** How `after` relates to `before` — only `append` is collapsible. */
  collapsed: "append";
  beforeLength: number;
  afterLength: number;
  /** Exactly what this step appended — the answer the reader wanted. */
  added: string[];
}

export type MaybeCollapsed<T extends KeyDiff> =
  | T
  | (Omit<T, "before" | "after"> & CollapsedKeyDiff);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * Collapses a `description` append into what it appended.
 *
 * The conditions are deliberately narrow: the key is `description`, both sides
 * are string arrays, the before side is non-empty, and `after` starts with
 * `before` — which is precisely what `mergeChildConfig`'s array concatenation
 * guarantees. Anything else stays verbatim: a rule that REPLACED the
 * description must still show both sides, and collapsing an empty `before`
 * saves nothing.
 *
 * `description` alone, on purpose. It is prose, it is never a matcher input,
 * it is the only mergeable array Renovate concatenates on effectively every
 * merge, and it is the heaviest key of a per-dependency config. `labels` and
 * `extends` stay verbatim — a reader of a `labels` diff wants the list. This
 * is `computeDescriptionProvenance`'s direction (attribute the contribution,
 * never drop the key): the full array is one `get_provenance description`
 * away.
 */
export function collapseDescriptionDiff<T extends KeyDiff>(diff: T): MaybeCollapsed<T> {
  const { before, after, ...rest } = diff;
  if (
    diff.key !== "description" ||
    !isStringArray(before) ||
    !isStringArray(after) ||
    before.length === 0 ||
    after.length <= before.length ||
    JSON.stringify(after.slice(0, before.length)) !== JSON.stringify(before)
  ) {
    return diff;
  }
  return {
    ...rest,
    collapsed: "append",
    beforeLength: before.length,
    afterLength: after.length,
    added: after.slice(before.length),
  };
}

export function collapseDiffs<T extends KeyDiff>(diffs: readonly T[]): MaybeCollapsed<T>[] {
  return diffs.map((diff) => collapseDescriptionDiff(diff));
}

function isCollapsed(diff: KeyDiff | CollapsedKeyDiff): diff is CollapsedKeyDiff {
  return "collapsed" in diff;
}

/** `key: before → after`, or the collapsed form. The comparison's delta line. */
export function diffLine(diff: KeyDiff | CollapsedKeyDiff): string {
  if (isCollapsed(diff)) {
    return (
      `${diff.key}: ${diff.beforeLength} entries + ${diff.added.length} appended ` +
      `(now ${diff.afterLength}) — ${preview(diff.added)}`
    );
  }
  return `${diff.key}: ${preview(diff.before)} → ${preview(diff.after)}`;
}

/** `key = value`, or the collapsed form — what one merge step DID, without a
 *  verb, so a caller can prefix its own ("sets …", "  …"). */
export function mergedLine(diff: KeyDiff | CollapsedKeyDiff): string {
  if (isCollapsed(diff)) {
    return `${diff.key} += ${diff.added.length} of ${diff.afterLength} entries: ${preview(diff.added)}`;
  }
  return `${diff.key} = ${preview(diff.after)}`;
}

export function parseConfigScope(raw: string | undefined, flag: string): ConfigScope | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const found = CONFIG_SCOPES.find((scope) => scope === raw);
  if (!found) {
    throw new CliError(`${flag} must be one of ${CONFIG_SCOPES.join("|")} (got "${raw}")`);
  }
  return found;
}

/** `--keys a,b,c` — `--select`'s grammar, so one comma list means one thing
 *  everywhere. An empty list is `undefined`: "no keys" would be an answer with
 *  nothing in it, which is never what someone typing a flag meant. */
export function parseKeys(raw: string | undefined): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const keys = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return keys.length > 0 ? keys : undefined;
}
