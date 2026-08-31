import { EMPTY_FORM, QUICK_FILLS } from "./form";
import { isPlainObject } from "@/lib/input-schemas";
import { samePinForm } from "./pins";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 091 — the starter pins: up to two descriptors derived from the
 * reader's OWN `packageRules`, seeded once when the Tests tab would otherwise
 * open empty.
 *
 * The empty state says what a pin is; a starter shows one. Each is built to
 * FIRE one of the rules the reader wrote — `matchManagers: ["npm"]` +
 * `matchUpdateTypes: ["minor"]` becomes an npm minor update, so the card that
 * lands says "grouped: npm minor" in the reader's own words rather than in
 * ours.
 *
 * The one rule this file obeys: **never guess.** A descriptor is synthesized
 * only when every matcher on the rule can be satisfied exactly; a rule
 * carrying anything else (`matchCurrentVersion` ranges, `matchSourceUrls`,
 * a glob-only `matchPackageNames`) is skipped rather than approximated,
 * because a starter that does NOT fire the rule it was derived from teaches
 * the reader something false.
 *
 * Pure and DOM-free — the app layer decides WHEN to seed (`use-starter-pins`),
 * this decides what.
 */

/** Two, as the design draws it: enough to show the grammar, few enough that
 *  the reader's own first pin is still the point of the tab. */
export const MAX_STARTER_PINS = 2;

/**
 * The matchers a synthetic descriptor can satisfy exactly. Every other
 * `match*` key disqualifies its rule — the list is the honesty guarantee, so
 * it grows only when a matcher gains a field the form can actually set.
 */
const SATISFIABLE_MATCHERS = new Set([
  "matchManagers",
  "matchDatasources",
  "matchPackageNames",
  "matchDepNames",
  "matchDepTypes",
  "matchUpdateTypes",
]);

/** The update types a version pair can express. `pin`/`digest`/… are real
 *  types, but nothing in a two-version descriptor implies them. */
const SYNTHESIZABLE_UPDATE_TYPES = ["major", "minor", "patch"];

/** What a descriptor looks like when the rule names a manager we hold no
 *  sample for: a neutral package on a clean semver base. */
const NEUTRAL_SAMPLE: Partial<FormState> = {
  packageName: "example-package",
  currentValue: "1.2.3",
  newValue: "1.3.0",
  updateType: "minor",
};

/** A rule that names no ecosystem at all (`matchUpdateTypes: ["patch"]` and
 *  nothing else) still has to become a recognizable update; npm is the app's
 *  own first quick-fill, so it is the one the reader has already seen. */
function defaultSample(): Partial<FormState> {
  return QUICK_FILLS.find(({ fill }) => fill.manager === "npm")?.fill ?? NEUTRAL_SAMPLE;
}

function ruleOf(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

/** A matcher's values, as strings — null when it isn't a list of them (a
 *  matcher we cannot read is a matcher we cannot satisfy). */
function matcherValues(value: unknown): string[] | null {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }
  return value as string[];
}

/**
 * The first value that names ONE thing: not a negation (`!x`), not a regex
 * (`/x/`), not a glob (`@types/**`). Renovate's own matcher grammar — a
 * pattern describes a set, and a starter has to be a member of it, which only
 * a literal guarantees.
 */
function firstLiteral(values: string[] | null): string | null {
  if (values === null) {
    return null;
  }
  return values.find((v) => v !== "" && !/[*?[\]{}]/.test(v) && !/^[!/]/.test(v)) ?? null;
}

/** The one value a matcher can be satisfied with — null both when the rule
 *  does not carry that matcher at all and when nothing on it is a literal. The
 *  caller tells the two apart with `key in rule`. */
function ruleLiteral(rule: Record<string, unknown>, key: string): string | null {
  return key in rule ? firstLiteral(matcherValues(rule[key])) : null;
}

/** The quick-fill that already describes this ecosystem — the samples are the
 *  app's, not a second table that could drift from them. */
function sampleFor(manager: string | null, datasource: string | null): Partial<FormState> | null {
  if (manager !== null) {
    return QUICK_FILLS.find(({ fill }) => fill.manager === manager)?.fill ?? null;
  }
  if (datasource !== null) {
    return QUICK_FILLS.find(({ fill }) => fill.datasource === datasource)?.fill ?? null;
  }
  return null;
}

function bumpNumericPrefix(segment: string): string | null {
  const digits = /^\d+/.exec(segment);
  if (!digits) {
    return null;
  }
  return `${Number(digits[0]) + 1}${segment.slice(digits[0].length)}`;
}

/**
 * The other end of a version move of the asked-for kind, or null when this
 * version cannot express one — `20-alpine` has no minor to bump, and inventing
 * `20.1-alpine` would be a tag that does not exist.
 */
export function nextVersion(current: string, updateType: string): string | null {
  const parts = current.split(".");
  const index = updateType === "major" ? 0 : updateType === "minor" ? 1 : 2;
  if (index >= parts.length) {
    return null;
  }
  const head = parts.slice(0, index);
  const bumped = bumpNumericPrefix(parts[index] ?? "");
  if (bumped === null || head.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  // Everything below the bumped position resets, which is what a version move
  // of that kind actually looks like.
  const tail = parts.slice(index + 1).map(() => "0");
  return [...head, bumped, ...tail].join(".");
}

/**
 * One rule → one descriptor that fires it, or null when it cannot be built.
 * Exported for the tests; the seeding path goes through `deriveStarterPins`.
 */
export function starterFormForRule(value: unknown): FormState | null {
  const rule = ruleOf(value);
  if (rule === null) {
    return null;
  }
  const matchers = Object.keys(rule).filter((key) => key.startsWith("match"));
  // Nothing to demonstrate: a rule with no matchers fires on every update, so
  // whatever else gets pinned already exercises it.
  if (matchers.length === 0 || matchers.some((key) => !SATISFIABLE_MATCHERS.has(key))) {
    return null;
  }

  const manager = ruleLiteral(rule, "matchManagers");
  const datasource = ruleLiteral(rule, "matchDatasources");
  const depName = ruleLiteral(rule, "matchDepNames");
  const depType = ruleLiteral(rule, "matchDepTypes");
  // Falls back to the dep name, so a rule naming only dep names still puts a
  // package on the descriptor.
  const packageName = ruleLiteral(rule, "matchPackageNames") ?? depName;
  // The "never guess" rule: a matcher the rule DOES carry but nothing literal
  // could satisfy skips the rule rather than pinning something it won't fire
  // on.
  for (const [key, named] of [
    ["matchManagers", manager],
    ["matchDatasources", datasource],
    ["matchPackageNames", packageName],
    ["matchDepNames", depName],
    ["matchDepTypes", depType],
  ] as const) {
    if (key in rule && named === null) {
      return null;
    }
  }

  const sample = sampleFor(manager, datasource);
  // A datasource with no manager we can pair it with is the case the doc names
  // explicitly: a descriptor naming only a datasource is not an update anyone
  // recognizes, and guessing the manager would guess the match.
  if (sample === null && manager === null && datasource !== null) {
    return null;
  }
  const base = sample ?? (manager === null ? defaultSample() : NEUTRAL_SAMPLE);

  // null = the rule does not ask for an update type at all, and the sample's
  // own kind stands; a list (even an unreadable one, as []) has to be met.
  const asked = "matchUpdateTypes" in rule ? (matcherValues(rule.matchUpdateTypes) ?? []) : null;
  const updateType = asked
    ? (asked.find((type) => SYNTHESIZABLE_UPDATE_TYPES.includes(type)) ?? null)
    : (base.updateType ?? null);
  if (updateType === null) {
    return null;
  }
  const currentValue = base.currentValue ?? "";
  // The sample's own pair when it is already the asked-for kind (`lodash
  // 4.17.20 → 4.17.21` IS a patch), a synthesized one otherwise.
  const newValue =
    updateType === base.updateType
      ? (base.newValue ?? "")
      : (nextVersion(currentValue, updateType) ?? "");
  if (currentValue === "" || newValue === "") {
    return null;
  }

  return {
    ...EMPTY_FORM,
    manager: manager ?? base.manager ?? "",
    datasource: datasource ?? base.datasource ?? "",
    packageFile: base.packageFile ?? "",
    packageName: packageName ?? base.packageName ?? "",
    depName: depName ?? "",
    depType: depType ?? base.depType ?? "",
    versioning: base.versioning ?? "",
    currentValue,
    newValue,
    updateType,
  };
}

/**
 * The starter pins for a run: at most {@link MAX_STARTER_PINS} descriptors,
 * one per rule, in the order the rules merged.
 *
 * `rules` are the reader's OWN entries of the resolved `packageRules` — the
 * caller filters by provenance, because a starter derived from a preset's rule
 * would demonstrate a decision the reader did not make.
 */
export function deriveStarterPins(rules: readonly unknown[]): FormState[] {
  const forms: FormState[] = [];
  for (const rule of rules) {
    if (forms.length >= MAX_STARTER_PINS) {
      break;
    }
    const form = starterFormForRule(rule);
    // Two rules can describe the same update (`matchManagers: ["npm"]` twice
    // over); the second one adds a row that says nothing new.
    if (form !== null && !forms.some((existing) => samePinForm(existing, form))) {
      forms.push(form);
    }
  }
  return forms;
}
