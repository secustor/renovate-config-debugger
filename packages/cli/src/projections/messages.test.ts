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
    // The edit replaces a whole array element, which the surgical text patcher
    // does not address — the document is re-serialized, and says so.
    expect(reported.fix?.fixedTextRewritesDocument).toBe(true);
    expect(JSON.parse(reported.fix?.fixedText ?? "null")).toEqual(reported.fix?.fixedConfig);
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
