import { describe, expect, it } from "vitest";
import {
  ERROR_TRANSLATIONS,
  findMentionedOption,
  parseConfigPath,
  translateMessage,
} from "../src/error-translations";
import type { ValidationMessage } from "../src/trace/model";

describe("parseConfigPath", () => {
  it("parses a bare top-level key", () => {
    expect(parseConfigPath("matchPackageNames")).toEqual(["matchPackageNames"]);
  });

  it("parses a nested packageRules path", () => {
    expect(parseConfigPath("packageRules[1].matchPackageNames")).toEqual([
      "packageRules",
      1,
      "matchPackageNames",
    ]);
  });

  it("parses multiple array indices", () => {
    expect(parseConfigPath("packageRules[0].packageRules[2].matchDepTypes")).toEqual([
      "packageRules",
      0,
      "packageRules",
      2,
      "matchDepTypes",
    ]);
  });
});

function redundantGlobMessage(path: string): ValidationMessage {
  return {
    topic: "Configuration Error",
    message: `${path}: Your input contains * or ** along with other patterns. Please remove them, as * or ** matches all patterns.`,
  };
}

describe("redundant-glob-star translation (P2 study case)", () => {
  const message = redundantGlobMessage;

  it("matches the exact upstream message shape", () => {
    const translation = ERROR_TRANSLATIONS.find((t) => t.id === "redundant-glob-star")!;
    expect(translation.matches(message("packageRules[1].matchPackageNames"))).toBe(true);
    expect(translation.matches({ topic: "x", message: "unrelated" })).toBe(false);
  });

  it("explains the redundancy in plain language, naming the path", () => {
    const translated = translateMessage(message("packageRules[1].matchPackageNames"), null);
    expect(translated).not.toBeNull();
    expect(translated!.explanation).toMatch(/redundant/);
    expect(translated!.explanation).toContain("packageRules[1].matchPackageNames");
    // no config snapshot given -> no fix computed
    expect(translated!.fix).toBeNull();
  });

  it("suggests removing exactly the * / ** entries from the named array (study's ['*','!gradle'] case)", () => {
    const config = {
      packageRules: [
        { matchDepTypes: ["devDependencies"] },
        { matchPackageNames: ["*", "!gradle"] },
      ],
    };
    const translated = translateMessage(message("packageRules[1].matchPackageNames"), config);
    expect(translated!.fix).not.toBeNull();
    const fix = translated!.fix!;
    expect(fix.path).toEqual(["packageRules", 1, "matchPackageNames"]);
    expect(fix.before).toEqual(["*", "!gradle"]);
    expect(fix.after).toEqual(["!gradle"]);
    expect(fix.value).toEqual(["!gradle"]);
    expect(fix.summary).toContain("`*`");
    // the fixed config is otherwise untouched
    expect(fix.fixedConfig.packageRules).toEqual([
      { matchDepTypes: ["devDependencies"] },
      { matchPackageNames: ["!gradle"] },
    ]);
    expect(config.packageRules[1]!.matchPackageNames).toEqual(["*", "!gradle"]); // original untouched
  });

  it("handles a root-level (non-nested) array", () => {
    const config = { matchPackageNames: ["**", "!gradle", "!npm"] };
    const translated = translateMessage(message("matchPackageNames"), config);
    expect(translated!.fix!.after).toEqual(["!gradle", "!npm"]);
  });

  it("gives up when the named path isn't an array of strings in this config", () => {
    const config = { packageRules: [{ matchPackageNames: "not-an-array" }] };
    const translated = translateMessage(message("packageRules[0].matchPackageNames"), config);
    expect(translated!.fix).toBeNull();
  });

  it("gives up when the path can't be found at all (stale message vs. edited config)", () => {
    const config = { packageRules: [] as unknown[] };
    const translated = translateMessage(message("packageRules[0].matchPackageNames"), config);
    expect(translated!.fix).toBeNull();
  });

  it("links the matcher-semantics docs page (negative-matching) rather than the bare option reference", () => {
    const translated = translateMessage(message("matchPackageNames"), null);
    expect(translated!.docsUrl).toBe(
      "https://docs.renovatebot.com/string-pattern-matching/#negative-matching",
    );
  });

  it("states the negation-only match-all-except rule instead of the false 'other patterns already covered every case' claim", () => {
    const translated = translateMessage(message("matchPackageNames"), null);
    expect(translated!.explanation).not.toMatch(/already covered every case/);
    expect(translated!.explanation).toMatch(/negation-only/);
    expect(translated!.explanation).toMatch(/string-pattern-matching/);
  });
});

describe("deprecated-option translation", () => {
  it("matches only Deprecation Warning messages with the exact upstream shape", () => {
    const translation = ERROR_TRANSLATIONS.find((t) => t.id === "deprecated-option")!;
    expect(
      translation.matches({
        topic: "Deprecation Warning",
        message:
          "The 'dnsCache' option is deprecated: This option is deprecated and will be removed.",
      }),
    ).toBe(true);
    expect(
      translation.matches({
        topic: "Configuration Error",
        message: "The 'dnsCache' option is deprecated: x",
      }),
    ).toBe(false);
  });

  it("explains and points at the migration step-through", () => {
    const translated = translateMessage(
      {
        topic: "Deprecation Warning",
        message:
          "The 'dnsCache' option is deprecated: This option is deprecated and will be removed.",
      },
      null,
    );
    expect(translated).not.toBeNull();
    expect(translated!.explanation).toMatch(/migration/i);
    expect(translated!.explanation).toContain("dnsCache");
  });

  it("offers no auto-fix for a real deprecated option with no single named replacement (dnsCache)", () => {
    const translated = translateMessage(
      {
        topic: "Deprecation Warning",
        message:
          "The 'dnsCache' option is deprecated: This option is deprecated and will be removed.",
      },
      { dnsCache: true },
    );
    expect(translated!.fix).toBeNull();
  });

  it("renames unambiguously when the deprecation text names exactly one known replacement option", () => {
    const translated = translateMessage(
      {
        topic: "Deprecation Warning",
        message: "The 'versionScheme' option is deprecated: Renamed to `versioning`.",
      },
      { versionScheme: "semver" },
    );
    const fix = translated!.fix!;
    expect(fix.renameTo).toBe("versioning");
    expect(fix.before).toBe("semver");
    expect(fix.after).toBe("semver");
    expect(fix.fixedConfig).toEqual({ versioning: "semver" });
  });

  it("declines to clobber an existing value under the replacement name", () => {
    const translated = translateMessage(
      {
        topic: "Deprecation Warning",
        message: "The 'versionScheme' option is deprecated: Renamed to `versioning`.",
      },
      { versionScheme: "semver", versioning: "npm" },
    );
    expect(translated!.fix).toBeNull();
  });

  it("declines when two or more candidate replacements are named (ambiguous)", () => {
    const translated = translateMessage(
      {
        topic: "Deprecation Warning",
        message:
          "The 'branchName' option is deprecated: Please edit `branchPrefix`, `additionalBranchPrefix`, or `branchTopic` instead.",
      },
      { branchName: "renovate/{{depName}}" },
    );
    expect(translated!.fix).toBeNull();
  });
});

describe("global-only-option translation (008 boundary warning)", () => {
  const message: ValidationMessage = {
    topic: "Configuration Error",
    message:
      "The \"token\" option is a global option reserved only for Renovate's global configuration and cannot be configured within a repository's config file.",
  };

  it("matches the exact upstream boundary-warning shape", () => {
    const translation = ERROR_TRANSLATIONS.find((t) => t.id === "global-only-option")!;
    expect(translation.matches(message)).toBe(true);
    expect(translation.matches({ topic: "x", message: "unrelated" })).toBe(false);
  });

  it("explains that the option only works in global config", () => {
    const translated = translateMessage(message, null);
    expect(translated!.explanation).toMatch(/global/i);
    expect(translated!.explanation).toContain("token");
  });

  it("suggests removing the option when it's present at the config root", () => {
    const translated = translateMessage(message, { token: "abc", extends: ["config:recommended"] });
    const fix = translated!.fix!;
    expect(fix.remove).toBe(true);
    expect(fix.path).toEqual(["token"]);
    expect(fix.before).toBe("abc");
    expect(fix.after).toBeUndefined();
    expect(fix.fixedConfig).toEqual({ extends: ["config:recommended"] });
  });

  it("declines when the option isn't present at the root of this snapshot (can't confidently locate it)", () => {
    const translated = translateMessage(message, { packageRules: [{ token: "abc" }] });
    expect(translated!.fix).toBeNull();
  });
});

describe("translateMessage", () => {
  it("returns null for a message no curated pattern recognizes", () => {
    expect(
      translateMessage({ topic: "Configuration Error", message: "Something else entirely" }, null),
    ).toBeNull();
  });
});

describe("findMentionedOption (fallback docs link for unmatched messages)", () => {
  it("finds a backtick-quoted option name", () => {
    const doc = findMentionedOption({
      topic: "x",
      message: "Setting `registryUrls` at the top level applies it everywhere.",
    });
    expect(doc?.name).toBe("registryUrls");
  });

  it("finds a single-quoted option name", () => {
    const doc = findMentionedOption({
      topic: "x",
      message: "The 'rangeStrategy' option is odd here.",
    });
    expect(doc?.name).toBe("rangeStrategy");
  });

  it("returns undefined when nothing quoted is a real option", () => {
    const doc = findMentionedOption({
      topic: "x",
      message: "The 'notARealOption' thing is wrong.",
    });
    expect(doc).toBeUndefined();
  });
});
