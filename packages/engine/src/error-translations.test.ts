import { describe, expect, it } from "vitest";
import {
  ERROR_TRANSLATIONS,
  findMentionedOption,
  parseConfigPath,
  translateMessage,
} from "./error-translations";
import type { ValidationMessage } from "./trace/model";
import { must } from "../test/helpers";

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
    const translation = must(
      ERROR_TRANSLATIONS.find((t) => t.id === "redundant-glob-star"),
      "the redundant-glob-star translation",
    );
    expect(translation.matches(message("packageRules[1].matchPackageNames"))).toBe(true);
    expect(translation.matches({ topic: "x", message: "unrelated" })).toBe(false);
  });

  it("explains the redundancy in plain language, naming the path", () => {
    const translated = must(
      translateMessage(message("packageRules[1].matchPackageNames"), null),
      "a translation for the redundant-glob-star message",
    );
    expect(translated.explanation).toMatch(/redundant/);
    expect(translated.explanation).toContain("packageRules[1].matchPackageNames");
    // no config snapshot given -> no fix computed
    expect(translated.fix).toBeNull();
  });

  it("suggests removing exactly the * / ** entries from the named array (study's ['*','!gradle'] case)", () => {
    const config = {
      packageRules: [
        { matchDepTypes: ["devDependencies"] },
        { matchPackageNames: ["*", "!gradle"] },
      ],
    };
    const translated = must(
      translateMessage(message("packageRules[1].matchPackageNames"), config),
      "a translation for the redundant-glob-star message",
    );
    const fix = must(translated.fix, "a suggested fix for the redundant-glob-star case");
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
    // original untouched
    expect(
      must(config.packageRules[1], "the packageRules[1] rule object").matchPackageNames,
    ).toEqual(["*", "!gradle"]);
  });

  it("handles a root-level (non-nested) array", () => {
    const config = { matchPackageNames: ["**", "!gradle", "!npm"] };
    const translated = must(
      translateMessage(message("matchPackageNames"), config),
      "a translation for the root-level matchPackageNames message",
    );
    const fix = must(translated.fix, "a suggested fix for the root-level array");
    expect(fix.after).toEqual(["!gradle", "!npm"]);
  });

  it("gives up when the named path isn't an array of strings in this config", () => {
    const config = { packageRules: [{ matchPackageNames: "not-an-array" }] };
    const translated = must(
      translateMessage(message("packageRules[0].matchPackageNames"), config),
      "a translation for the non-array packageRules[0] message",
    );
    expect(translated.fix).toBeNull();
  });

  it("gives up when the path can't be found at all (stale message vs. edited config)", () => {
    const config = { packageRules: [] as unknown[] };
    const translated = must(
      translateMessage(message("packageRules[0].matchPackageNames"), config),
      "a translation for the stale packageRules[0] message",
    );
    expect(translated.fix).toBeNull();
  });

  it("links the matcher-semantics docs page (negative-matching) rather than the bare option reference", () => {
    const translated = must(
      translateMessage(message("matchPackageNames"), null),
      "a translation for the matchPackageNames message",
    );
    expect(translated.docsUrl).toBe(
      "https://docs.renovatebot.com/string-pattern-matching/#negative-matching",
    );
  });

  it("states the negation-only match-all-except rule instead of the false 'other patterns already covered every case' claim", () => {
    const translated = must(
      translateMessage(message("matchPackageNames"), null),
      "a translation for the matchPackageNames message",
    );
    expect(translated.explanation).not.toMatch(/already covered every case/);
    expect(translated.explanation).toMatch(/negation-only/);
    expect(translated.explanation).toMatch(/string-pattern-matching/);
  });
});

describe("deprecated-option translation", () => {
  it("matches only Deprecation Warning messages with the exact upstream shape", () => {
    const translation = must(
      ERROR_TRANSLATIONS.find((t) => t.id === "deprecated-option"),
      "the deprecated-option translation",
    );
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
    const translated = must(
      translateMessage(
        {
          topic: "Deprecation Warning",
          message:
            "The 'dnsCache' option is deprecated: This option is deprecated and will be removed.",
        },
        null,
      ),
      "a translation for the dnsCache deprecation message",
    );
    expect(translated.explanation).toMatch(/migration/i);
    expect(translated.explanation).toContain("dnsCache");
  });

  it("offers no auto-fix for a real deprecated option with no single named replacement (dnsCache)", () => {
    const translated = must(
      translateMessage(
        {
          topic: "Deprecation Warning",
          message:
            "The 'dnsCache' option is deprecated: This option is deprecated and will be removed.",
        },
        { dnsCache: true },
      ),
      "a translation for the dnsCache deprecation message",
    );
    expect(translated.fix).toBeNull();
  });

  it("renames unambiguously when the deprecation text names exactly one known replacement option", () => {
    const translated = must(
      translateMessage(
        {
          topic: "Deprecation Warning",
          message: "The 'versionScheme' option is deprecated: Renamed to `versioning`.",
        },
        { versionScheme: "semver" },
      ),
      "a translation for the versionScheme deprecation message",
    );
    const fix = must(translated.fix, "a rename fix for the versionScheme deprecation");
    expect(fix.renameTo).toBe("versioning");
    expect(fix.before).toBe("semver");
    expect(fix.after).toBe("semver");
    expect(fix.fixedConfig).toEqual({ versioning: "semver" });
  });

  it("declines to clobber an existing value under the replacement name", () => {
    const translated = must(
      translateMessage(
        {
          topic: "Deprecation Warning",
          message: "The 'versionScheme' option is deprecated: Renamed to `versioning`.",
        },
        { versionScheme: "semver", versioning: "npm" },
      ),
      "a translation for the versionScheme deprecation message",
    );
    expect(translated.fix).toBeNull();
  });

  it("declines when two or more candidate replacements are named (ambiguous)", () => {
    const translated = must(
      translateMessage(
        {
          topic: "Deprecation Warning",
          message:
            "The 'branchName' option is deprecated: Please edit `branchPrefix`, `additionalBranchPrefix`, or `branchTopic` instead.",
        },
        { branchName: "renovate/{{depName}}" },
      ),
      "a translation for the branchName deprecation message",
    );
    expect(translated.fix).toBeNull();
  });
});

describe("global-only-option translation (008 boundary warning)", () => {
  const message: ValidationMessage = {
    topic: "Configuration Error",
    message:
      "The \"token\" option is a global option reserved only for Renovate's global configuration and cannot be configured within a repository's config file.",
  };

  it("matches the exact upstream boundary-warning shape", () => {
    const translation = must(
      ERROR_TRANSLATIONS.find((t) => t.id === "global-only-option"),
      "the global-only-option translation",
    );
    expect(translation.matches(message)).toBe(true);
    expect(translation.matches({ topic: "x", message: "unrelated" })).toBe(false);
  });

  it("explains that the option only works in global config", () => {
    const translated = must(
      translateMessage(message, null),
      "a translation for the global-only token message",
    );
    expect(translated.explanation).toMatch(/global/i);
    expect(translated.explanation).toContain("token");
  });

  it("suggests removing the option when it's present at the config root", () => {
    const translated = must(
      translateMessage(message, { token: "abc", extends: ["config:recommended"] }),
      "a translation for the global-only token message",
    );
    const fix = must(translated.fix, "a remove fix for the global-only token option");
    expect(fix.remove).toBe(true);
    expect(fix.path).toEqual(["token"]);
    expect(fix.before).toBe("abc");
    expect(fix.after).toBeUndefined();
    expect(fix.fixedConfig).toEqual({ extends: ["config:recommended"] });
  });

  it("declines when the option isn't present at the root of this snapshot (can't confidently locate it)", () => {
    const translated = must(
      translateMessage(message, { packageRules: [{ token: "abc" }] }),
      "a translation for the global-only token message",
    );
    expect(translated.fix).toBeNull();
  });
});

function groupPresetMessage(path: string): ValidationMessage {
  return {
    topic: "Configuration Warning",
    message: `${path}: you should not extend "group:" presets`,
  };
}

describe("group-preset-in-package-rule translation (068 — the common WARNING)", () => {
  const message = groupPresetMessage;

  it("matches the exact upstream message shape, topic-independently", () => {
    const translation = must(
      ERROR_TRANSLATIONS.find((t) => t.id === "group-preset-in-package-rule"),
      "the group-preset-in-package-rule translation",
    );
    expect(translation.matches(message("packageRules[0].extends"))).toBe(true);
    // `explain_message` defaults the topic to "Configuration Error" when a
    // caller passes only the text — the match must not depend on the topic.
    expect(
      translation.matches({
        topic: "Configuration Error",
        message: 'packageRules[0].extends: you should not extend "group:" presets',
      }),
    ).toBe(true);
    expect(translation.matches({ topic: "x", message: "unrelated" })).toBe(false);
  });

  it("explains the structural reason: the preset body is a packageRules array", () => {
    const translated = must(
      translateMessage(message("packageRules[0].extends"), null),
      "a translation for the group-preset message",
    );
    expect(translated.explanation).toContain("packageRules[0].extends");
    expect(translated.explanation).toMatch(/`packageRules` array/);
    expect(translated.explanation).toMatch(/matchUpdateTypes/);
    expect(translated.explanation).toMatch(/pin/);
    expect(translated.docsUrl).toBe("https://docs.renovatebot.com/config-presets/");
    expect(translated.fix).toBeNull();
  });

  it("inlines a monorepo group: the underlying monorepo: preset, groupName AND matchUpdateTypes", () => {
    const config = {
      packageRules: [{ extends: ["group:jestMonorepo"], automerge: true }],
    };
    const translated = must(
      translateMessage(message("packageRules[0].extends"), config),
      "a translation for the group-preset message",
    );
    const fix = must(translated.fix, "a suggested fix for the jestMonorepo case");
    expect(fix.path).toEqual(["packageRules", 0]);
    expect(fix.after).toEqual({
      extends: ["monorepo:jest"],
      groupName: "jest monorepo",
      // the group's own pin-excluding update types, restated verbatim
      matchUpdateTypes: ["digest", "patch", "minor", "major"],
      automerge: true,
    });
    expect(fix.fixedConfig).toEqual({
      packageRules: [
        {
          extends: ["monorepo:jest"],
          groupName: "jest monorepo",
          matchUpdateTypes: ["digest", "patch", "minor", "major"],
          automerge: true,
        },
      ],
    });
    expect(fix.summary).toContain("group:jestMonorepo");
    // original untouched
    expect(config.packageRules[0]?.extends).toEqual(["group:jestMonorepo"]);
  });

  it("copies a group's plain matchers when it has no underlying preset to extend", () => {
    const config = { packageRules: [{ extends: ["group:definitelyTyped"] }] };
    const translated = must(
      translateMessage(message("packageRules[0].extends"), config),
      "a translation for the definitelyTyped group message",
    );
    const fix = must(translated.fix, "a suggested fix for the definitelyTyped case");
    expect(fix.after).toEqual({
      groupName: "definitelyTyped",
      matchPackageNames: ["@types/**"],
    });
  });

  it("keeps the rule's other presets and lets the user's own value win a conflict", () => {
    const config = {
      packageRules: [
        {
          extends: ["group:jestMonorepo", "schedule:weekly"],
          matchUpdateTypes: ["minor", "patch"],
        },
      ],
    };
    const translated = must(
      translateMessage(message("packageRules[0].extends"), config),
      "a translation for the group-preset message",
    );
    const fix = must(translated.fix, "a suggested fix that keeps the sibling preset");
    expect(fix.after).toEqual({
      extends: ["monorepo:jest", "schedule:weekly"],
      groupName: "jest monorepo",
      // explicitly set by the user, so it survives the merge
      matchUpdateTypes: ["minor", "patch"],
    });
  });

  it("explains without a fix when the group is a fan-out over other groups (group:monorepos)", () => {
    const translated = must(
      translateMessage(message("packageRules[0].extends"), {
        packageRules: [{ extends: ["group:monorepos"] }],
      }),
      "a translation for the group:monorepos message",
    );
    expect(translated.fix).toBeNull();
  });

  it("explains without a fix when the group carries top-level options (group:all)", () => {
    const translated = must(
      translateMessage(message("packageRules[0].extends"), {
        packageRules: [{ extends: ["group:all"] }],
      }),
      "a translation for the group:all message",
    );
    expect(translated.fix).toBeNull();
  });

  it("explains without a fix when two group: presets share one rule (ambiguous)", () => {
    const translated = must(
      translateMessage(message("packageRules[0].extends"), {
        packageRules: [{ extends: ["group:jestMonorepo", "group:definitelyTyped"] }],
      }),
      "a translation for the two-group message",
    );
    expect(translated.fix).toBeNull();
  });

  it("explains without a fix for a group name this Renovate doesn't bundle", () => {
    const translated = must(
      translateMessage(message("packageRules[0].extends"), {
        packageRules: [{ extends: ["group:notARealGroupPreset"] }],
      }),
      "a translation for the unknown-group message",
    );
    expect(translated.fix).toBeNull();
  });

  it("gives up when the named path isn't in this config (stale message vs. edited config)", () => {
    const translated = must(
      translateMessage(message("packageRules[3].extends"), { packageRules: [] as unknown[] }),
      "a translation for the stale group message",
    );
    expect(translated.fix).toBeNull();
  });
});

function globalPresetMessage(path: string): ValidationMessage {
  return {
    topic: "Configuration Error",
    message: `${path}: you cannot extend from "global:" presets in a repository config's "extends"`,
  };
}

describe("global-preset-in-extends translation", () => {
  const message = globalPresetMessage;

  it("matches the exact upstream message shape", () => {
    const translation = must(
      ERROR_TRANSLATIONS.find((t) => t.id === "global-preset-in-extends"),
      "the global-preset-in-extends translation",
    );
    expect(translation.matches(message("extends"))).toBe(true);
    expect(translation.matches({ topic: "x", message: "unrelated" })).toBe(false);
  });

  it("explains that global: presets belong in the self-hosted config", () => {
    const translated = must(
      translateMessage(message("extends"), null),
      "a translation for the global-preset message",
    );
    expect(translated.explanation).toMatch(/self-hosted/);
    expect(translated.docsUrl).toBe("https://docs.renovatebot.com/presets-global/");
  });

  it("drops only the global: entries, keeping the rest of extends", () => {
    const translated = must(
      translateMessage(message("extends"), {
        extends: ["config:recommended", "global:safeEnv"],
      }),
      "a translation for the global-preset message",
    );
    const fix = must(translated.fix, "a suggested fix for the global-preset case");
    expect(fix.path).toEqual(["extends"]);
    expect(fix.after).toEqual(["config:recommended"]);
    expect(fix.fixedConfig).toEqual({ extends: ["config:recommended"] });
  });

  it("removes the key entirely when nothing but global: presets were listed", () => {
    const translated = must(
      translateMessage(message("extends"), { extends: ["global:safeEnv"], labels: ["deps"] }),
      "a translation for the global-only extends message",
    );
    const fix = must(translated.fix, "a remove fix for the global-only extends");
    expect(fix.remove).toBe(true);
    expect(fix.fixedConfig).toEqual({ labels: ["deps"] });
  });

  it("gives up when the named path isn't a string array in this config", () => {
    const translated = must(
      translateMessage(message("extends"), { extends: "config:recommended" }),
      "a translation for the non-array extends message",
    );
    expect(translated.fix).toBeNull();
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
