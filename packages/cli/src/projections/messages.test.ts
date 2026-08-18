import { describe, expect, test } from "vitest";
import { describeMessage } from "./messages";

/**
 * Roadmap 068: `explain_message` promises "a docs link and — when the library
 * knows one — a concrete fix". These cover both halves of that promise: the
 * common `group:` WARNING now arrives with an explanation and a ready-to-apply
 * fix, and a message the library has no entry for says so out loud instead of
 * returning a bare echo of the input.
 */

const GROUP_WARNING = 'packageRules[0].extends: you should not extend "group:" presets';

describe("describeMessage — a known warning", () => {
  const config = { packageRules: [{ extends: ["group:jestMonorepo"], automerge: true }] };
  const text =
    '{\n  "packageRules": [{ "extends": ["group:jestMonorepo"], "automerge": true }]\n}\n';

  test("the group: warning carries an explanation, a docs link and a fix", () => {
    const reported = describeMessage(
      { topic: "Configuration Warning", message: GROUP_WARNING },
      "warning",
      config,
      text,
    );
    expect(reported.translationKnown).toBe(true);
    expect(reported.note).toBeUndefined();
    expect(reported.explanation).toMatch(/`packageRules` array/);
    expect(reported.docsUrl).toBe("https://docs.renovatebot.com/config-presets/");
    expect(reported.fix?.fixedConfig).toEqual({
      packageRules: [
        {
          extends: ["monorepo:jest"],
          groupName: "jest monorepo",
          matchUpdateTypes: ["digest", "patch", "minor", "major"],
          automerge: true,
        },
      ],
    });
    // The edit replaces a whole array element, and that is a MINIMAL patch:
    // the document is not re-serialized, so nothing else in it moves.
    expect(reported.fix?.fixedTextRewritesDocument).toBeUndefined();
    expect(reported.fix?.fixedText).toContain('{\n  "packageRules": [');
    expect(JSON.parse(reported.fix?.fixedText ?? "null")).toEqual(reported.fix?.fixedConfig);
  });

  /**
   * What the persona sessions actually meant by "minimal patch": a config with
   * comments comes back with its comments. A whole-document rewrite loses
   * them silently — the fix is still correct, and the file is still ruined.
   */
  test("a comment-bearing config keeps its comments and its untouched siblings", () => {
    const commented = [
      "{",
      "  // renovate config",
      '  "extends": ["config:recommended"],',
      '  "packageRules": [',
      '    { "matchDepTypes": ["devDependencies"], "automerge": true },',
      '    { "extends": ["group:jestMonorepo"] }',
      "  ]",
      "}",
      "",
    ].join("\n");
    const reported = describeMessage(
      {
        topic: "Configuration Warning",
        message: 'packageRules[1].extends: you should not extend "group:" presets',
      },
      "warning",
      {
        extends: ["config:recommended"],
        packageRules: [
          { matchDepTypes: ["devDependencies"], automerge: true },
          { extends: ["group:jestMonorepo"] },
        ],
      },
      commented,
    );
    const fixedText = reported.fix?.fixedText ?? "";
    expect(reported.fix?.fixedTextRewritesDocument).toBeUndefined();
    expect(fixedText).toContain("  // renovate config");
    expect(fixedText).toContain('  "extends": ["config:recommended"],');
    expect(fixedText).toContain('    { "matchDepTypes": ["devDependencies"], "automerge": true },');
    expect(fixedText).toContain("monorepo:jest");
    expect(fixedText).not.toContain("group:jestMonorepo");
  });

  test("without a config snapshot it explains, and says why there is no fix", () => {
    const reported = describeMessage(
      { topic: "Configuration Warning", message: GROUP_WARNING },
      "warning",
      null,
      null,
    );
    expect(reported.translationKnown).toBe(true);
    expect(reported.fix).toBeUndefined();
    expect(reported.note).toMatch(/runId/);
  });
});

describe("describeMessage — no translation known", () => {
  test("says so explicitly instead of echoing the message alone", () => {
    const reported = describeMessage(
      { topic: "Configuration Error", message: "Something else entirely" },
      "error",
      {},
      null,
    );
    expect(reported).toEqual({
      severity: "error",
      topic: "Configuration Error",
      message: "Something else entirely",
      translationKnown: false,
      note: expect.stringContaining("No translation for this message"),
    });
    expect(reported.note).toMatch(/Renovate's own/);
  });

  test("a severity nothing decided is null, and says so", () => {
    const reported = describeMessage(
      { topic: "Configuration Error", message: "Something else entirely" },
      null,
      {},
      null,
    );
    expect(reported.severity).toBeNull();
    expect(reported.severityNote).toMatch(/nothing decided/);
  });

  test("still offers the option's docs link when the message names one", () => {
    const reported = describeMessage(
      {
        topic: "Configuration Warning",
        message: "Setting `registryUrls` at the top level of your config will apply it broadly.",
      },
      "warning",
      {},
      null,
    );
    expect(reported.translationKnown).toBe(false);
    expect(reported.docsUrl).toContain("#registryurls");
    expect(reported.note).toMatch(/No translation for this message/);
  });
});
