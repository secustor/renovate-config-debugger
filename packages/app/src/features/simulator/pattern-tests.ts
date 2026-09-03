import type {
  ParsedPattern,
  PatternListMatch,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { splitValues } from "./form";
import { MAX_PATTERN_TESTS } from "@/lib/input-schemas";
import type { SharePatternTest } from "@/lib/input-schemas-zod";
import type { PatternInput, PatternTest, PinnedTest } from "@/types/simulator";
import type { RepoDepsView } from "@/types/repo";

/**
 * Roadmap 094 — the pattern tests' pure half: what a test is on the wire, how
 * one is evaluated (given the engine's matcher), and the sentences the card
 * prints about it. DOM-free, engine-free — the matcher is INJECTED, so the
 * unit tests hand in a stub and the component hands in Renovate's own.
 */

/** The engine's `explainPatternMatch`, as the functions here take it. */
export type ExplainPatterns = (patterns: readonly string[], input: string) => PatternListMatch;

/** The engine's matcher surface, as the card and the evaluation take it —
 *  `null` while the engine chunk is still loading. */
export interface PatternMatcher {
  explain: ExplainPatterns;
  parse: (pattern: string) => ParsedPattern;
  /** The `match*` list options the pinned Renovate has. */
  options: string[];
}

export function newPatternTest(id: string): PatternTest {
  return { id, option: "", patterns: [], inputs: [] };
}

/** The encode side: everything but the session id. */
export function patternTestShareFields(test: PatternTest): SharePatternTest {
  return {
    option: test.option,
    patterns: [...test.patterns],
    inputs: test.inputs.map((input) => ({ value: input.value, expect: input.expect })),
  };
}

/** The decode side: the link's tests with ids minted here, capped like pins. */
export function patternTestsFromShare(
  shared: readonly SharePatternTest[],
  nextId: () => string,
): PatternTest[] {
  return shared.slice(0, MAX_PATTERN_TESTS).map((test) => ({
    id: nextId(),
    option: test.option,
    patterns: [...test.patterns],
    inputs: test.inputs.map((input) => ({ value: input.value, expect: input.expect })),
  }));
}

/** The chips under a pattern — how upstream will read it, said before the
 *  reader finds out the hard way. */
export function patternChips(parsed: ParsedPattern): string[] {
  if (parsed.kind === "any") {
    return ["matches everything"];
  }
  const chips = [parsed.kind === "regex" ? "regex" : "glob"];
  chips.push(parsed.caseInsensitive ? "Aa ignored" : "Aa exact");
  if (parsed.negative) {
    chips.push("! negative");
  }
  if (parsed.invalid) {
    chips.push("invalid regex");
  }
  return chips;
}

export interface InputVerdict extends PatternInput {
  /** Upstream's answer for this input. */
  matches: boolean;
  /** `matches` agrees with what the reader expected. */
  pass: boolean;
  /** The one-line reason under the row, or null when the mark says it all. */
  why: string | null;
}

export interface PatternVerdict {
  pattern: string;
  parsed: ParsedPattern;
  chips: string[];
  /** Positive: inputs it matched. Negative: inputs it blocks. */
  hits: number;
  /** The count as the card prints it — `3/5`, or `blocks 1`. */
  count: string;
  /** A positive pattern that matched nothing while there were inputs to match. */
  dead: boolean;
}

export type PatternTestTone = "ok" | "error" | "pending";

export interface PatternTestEvaluation {
  inputs: InputVerdict[];
  patterns: PatternVerdict[];
  passCount: number;
  tone: PatternTestTone;
  /** The header's sentence: `3 of 4 expected`, or `no inputs yet`. */
  summary: string;
}

function whyFor(match: PatternListMatch): string | null {
  const invalid = match.entries.find((entry) => entry.invalid);
  if (invalid) {
    return `${invalid.pattern} is not a valid regex — Renovate would reject this config`;
  }
  if (match.reason === "blocked") {
    const blocker = match.entries.find((entry) => entry.negative && entry.hit);
    return blocker ? `blocked by ${blocker.pattern}` : null;
  }
  const suggestion = match.entries.find((entry) => entry.suggestion !== undefined)?.suggestion;
  return suggestion === undefined ? null : `no match — try ${suggestion}`;
}

export function evaluatePatternTest(
  matcher: Pick<PatternMatcher, "explain" | "parse">,
  test: Pick<PatternTest, "patterns" | "inputs">,
): PatternTestEvaluation {
  const inputs = test.inputs.map((input) => {
    const match = matcher.explain(test.patterns, input.value);
    return {
      value: input.value,
      expect: input.expect,
      matches: match.matches,
      pass: match.matches === input.expect,
      why: whyFor(match),
      entries: match.entries,
    };
  });
  const patterns = test.patterns.map((pattern, j) => {
    const parsed = matcher.parse(pattern);
    const hits = inputs.filter((input) => input.entries[j]?.hit === true).length;
    return {
      pattern,
      parsed,
      chips: patternChips(parsed),
      hits,
      count: parsed.negative ? `blocks ${hits}` : `${hits}/${test.inputs.length}`,
      dead: !parsed.negative && parsed.kind !== "any" && hits === 0 && test.inputs.length > 0,
    };
  });
  const passCount = inputs.filter((input) => input.pass).length;
  const tone: PatternTestTone =
    inputs.length === 0 ? "pending" : passCount === inputs.length ? "ok" : "error";
  return {
    inputs: inputs.map(({ entries: _entries, ...verdict }) => verdict),
    patterns,
    passCount,
    tone,
    summary: inputs.length === 0 ? "no inputs yet" : `${passCount} of ${inputs.length} expected`,
  };
}

/** What the card offers to seed a new input's expectation with: upstream's
 *  current answer, so a freshly typed input starts as a passing assertion the
 *  reader then flips if that is not what they meant. */
export function expectationFor(
  explain: ExplainPatterns,
  patterns: string[],
  value: string,
): boolean {
  return explain(patterns, value).matches;
}

/**
 * Where the "add the N values from your last run" offer looks, per option:
 * the pinned descriptors (every field a pin can carry) and the loaded
 * repository's extraction. Deduplicated, in first-seen order. Every option
 * the engine lists has a row here so the offer can never be silently absent
 * for one of them; an option with nothing to draw on simply seeds nothing.
 */
export interface SeedSources {
  pins: readonly PinnedTest[];
  repoDeps: RepoDepsView;
  result: TraceResult;
}

function pinField(pins: readonly PinnedTest[], key: keyof PinnedTest["form"]): string[] {
  return pins.flatMap((pin) => splitValues(pin.form[key]));
}

function repoFill(
  repoDeps: RepoDepsView,
  key: "datasource" | "depType" | "registryUrls",
): string[] {
  return repoDeps.deps.flatMap((dep) => splitValues(dep.fill[key] ?? ""));
}

export function seedValuesFor(option: string, { pins, repoDeps, result }: SeedSources): string[] {
  const baseBranches = result.finalConfig?.baseBranches;
  const byOption: Record<string, string[]> = {
    matchBaseBranches: [
      ...pinField(pins, "baseBranch"),
      ...(Array.isArray(baseBranches)
        ? baseBranches.filter((branch): branch is string => typeof branch === "string")
        : []),
    ],
    matchCategories: pinField(pins, "categories"),
    matchDatasources: [...pinField(pins, "datasource"), ...repoFill(repoDeps, "datasource")],
    matchDepNames: [...pinField(pins, "depName"), ...repoDeps.deps.map((dep) => dep.depName)],
    matchDepTypes: [...pinField(pins, "depType"), ...repoFill(repoDeps, "depType")],
    matchFileNames: [
      ...pinField(pins, "packageFile"),
      ...repoDeps.deps.map((dep) => dep.packageFile),
    ],
    matchManagers: [
      ...pinField(pins, "manager"),
      ...repoDeps.files.flatMap((file) => file.managers),
    ],
    matchPackageNames: [
      ...pinField(pins, "packageName"),
      ...repoDeps.deps.map((dep) => dep.fill.packageName ?? dep.depName),
    ],
    matchRegistryUrls: [...pinField(pins, "registryUrls"), ...repoFill(repoDeps, "registryUrls")],
    matchRepositories: [...pinField(pins, "repository"), repoDeps.repo],
    matchSourceUrls: pinField(pins, "sourceUrl"),
  };
  return [...new Set((byOption[option] ?? []).map((v) => v.trim()).filter((v) => v !== ""))];
}
