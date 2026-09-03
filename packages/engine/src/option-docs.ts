import { getOptions } from "./renovate-adapter";
import { renovateVersion } from "./version";

/**
 * Roadmap 072 — the option projection.
 *
 * Every field here is Renovate's own metadata for the PINNED version, never a
 * restatement of it. The types below are declared locally on purpose: only
 * `renovate-adapter.ts` may reach into `renovate/dist`, and that boundary is
 * CI-enforced, so these mirror upstream's `config/types.d.ts` structurally
 * rather than importing it.
 */

/**
 * Renovate's config-stage ladder. Not documentation metadata: `filterConfig`
 * (upstream `config/index.js`) DELETES an option from the config once the
 * pipeline has passed the option's stage.
 */
export type OptionStage = "global" | "inherit" | "repository" | "package" | "branch" | "pr";

/** One conditional-requirement clause of an option's `requiredIf`. */
export interface OptionRequiredIf {
  siblingProperties: readonly { property: string; value: string }[];
}

/**
 * WHERE an option may appear — stated, never left to inference.
 *
 * Renovate's validator builds `optionParents` only from options that declare
 * `parents` and enforces nesting only for those keys (upstream
 * `config/validation.js`), so an absent `parents` is not missing data: it is
 * upstream saying the option is legal at the top level AND inside any
 * container object. Making this field required is what stops a renderer
 * silently printing nothing and letting the reader guess.
 */
export type OptionPlacement =
  /**
   * Upstream declares `parents`: Renovate's validator rejects the option
   * anywhere else. `topLevel` is upstream's `"."` entry, lifted out — it is a
   * placement fact, not the name of a parent option.
   */
  | { readonly kind: "restricted"; readonly parents: readonly string[]; readonly topLevel: boolean }
  /** Upstream declares NO `parents` — see above; this is a statement about
   *  upstream's code, not an assumption. */
  | { readonly kind: "unrestricted" };

/** UI-friendly view of one entry of renovate's option metadata. */
export interface OptionDoc {
  name: string;
  description: string;
  type: string;
  subType?: string;
  default?: unknown;
  allowedValues?: string[];
  supportedManagers?: string[];
  supportedPlatforms?: string[];
  /** Only configurable on the self-hosted/global level */
  globalOnly?: boolean;
  experimental?: boolean;
  experimentalDescription?: string;
  /** Tracking issues for an `experimental` option, as URLs — computed here so
   *  no renderer has to know the shape of a renovatebot issue link. */
  experimentalIssueUrls?: readonly string[];
  deprecationMsg?: string;
  advancedUse?: boolean;
  /** Where this option may appear. Always present — see `OptionPlacement`. */
  placement: OptionPlacement;
  /**
   * Set when other options declare this one as their `parents` entry, i.e.
   * its children are themselves Renovate options rather than free-form keys.
   */
  isContainer?: true;
  /**
   * The options RESTRICTED to this container — the ones that named it in
   * `parents`.
   *
   * NOT "everything valid here": any option with an `unrestricted` placement
   * may also appear inside this container, and most options are unrestricted.
   * Renderers must say so alongside the list or they turn one ambiguity into
   * a worse one.
   */
  childOptions?: readonly string[];
  /** Values are matched as globs, or as regexes when written `/…/`. */
  patternMatch?: true;
  /** An integer option that accepts negative values (`prPriority`). */
  allowNegative?: true;
  /** The value may contain Renovate template expressions. */
  supportsTemplating?: true;
  /** Renovate drops this option from the config once the pipeline passes this
   *  stage. */
  stage?: OptionStage;
  /** Declared in Renovate's option table; the PINNED validator never reads it
   *  — see `REQUIRED_IF_NOTE`. */
  requiredIf?: readonly OptionRequiredIf[];
  /** May be set in the inherited config layer. */
  inheritConfigSupport?: true;
  /** A bare string is massaged into a one-element array (`config/massage.js`). */
  allowString?: true;
  /** Children of this option are NOT validated (upstream `freeChoice`), which
   *  is why a typo inside it is never flagged. */
  freeChoice?: true;
  /** Upstream's `format` constraint on a string (or string-array) option. */
  format?: "regex";
  /** Preset and repo values MERGE rather than replace. Only ever `true` — the
   *  three upstream `mergeable: false` entries are the default and say
   *  nothing. */
  mergeable?: true;
  /** Prose for the flags above, by reference to the static notes in this
   *  module — the flag is the machine-readable fact, this is the sentence. */
  notes?: readonly string[];
  /** Deep link into the renovate documentation */
  url: string;
}

export interface OptionIndex {
  /**
   * Container option name → the options RESTRICTED to it (see
   * `OptionDoc.childOptions`), derived from the `parents` declarations —
   * packageRules, hostRules, major, npm, …. Keys of objects nested under
   * anything else (constraints, customEnvVariables, …) are free-form.
   *
   * A lower bound on truth: `minor` is here only because `enabled` declares
   * `parents: ["minor"]`.
   */
  containers: ReadonlyMap<string, readonly string[]>;
  options: ReadonlyMap<string, OptionDoc>;
}

/** The page every pattern-matching explanation cites — shared with
 *  `error-translations.ts` so the two can't drift. */
export const STRING_PATTERN_MATCHING_DOCS_URL =
  "https://docs.renovatebot.com/string-pattern-matching/";

/** The page every templating explanation cites — shared with the CLI's pretty
 *  projection so the two can't drift. */
export const TEMPLATES_DOCS_URL = "https://docs.renovatebot.com/templates/";

/**
 * Every clause is traceable to the pinned Renovate: array-of-strings and the
 * `*`-alongside-others rejection to `config/validation-helpers/regex-glob-matchers.js`;
 * `/…/`, `/…/i`, `!`, and the positives-OR / negatives-AND rule to
 * `util/string-match.js` (`matchRegexOrGlob`, `matchRegexOrGlobList`).
 */
export const PATTERN_MATCHING_NOTE =
  "Pattern option: entries must be an array of strings, matched as globs, or as regexes when " +
  "written `/…/` (`/…/i` for case-insensitive). A leading `!` negates an entry. In a list, at " +
  "least one positive entry must match, and every negative entry must also match. `*` matches " +
  `everything and is rejected alongside other patterns. ${STRING_PATTERN_MATCHING_DOCS_URL}`;

export const TEMPLATING_NOTE =
  "The value may contain Renovate template expressions (`{{depName}}` and friends), compiled " +
  `before use. ${TEMPLATES_DOCS_URL}`;

export const REQUIRED_IF_NOTE =
  "This requirement is declared in Renovate's option table; the pinned validator does not " +
  "enforce it, so leaving the option out is not reported as an error.";

/**
 * A version-pinned citation for the option table itself. `url` on each doc
 * points at docs.renovatebot.com, which serves LATEST and silently drifts from
 * the pin; this one is immutable.
 *
 * Renovate ships no per-option version history — no `since`, no changelog in
 * the package — so neither this nor anything else here can say when an option
 * appeared or last changed. That ceiling is upstream's, and it is stated out
 * loud in `rcd docs --help` and the MCP tool description rather than papered
 * over with an always-null field.
 */
export const optionsSourceUrl = `https://www.npmjs.com/package/renovate/v/${renovateVersion}`;

/**
 * `$schema` is a JSON Schema keyword, not a Renovate config option — it's
 * absent from `getOptions()` and Renovate's validator explicitly ignores it
 * (see `ignoredNodes` in its validation module) rather than rejecting it.
 * Modeled by hand so it renders like any other known key instead of tripping
 * the unknown-option styling (roadmap 026). `unrestricted` because the
 * ignore-list is consulted at every nesting level, not just the root.
 */
const SCHEMA_OPTION: OptionDoc = {
  name: "$schema",
  description:
    "Points editors at Renovate's JSON schema for autocomplete and inline validation; ignored by Renovate itself.",
  type: "string",
  placement: { kind: "unrestricted" },
  url: "https://docs.renovatebot.com/config-overview/",
};

/**
 * Upstream fields deliberately NOT forwarded, so nobody re-litigates them:
 *
 * - `env` (93 entries) and `cli` (261) carry no names — every entry is a
 *   `false` opt-out, never an env-var or flag name. There is nothing to show.
 * - `autogenerated` (118), `additionalProperties` (10) and
 *   `replaceLineReturns` (2) drive Renovate's docs-site and JSON-schema
 *   generation. They describe no user-visible config behavior.
 */

/** Upstream sets these flags only to `true`; a `false` is the default and says
 *  nothing, so it must not become a rendered line. */
function flag(value: boolean | undefined): true | undefined {
  return value === true ? true : undefined;
}

function placementOf(parents: readonly string[] | undefined): OptionPlacement {
  if (!parents) {
    return { kind: "unrestricted" };
  }
  return {
    kind: "restricted",
    parents: parents.filter((parent) => parent !== ".").toSorted(),
    topLevel: parents.includes("."),
  };
}

function notesFor(option: {
  patternMatch?: boolean;
  supportsTemplating?: boolean;
  requiredIf?: unknown;
}): readonly string[] | undefined {
  const notes: string[] = [];
  if (option.patternMatch) {
    notes.push(PATTERN_MATCHING_NOTE);
  }
  if (option.supportsTemplating) {
    notes.push(TEMPLATING_NOTE);
  }
  if (option.requiredIf) {
    notes.push(REQUIRED_IF_NOTE);
  }
  return notes.length > 0 ? notes : undefined;
}

let cached: OptionIndex | undefined;

/** Builds (once) an index of renovate's own option metadata for hover docs. */
export function getOptionIndex(): OptionIndex {
  if (cached) {
    return cached;
  }
  const options = new Map<string, OptionDoc>();
  options.set(SCHEMA_OPTION.name, SCHEMA_OPTION);
  const containers = new Map<string, string[]>();
  for (const option of getOptions()) {
    const page = option.globalOnly ? "self-hosted-configuration" : "configuration-options";
    options.set(option.name, {
      name: option.name,
      description: option.description,
      type: option.type,
      subType: "subType" in option ? option.subType : undefined,
      default: option.default,
      allowedValues: option.allowedValues,
      supportedManagers: option.supportedManagers,
      supportedPlatforms: option.supportedPlatforms,
      globalOnly: option.globalOnly,
      experimental: option.experimental,
      experimentalDescription: option.experimentalDescription,
      experimentalIssueUrls: option.experimentalIssues?.map(
        (issue) => `https://github.com/renovatebot/renovate/issues/${issue}`,
      ),
      deprecationMsg: option.deprecationMsg,
      advancedUse: option.advancedUse,
      placement: placementOf(option.parents),
      patternMatch: flag(option.patternMatch),
      allowNegative: flag(option.allowNegative),
      supportsTemplating: flag(option.supportsTemplating),
      stage: option.stage,
      requiredIf: option.requiredIf,
      inheritConfigSupport: flag(option.inheritConfigSupport),
      allowString: flag(option.allowString),
      freeChoice: flag(option.freeChoice),
      // `format` lives on the string and string-array members of the union
      // only, so it needs the same narrowing `subType` already gets.
      format: "format" in option ? option.format : undefined,
      mergeable: flag(option.mergeable),
      notes: notesFor(option),
      url: `https://docs.renovatebot.com/${page}/#${option.name.toLowerCase()}`,
    });
    for (const parent of option.parents ?? []) {
      if (parent !== ".") {
        const children = containers.get(parent);
        if (children) {
          children.push(option.name);
        } else {
          containers.set(parent, [option.name]);
        }
      }
    }
  }
  // Second pass: the container facts belong ON the doc, so no call site has to
  // re-derive them (and no two call sites can disagree about them).
  for (const [parent, children] of containers) {
    children.sort();
    const doc = options.get(parent);
    if (doc) {
      options.set(parent, { ...doc, isContainer: true, childOptions: children });
    }
  }
  cached = { options, containers };
  return cached;
}
