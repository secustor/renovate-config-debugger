import { describe, expect, test } from "vitest";
import { getOptionIndex, type OptionDoc, renovateVersion } from "@renovate-config-debugger/engine";
import { optionDocLines } from "./option-doc";

const { options } = getOptionIndex();

function linesFor(name: string): string[] {
  const doc = options.get(name);
  if (!doc) {
    throw new Error(`no option ${name}`);
  }
  return optionDocLines(doc, renovateVersion);
}

/**
 * The failure this file exists to prevent: a fact reaches `--format json` and
 * silently never reaches the reader. Each entry pairs a flag on `OptionDoc`
 * with the substring its line must contain.
 */
const FLAG_LINES: readonly {
  flag: (doc: OptionDoc) => unknown;
  contains: string;
}[] = [
  { flag: (d) => d.patternMatch, contains: "patterns:" },
  { flag: (d) => d.supportsTemplating, contains: "templating: supported" },
  { flag: (d) => d.allowNegative, contains: "negative integers: allowed" },
  { flag: (d) => d.allowString, contains: "string shorthand:" },
  { flag: (d) => d.freeChoice, contains: "children not validated" },
  { flag: (d) => d.mergeable, contains: "mergeable:" },
  { flag: (d) => d.inheritConfigSupport, contains: "inheritable:" },
  { flag: (d) => d.requiredIf, contains: "required when:" },
  { flag: (d) => d.stage, contains: "stage:" },
  { flag: (d) => d.format, contains: "format: regex" },
  { flag: (d) => d.childOptions, contains: "container:" },
  { flag: (d) => d.globalOnly, contains: "self-hosted (global) config only" },
  { flag: (d) => d.deprecationMsg, contains: "deprecated:" },
  { flag: (d) => d.experimental, contains: "experimental:" },
];

describe("optionDocLines", () => {
  test("every flag the engine forwards reaches the pretty rendering", () => {
    for (const doc of options.values()) {
      const text = optionDocLines(doc, renovateVersion).join("\n");
      // Filtered, not guarded: the rows that apply to this option are chosen
      // first, so every `expect` that runs is one this option really owes.
      for (const { contains } of FLAG_LINES.filter((line) => line.flag(doc))) {
        expect(text, `${doc.name}: ${contains}`).toContain(contains);
      }
    }
  });

  test("every option states its placement, and 'anywhere' is a statement", () => {
    let unrestricted = 0;
    for (const doc of options.values()) {
      const text = optionDocLines(doc, renovateVersion).join("\n");
      // One assertion, with the expected line chosen by kind — the
      // unrestricted case simply expects MORE of the same string, so the
      // conditional second `expect` was never needed.
      const isUnrestricted = doc.placement.kind === "unrestricted";
      if (isUnrestricted) {
        unrestricted += 1;
      }
      expect(text, doc.name).toContain(isUnrestricted ? "placement: no restriction" : "placement:");
    }
    expect(unrestricted).toBeGreaterThan(300);
  });

  test("the header names the pinned Renovate, and the citation is version-pinned", () => {
    const lines = linesFor("minimumReleaseAge");
    expect(lines[0]).toBe(`minimumReleaseAge (string) — Renovate ${renovateVersion}`);
    expect(lines.at(-1)).toContain(`renovate/v/${renovateVersion}`);
  });

  test("a container names its children and says what the list is NOT", () => {
    const text = linesFor("packageRules").join("\n");
    expect(text).toContain("options are restricted to it");
    expect(text).toContain("any option with no placement restriction may also appear here");
    expect(text).toContain("+"); // 32 children, 8 shown
    expect(text).toContain("--format json for all");
  });

  test("129 parents do not become a wall of text", () => {
    const lines = linesFor("enabled");
    expect(lines.length).toBeLessThanOrEqual(12);
    const placement = lines.find((line) => line.startsWith("placement:")) ?? "";
    expect(placement).toContain("the top level, or inside");
    expect(placement).toContain("+120 more");
    expect(placement.length).toBeLessThan(220);
  });

  test("requiredIf is rendered with the caveat that nothing enforces it", () => {
    const text = linesFor("fileFormat").join("\n");
    expect(text).toContain('required when: customType = "jsonata"');
    expect(text).toContain("does not enforce it");
  });

  test("experimental options link their tracking issues", () => {
    const text = linesFor("configMigration").join("\n");
    expect(text).toContain("tracking: https://github.com/renovatebot/renovate/issues/16359");
  });
});
