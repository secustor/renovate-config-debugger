import { describe, expect, test } from "vitest";
import { buildRunDigest, type DigestClause, type DigestInput, digestText } from "./run-digest";

/**
 * Roadmap 029: the digest generator, branch by branch. Inputs are hand-built
 * `DigestInput` objects — the whole point of the module being pure is that no
 * test here has to run the real pipeline to state what a run shape should read
 * as. Two canonical shapes (a clean `config:recommended` run, a refused one)
 * are snapshotted as whole paragraphs; everything else asserts the one clause
 * it is about.
 */

/** A clean, small run — every test starts here and changes one thing. */
function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    refused: false,
    errors: 0,
    warnings: 0,
    migrations: { count: 0, labels: [] },
    presets: {
      entries: ["config:recommended"],
      resolved: 4,
      optionSetting: 2,
      rules: 1,
      failed: 0,
      injected: 0,
    },
    effective: { options: 12, overridden: 0 },
    layers: { global: false, inherited: false },
    ...overrides,
  };
}

function clause(clauses: DigestClause[], id: string): DigestClause {
  const found = clauses.find((c) => c.id === id);
  if (!found) {
    // Throwing (rather than `expect(...).toBeDefined()` plus an assertion)
    // both fails the test with the same message and narrows the return type.
    throw new Error(`no "${id}" clause in: ${clauses.map((c) => c.id).join(", ")}`);
  }
  return found;
}

function ids(clauses: DigestClause[]): string[] {
  return clauses.map((c) => c.id);
}

describe("verdict", () => {
  test("a clean run opens with the accepted verdict", () => {
    const clauses = buildRunDigest(input());
    expect(clause(clauses, "verdict")).toMatchObject({
      tone: "ok",
      text: "✓ Renovate accepted this config.",
    });
    expect(ids(clauses)).not.toContain("problems");
  });

  test("validation errors open with the 023 refusal framing", () => {
    const clauses = buildRunDigest(
      input({
        refused: true,
        errors: 1,
        firstProblem: {
          severity: "error",
          topic: "Configuration Error",
          message: "Invalid configuration option: `automerg`",
        },
      }),
    );
    const verdict = clause(clauses, "verdict");
    expect(verdict.tone).toBe("error");
    // The 023 HypotheticalBanner's wording, which this must never contradict.
    expect(verdict.text).toMatch(/a real Renovate run would refuse this config/i);
    // …and the run is still described afterwards, hypothetically.
    expect(ids(clauses)).toEqual(["verdict", "presets", "effective", "problems"]);
  });

  test("a run with only warnings is accepted, but not with a checkmark", () => {
    const clauses = buildRunDigest(
      input({
        warnings: 1,
        firstProblem: {
          severity: "warning",
          topic: "Configuration Warning",
          message: "Invalid schedule: `before 6am on monday` may never match.",
        },
      }),
    );
    const verdict = clause(clauses, "verdict");
    expect(verdict.tone).toBe("warn");
    expect(verdict.text).not.toContain("✓");
    // The phrase the CLI, MCP and e2e suites substring-match — it has to
    // survive both acceptance variants, or those assertions go vacuous.
    expect(verdict.text).toContain("Renovate accepted this config");
    // The two clauses stay independently composed: the verdict says there is
    // something to look at, the tail still counts it and links to it.
    expect(ids(clauses)).toContain("problems");
  });

  test("the warnings verdict carries no count — the problems tail owns that", () => {
    const text = (warnings: number): string =>
      clause(
        buildRunDigest(
          input({
            warnings,
            firstProblem: { severity: "warning", topic: "Configuration Warning", message: "M" },
          }),
        ),
        "verdict",
      ).text;
    expect(text(3)).toBe(text(1));
  });

  test("errors that are not validation errors do not claim the config was refused", () => {
    const clauses = buildRunDigest(
      input({
        errors: 2,
        presets: { ...input().presets, failed: 2 },
        firstProblem: { severity: "error", topic: "Preset", message: "Preset not found" },
      }),
    );
    const verdict = clause(clauses, "verdict");
    expect(verdict.tone).toBe("warn");
    expect(verdict.text).not.toContain("refuse");
    expect(verdict.text).toContain("did not complete cleanly");
  });
});

describe("fatal parse error", () => {
  test("is the only thing the digest says", () => {
    const clauses = buildRunDigest(
      input({
        fatalParse: "Invalid JSON (parsing failed).",
        errors: 1,
        migrations: { count: 3, labels: [] },
      }),
    );
    expect(ids(clauses)).toEqual(["fatal"]);
    expect(clauses[0]).toMatchObject({ tone: "error", link: { tab: "problems" } });
    expect(digestText(clauses)).toBe(
      "Renovate could not read this config: Invalid JSON (parsing failed). See the parse error.",
    );
  });
});

describe("trailing-punctuation trim", () => {
  // Regression for a polynomial-backtracking regex (CodeQL js/polynomial-redos):
  // a long interior whitespace run must not blow up the trim.
  test("stays linear on pathological messages", () => {
    const clauses = buildRunDigest(
      input({ fatalParse: `Invalid${"\t".repeat(100_000)}JSON. `, errors: 1 }),
    );
    expect(digestText(clauses)).toBe(
      `Renovate could not read this config: Invalid${"\t".repeat(100_000)}JSON. See the parse error.`,
    );
  }, 2000);
});

describe("migrations", () => {
  test("0 rewrites omit the clause entirely", () => {
    expect(ids(buildRunDigest(input()))).not.toContain("rewrites");
  });

  test("1–2 rewrites name the options", () => {
    const one = clause(
      buildRunDigest(input({ migrations: { count: 1, labels: ["semanticCommits"] } })),
      "rewrites",
    );
    expect(one.link?.label).toBe("rewrote `semanticCommits`");
    expect(one.link?.tab).toBe("rewrites");

    const two = clause(
      buildRunDigest(
        input({
          migrations: {
            count: 2,
            labels: ["packageNames → matchPackageNames", "stabilityDays → minimumReleaseAge"],
          },
        }),
      ),
      "rewrites",
    );
    expect(two.link?.label).toBe(
      "rewrote `packageNames → matchPackageNames` and `stabilityDays → minimumReleaseAge`",
    );
  });

  test("3 or more rewrites are counted, not listed", () => {
    const many = clause(
      buildRunDigest(input({ migrations: { count: 7, labels: [] } })),
      "rewrites",
    );
    expect(many.link?.label).toBe("rewrote 7 deprecated options");
  });
});

describe("preset expansion", () => {
  test("no extends entries says so instead of quoting a zero", () => {
    const clauses = buildRunDigest(
      input({
        presets: { entries: [], resolved: 0, optionSetting: 0, rules: 0, failed: 0, injected: 0 },
      }),
    );
    const presets = clause(clauses, "presets");
    expect(presets.link).toBeUndefined();
    expect(presets.text).toBe(
      "This config extends no presets, so nothing was pulled in from elsewhere.",
    );
  });

  test("a small expansion is a plain count", () => {
    const presets = clause(buildRunDigest(input()), "presets");
    expect(presets.text).toBe("Your `config:recommended` entry expanded into");
    expect(presets.link).toEqual({ tab: "presets", label: "4 presets" });
    expect(presets.tail).toBe(".");
  });

  test("a huge expansion gets the grouping-rules framing and locale separators", () => {
    const presets = clause(
      buildRunDigest(
        input({
          presets: {
            entries: ["config:recommended", ":dependencyDashboard"],
            resolved: 1076,
            optionSetting: 14,
            rules: 902,
            failed: 0,
            injected: 0,
          },
        }),
      ),
      "presets",
    );
    expect(presets.text).toBe(
      "Your `config:recommended` and `:dependencyDashboard` entries expanded into",
    );
    expect(presets.link?.label).toBe("1,076 presets");
    expect(presets.tail).toBe(
      " — only 14 of which set options, the rest are package-grouping rules.",
    );
  });

  test("more than two entries are counted rather than listed", () => {
    const presets = clause(
      buildRunDigest(
        input({
          presets: {
            entries: ["config:recommended", ":dependencyDashboard", "local>org/renovate", "npm>x"],
            resolved: 60,
            optionSetting: 3,
            rules: 0,
            failed: 0,
            injected: 0,
          },
        }),
      ),
      "presets",
    );
    expect(presets.text).toBe("Your 4 `extends` entries expanded into");
    // No packageRules in the expansion — the framing must not invent them.
    expect(presets.tail).toBe(" — only 3 of which set any options.");
  });

  test("failed fetches get their own warn clause pointing at the Presets tab", () => {
    const clauses = buildRunDigest(
      input({ errors: 2, presets: { ...input().presets, failed: 2 } }),
    );
    const failures = clause(clauses, "preset-failures");
    expect(failures.tone).toBe("warn");
    expect(failures.link).toEqual({ tab: "presets", label: "2 presets could not be fetched" });
    expect(failures.tail).toContain("add a token");
  });

  test("user-supplied preset content is noted", () => {
    const injected = clause(
      buildRunDigest(input({ presets: { ...input().presets, injected: 1 } })),
      "preset-injections",
    );
    expect(injected.link?.label).toBe("1 preset used content you supplied");
  });
});

describe("effective config", () => {
  test("quotes the option count and the overridden count, both linked", () => {
    const clauses = buildRunDigest(input({ effective: { options: 23, overridden: 6 } }));
    expect(clause(clauses, "effective").link).toEqual({
      tab: "effective",
      label: "23 effective options",
    });
    expect(clause(clauses, "overridden").link).toEqual({
      tab: "effective",
      label: "6 of them overridden along the way",
    });
  });

  test("no overrides means no override clause and a closing full stop", () => {
    const clauses = buildRunDigest(input({ effective: { options: 23, overridden: 0 } }));
    expect(ids(clauses)).not.toContain("overridden");
    expect(clause(clauses, "effective").tail).toBe(".");
  });

  test("never guesses a count provenance has not produced yet", () => {
    const clauses = buildRunDigest(input({ effective: { options: null, overridden: null } }));
    const effective = clause(clauses, "effective");
    expect(effective.link).toBeUndefined();
    expect(effective.text).toContain("still being counted");
  });
});

describe("layers", () => {
  test("an active layer stack is named", () => {
    expect(
      clause(buildRunDigest(input({ layers: { global: true, inherited: true } })), "layers").link
        ?.label,
    ).toBe("global and inherited config layers");
    expect(
      clause(buildRunDigest(input({ layers: { global: true, inherited: false } })), "layers").link
        ?.label,
    ).toBe("global config layer");
  });

  test("no layers, no clause", () => {
    expect(ids(buildRunDigest(input()))).not.toContain("layers");
  });
});

describe("problems tail", () => {
  test("a lone warning is summarized and linked", () => {
    const problems = clause(
      buildRunDigest(
        input({
          warnings: 1,
          firstProblem: {
            severity: "warning",
            topic: "Configuration Warning",
            message: "Invalid schedule: `before 6am on monday` may never match.",
          },
        }),
      ),
      "problems",
    );
    expect(problems.tone).toBe("warn");
    expect(problems.text).toBe(
      "1 warning: Invalid schedule: `before 6am on monday` may never match —",
    );
    expect(problems.link).toEqual({ tab: "problems", label: "review it" });
  });

  test("errors and warnings are counted together and read as errors", () => {
    const problems = clause(
      buildRunDigest(
        input({
          refused: true,
          errors: 2,
          warnings: 1,
          firstProblem: { severity: "error", topic: "Config error", message: "Invalid option" },
        }),
      ),
      "problems",
    );
    expect(problems.tone).toBe("error");
    expect(problems.text).toBe("2 errors and 1 warning: Invalid option —");
    expect(problems.link?.label).toBe("fix them");
  });

  test("a two-sentence message is cut at its clause boundary, keeping the diagnosis", () => {
    const problems = clause(
      buildRunDigest(
        input({
          warnings: 1,
          firstProblem: {
            severity: "warning",
            topic: "Configuration Warning",
            // Upstream's real wording, per the message shape documented in
            // packages/engine/src/error-translations.ts (redundant-glob-star).
            message:
              "packageRules[0].matchPackageNames: Your input contains * or ** along with other patterns. Please remove them, as * or ** matches all patterns.",
          },
        }),
      ),
      "problems",
    );
    expect(problems.text).toContain("other patterns… —");
    // The remedy half is what the Problems tab is for; quoting a slice of it
    // is what produced the old mid-clause cut.
    expect(problems.text).not.toContain("as * or…");
  });

  test("a long message with no clause break falls back to a word boundary", () => {
    const problems = clause(
      buildRunDigest(
        input({
          warnings: 1,
          firstProblem: {
            severity: "warning",
            topic: "Configuration Warning",
            message: `Invalid configuration option ${"verylongtoken ".repeat(20)}end`,
          },
        }),
      ),
      "problems",
    );
    expect(problems.text.length).toBeLessThan(140);
    expect(problems.text).toContain("…");
    expect(problems.text).not.toContain("verylongtok —");
  });
});

describe("assembled paragraphs", () => {
  /** The canonical shape: a run Renovate accepted with one warning, over the
   *  app's own default config. */
  test("accepted run with one warning and a huge expansion", () => {
    const clauses = buildRunDigest(
      input({
        warnings: 1,
        firstProblem: {
          severity: "warning",
          topic: "Configuration Warning",
          message: "Invalid schedule: `before 6am on monday` may never match",
        },
        migrations: { count: 2, labels: ["packageNames → matchPackageNames", "stabilityDays"] },
        presets: {
          entries: ["config:recommended", ":dependencyDashboard"],
          resolved: 1076,
          optionSetting: 14,
          rules: 902,
          failed: 0,
          injected: 0,
        },
        effective: { options: 23, overridden: 6 },
      }),
    );
    expect(digestText(clauses)).toMatchInlineSnapshot(
      `"Renovate accepted this config, but flagged something worth reviewing. It rewrote \`packageNames → matchPackageNames\` and \`stabilityDays\` in your file. Your \`config:recommended\` and \`:dependencyDashboard\` entries expanded into 1,076 presets — only 14 of which set options, the rest are package-grouping rules. Everything merged into 23 effective options, 6 of them overridden along the way. 1 warning: Invalid schedule: \`before 6am on monday\` may never match — review it."`,
    );
  });

  /** Both of this fix's edges in one paragraph: the warnings verdict, and a
   *  two-sentence validator message cut at its clause boundary. */
  test("an accepted run whose one warning is a two-sentence validator message", () => {
    const clauses = buildRunDigest(
      input({
        warnings: 1,
        firstProblem: {
          severity: "warning",
          topic: "Configuration Warning",
          message:
            "packageRules[0].matchPackageNames: Your input contains * or ** along with other patterns. Please remove them, as * or ** matches all patterns.",
        },
      }),
    );
    expect(digestText(clauses)).toMatchInlineSnapshot(
      `"Renovate accepted this config, but flagged something worth reviewing. Your \`config:recommended\` entry expanded into 4 presets. Everything merged into 12 effective options. 1 warning: packageRules[0].matchPackageNames: Your input contains * or ** along with other patterns… — review it."`,
    );
  });

  test("a refused run, with layers and a failed preset", () => {
    const clauses = buildRunDigest(
      input({
        refused: true,
        errors: 3,
        warnings: 0,
        firstProblem: {
          severity: "error",
          topic: "Configuration Error",
          message: "Invalid configuration option: `automerg`",
        },
        migrations: { count: 0, labels: [] },
        presets: {
          entries: ["local>org/renovate-config"],
          resolved: 2,
          optionSetting: 1,
          rules: 0,
          failed: 1,
          injected: 1,
        },
        effective: { options: 9, overridden: 2 },
        layers: { global: true, inherited: true },
      }),
    );
    expect(digestText(clauses)).toMatchInlineSnapshot(
      `"⚠ A real Renovate run would refuse this config — what follows is the run it would have produced anyway. Your \`local>org/renovate-config\` entry expanded into 2 presets. 1 preset could not be fetched — provide their content by hand, or add a token for their host. 1 preset used content you supplied instead of being fetched. Everything merged into 9 effective options, 2 of them overridden along the way. Your self-hosted global and inherited config layers merged in underneath the repo config. 3 errors: Invalid configuration option: \`automerg\` — fix them."`,
    );
  });

  test("prose never doubles a space or spaces off its punctuation", () => {
    for (const shape of [
      input(),
      input({ effective: { options: 23, overridden: 6 } }),
      input({ warnings: 2, firstProblem: { severity: "warning", topic: "T", message: "M" } }),
    ]) {
      const text = digestText(buildRunDigest(shape));
      expect(text).not.toMatch(/ {2}/);
      expect(text).not.toMatch(/\s[,.]/);
    }
  });
});
