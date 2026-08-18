import type { ResultsTabId } from "@/data/results-tabs";

/**
 * Roadmap 029: the run digest — the whole run narrated as a short paragraph
 * whose numbers each link into the tab that explains them. Pure and DOM-free
 * (no JSX, no React): this module decides what the paragraph says, its consumer
 * only renders it.
 *
 * Roadmap 075 (v2, iteration 3): the app stopped being one of those consumers —
 * the Overview tab that rendered the paragraph retired, and the header's
 * jump-links carry its numbers. The clause model stays: `rcd digest` (and the
 * `run_config` MCP tool) is built from it through `lib/headless.ts`, so the
 * WORDING here is a published surface even though nothing in the SPA renders it
 * today. `link.tab` is kept pointing at a live tab for the same reason.
 *
 * Roadmap 029: every number the digest quotes arrives in `DigestInput` and is
 * never recomputed here — the app derives each one exactly once and feeds both
 * the tab badges and this generator, so the two can never disagree.
 *
 * Granularity ceiling: the paragraph is built from run-level aggregates and
 * from provenance keyed per TOP-LEVEL config key, so two configs that differ
 * only inside a `packageRules` entry produce the same paragraph. That is by
 * design — the digest orients, it does not detect change. Rule-level
 * differences are visible in the simulator and in `rcd compare`.
 */

const nf = new Intl.NumberFormat();

/**
 * Above this many resolved presets a bare count reads as damage rather than as
 * cost (011's persona finding), so the expansion gets the "only N of them set
 * options" framing instead. A threshold, never a hardcoded expansion size.
 */
const HUGE_EXPANSION = 50;

/** How much of a validator message the digest quotes before eliding it. */
const PROBLEM_SUMMARY_MAX = 120;

/** The shortest quote an elision will settle for — below this a boundary cut
 *  amputates the message to a stub, so a word-boundary cut reads better. */
const PROBLEM_SUMMARY_MIN = PROBLEM_SUMMARY_MAX / 2;

export type DigestTone = "ok" | "warn" | "error" | "plain";

export interface DigestLink {
  tab: ResultsTabId;
  label: string;
}

/**
 * One clause of the digest paragraph: prose, at most one linked fragment, and
 * more prose. Deliberately not a bullet — clauses are concatenated into a
 * flowing paragraph (`digestText`), and each carries its own punctuation.
 */
export interface DigestClause {
  /** Stable identity: the React key, and how a test names a clause. */
  id: string;
  tone: DigestTone;
  /** Prose before the link; joined to the link label by a single space. */
  text: string;
  /** The clause's one linked fragment — clicking it opens `tab`. */
  link?: DigestLink;
  /** Prose after the link, appended with NO separator so it can start with
   *  punctuation (", 6 of them…"). */
  tail?: string;
}

export interface DigestProblem {
  severity: "error" | "warning";
  topic: string;
  message: string;
}

export interface DigestMigrations {
  /** Rewrites applied — the header's `N rewrites` link. */
  count: number;
  /** The rewritten options, e.g. `packageNames → matchPackageNames`. Supplied
   *  only when the digest should name them (`count` ≤ 2); a longer list is
   *  reported as a count. */
  labels: string[];
}

export interface DigestPresets {
  /** Top-level `extends` entries, exactly as written in the config. */
  entries: string[];
  /** Unique resolved presets — the Presets tab badge. */
  resolved: number;
  /** How many of those set at least one option (the rest are pure routers or
   *  package-grouping rules). */
  optionSetting: number;
  /** packageRules entries the expansion contributed. */
  rules: number;
  /** Presets that could not be fetched or resolved. */
  failed: number;
  /** Presets served from content the user supplied by hand. */
  injected: number;
}

export interface DigestEffective {
  /** Options at least one layer beyond the defaults set — null while the
   *  effective-config view is still computing provenance. */
  options: number | null;
  /** How many of those a later layer actually replaced. */
  overridden: number | null;
}

export interface DigestLayers {
  global: boolean;
  inherited: boolean;
}

export interface DigestInput {
  /** The parse stage failed — nothing downstream ran. Carries the reason. */
  fatalParse?: string;
  /** Validation reported errors: a real Renovate run would refuse the config
   *  outright, so everything after the parse stage is hypothetical (023). */
  refused: boolean;
  /** The counts behind the Problems tab badge. */
  errors: number;
  warnings: number;
  /** The first problem the Problems tab lists, or absent when clean. */
  firstProblem?: DigestProblem;
  migrations: DigestMigrations;
  presets: DigestPresets;
  effective: DigestEffective;
  layers: DigestLayers;
}

function count(n: number, word: string): string {
  return `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;
}

/** Renders a list as English prose: "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function code(text: string): string {
  return `\`${text}\``;
}

/** Trims a trailing full stop so the clause can supply its own punctuation. */
function unpunctuated(text: string): string {
  return text.trim().replace(/(?<![.\s])[.\s]+$/, "");
}

/** End of the last complete sentence/clause in `text` (exclusive of its
 *  terminator), or -1 when there is none. Two word characters have to precede
 *  the mark, so "e.g." and "packageRules[0]." are not boundaries. */
function lastClauseBreak(text: string): number {
  let last = -1;
  for (const match of text.matchAll(/\w\w[.;!?](?=\s)/g)) {
    if (match.index !== undefined) {
      last = match.index + 2;
    }
  }
  return last;
}

/**
 * The first problem, short enough to sit inside a sentence. Prefers to end the
 * quote at the last sentence/clause boundary that fits the budget — validator
 * messages are typically a diagnosis followed by a remedy, and the digest only
 * needs the diagnosis (the clause it sits in already links to the Problems tab,
 * where the remedy and the curated translation live). Falls back to a word
 * boundary when there is no usable break, so a truncated message never ends
 * mid-token.
 *
 * Deliberately quotes the RAW validator message, not the engine's translated
 * explanation: `ErrorTranslation.explain()` returns multi-sentence paragraphs
 * (hundreds to ~1,300 characters) meant to render as a block beside the
 * message, and it covers only a curated handful of message families — sourcing
 * it here would make the paragraph read inconsistently by curation.
 */
function summarizeProblem(problem: DigestProblem): string {
  const raw = unpunctuated(problem.message) || unpunctuated(problem.topic);
  if (raw.length <= PROBLEM_SUMMARY_MAX) {
    return raw;
  }
  // `+ 1` so a terminator sitting exactly on the budget edge still counts —
  // the lookahead needs the whitespace that follows it.
  const clauseBreak = lastClauseBreak(raw.slice(0, PROBLEM_SUMMARY_MAX + 1));
  if (clauseBreak > PROBLEM_SUMMARY_MIN) {
    return `${raw.slice(0, clauseBreak).trimEnd()}…`;
  }
  const cut = raw.slice(0, PROBLEM_SUMMARY_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > PROBLEM_SUMMARY_MIN ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** "2 errors and 1 warning" — only the halves that are non-zero. */
function problemCounts(errors: number, warnings: number): string {
  const parts: string[] = [];
  if (errors > 0) {
    parts.push(count(errors, "error"));
  }
  if (warnings > 0) {
    parts.push(count(warnings, "warning"));
  }
  return list(parts);
}

function verdictClause(input: DigestInput): DigestClause {
  if (input.refused) {
    // Roadmap 029: the same framing as 023's HypotheticalBanner — a real run
    // would refuse the config, so everything the digest goes on to describe is
    // what Renovate *would* have done.
    return {
      id: "verdict",
      tone: "error",
      text: "⚠ A real Renovate run would refuse this config — what follows is the run it would have produced anyway.",
    };
  }
  if (input.errors > 0) {
    // Errors that are not validation errors (a preset that could not be
    // fetched, a stage that threw): the options themselves were accepted, but
    // the run did not complete.
    return {
      id: "verdict",
      tone: "warn",
      text: "Renovate accepted every option in this config, but the run did not complete cleanly.",
    };
  }
  if (input.warnings > 0) {
    // Roadmap 029's scope names three verdicts — errors vs. warnings vs. clean.
    // A warning run is not clean, so it must not open with the checkmark; the
    // phrase "Renovate accepted this config" is kept verbatim on purpose (the
    // CLI, MCP and e2e suites substring-match it across both variants). No
    // count here: `problemClause` owns the count and the link to it.
    return {
      id: "verdict",
      tone: "warn",
      text: "Renovate accepted this config, but flagged something worth reviewing.",
    };
  }
  return { id: "verdict", tone: "ok", text: "✓ Renovate accepted this config." };
}

function rewriteClause(migrations: DigestMigrations): DigestClause | null {
  if (migrations.count === 0) {
    return null;
  }
  const named = migrations.labels.length > 0 && migrations.count <= 2;
  return {
    id: "rewrites",
    tone: "plain",
    text: "It",
    link: {
      // Roadmap 075: the Rewrites tab retired into Pipeline's migrate stage,
      // which is where the stepper this clause offers now lives. The clause's
      // WORDING is unchanged — the CLI renders the same paragraph.
      tab: "pipeline",
      label: named
        ? `rewrote ${list(migrations.labels.map(code))}`
        : `rewrote ${count(migrations.count, "deprecated option")}`,
    },
    tail: " in your file.",
  };
}

/** "Your `a` and `b` entries" / "Your 7 extends entries". */
function extendsSubject(entries: string[]): string {
  if (entries.length <= 2) {
    return `Your ${list(entries.map(code))} ${entries.length === 1 ? "entry" : "entries"}`;
  }
  return `Your ${nf.format(entries.length)} \`extends\` entries`;
}

function presetClauses(presets: DigestPresets): DigestClause[] {
  const clauses: DigestClause[] = [];
  if (presets.entries.length === 0) {
    clauses.push({
      id: "presets",
      tone: "plain",
      text: "This config extends no presets, so nothing was pulled in from elsewhere.",
    });
  } else {
    const huge = presets.resolved > HUGE_EXPANSION;
    // At scale the honest story is the split: a handful of presets carry the
    // options, the bulk are package-grouping rules — a bare four-digit count
    // reads as "did I break something?" (011/016).
    const tail = huge
      ? presets.rules > 0
        ? ` — only ${nf.format(presets.optionSetting)} of which set options, the rest are package-grouping rules.`
        : ` — only ${nf.format(presets.optionSetting)} of which set any options.`
      : ".";
    clauses.push({
      id: "presets",
      tone: "plain",
      text: `${extendsSubject(presets.entries)} expanded into`,
      link: { tab: "presets", label: count(presets.resolved, "preset") },
      tail,
    });
  }
  if (presets.failed > 0) {
    clauses.push({
      id: "preset-failures",
      tone: "warn",
      text: "",
      link: { tab: "presets", label: `${count(presets.failed, "preset")} could not be fetched` },
      tail: " — provide their content by hand, or add a token for their host.",
    });
  }
  if (presets.injected > 0) {
    clauses.push({
      id: "preset-injections",
      tone: "plain",
      text: "",
      link: {
        tab: "presets",
        label: `${count(presets.injected, "preset")} used content you supplied`,
      },
      tail: " instead of being fetched.",
    });
  }
  return clauses;
}

function effectiveClauses(effective: DigestEffective): DigestClause[] {
  if (effective.options === null) {
    // Provenance is computed asynchronously; never quote a number that is not
    // known yet.
    return [
      { id: "effective", tone: "plain", text: "The effective options are still being counted…" },
    ];
  }
  const overridden = effective.overridden ?? 0;
  const clauses: DigestClause[] = [
    {
      id: "effective",
      tone: "plain",
      text: "Everything merged into",
      link: { tab: "effective", label: count(effective.options, "effective option") },
      tail: overridden > 0 ? "," : ".",
    },
  ];
  if (overridden > 0) {
    clauses.push({
      id: "overridden",
      tone: "plain",
      text: "",
      link: {
        tab: "effective",
        label: `${nf.format(overridden)} of them overridden along the way`,
      },
      tail: ".",
    });
  }
  return clauses;
}

function layerClause(layers: DigestLayers): DigestClause | null {
  const names: string[] = [];
  if (layers.global) {
    names.push("global");
  }
  if (layers.inherited) {
    names.push("inherited");
  }
  if (names.length === 0) {
    return null;
  }
  // Effective config, not Pipeline: a layer's effect is only legible as
  // per-key provenance, which is where a reader can act on it.
  return {
    id: "layers",
    tone: "plain",
    text: "Your self-hosted",
    link: {
      tab: "effective",
      label: `${list(names)} config ${names.length === 1 ? "layer" : "layers"}`,
    },
    tail: " merged in underneath the repo config.",
  };
}

function problemClause(input: DigestInput): DigestClause | null {
  const total = input.errors + input.warnings;
  if (total === 0) {
    return null;
  }
  const first = input.firstProblem;
  const heading = `${problemCounts(input.errors, input.warnings)}${first ? `: ${summarizeProblem(first)}` : ""}`;
  const action = input.errors > 0 ? "fix" : "review";
  return {
    id: "problems",
    tone: input.errors > 0 ? "error" : "warn",
    text: `${heading} —`,
    link: { tab: "problems", label: `${action} ${total === 1 ? "it" : "them"}` },
    tail: ".",
  };
}

/**
 * The ordered clauses describing a run: verdict, what was rewritten, what the
 * `extends` cost, what merged, which layers were in play, what needs attention.
 * A fatal parse error short-circuits everything — there is no run to narrate.
 */
export function buildRunDigest(input: DigestInput): DigestClause[] {
  if (input.fatalParse) {
    return [
      {
        id: "fatal",
        tone: "error",
        text: `Renovate could not read this config: ${unpunctuated(input.fatalParse)}.`,
        link: { tab: "problems", label: "See the parse error" },
        tail: ".",
      },
    ];
  }
  const clauses: DigestClause[] = [verdictClause(input)];
  const rewrites = rewriteClause(input.migrations);
  if (rewrites) {
    clauses.push(rewrites);
  }
  clauses.push(...presetClauses(input.presets), ...effectiveClauses(input.effective));
  const layers = layerClause(input.layers);
  if (layers) {
    clauses.push(layers);
  }
  const problems = problemClause(input);
  if (problems) {
    clauses.push(problems);
  }
  return clauses;
}

/** A single clause as plain text (its link label reads as ordinary prose). */
export function clauseText(clause: DigestClause): string {
  const head = [clause.text, clause.link?.label].filter((part) => part).join(" ");
  return `${head}${clause.tail ?? ""}`;
}

/** The whole digest as one paragraph of plain text — what the tests snapshot
 *  and what the rendered prose reads as, minus the links. */
export function digestText(clauses: DigestClause[]): string {
  return clauses.map(clauseText).join(" ");
}
