import { describe, expect, test } from "vitest";
import {
  compileInheritTemplate,
  INHERIT_FILE_DEFAULT,
  INHERIT_REPO_TEMPLATE,
  inheritFieldValues,
  inheritLayerState,
  inheritPolicyOf,
  inheritProbeTarget,
  isProbeTargetResolved,
  repoSlugOf,
  templateVarsFor,
} from "./inherit-probe";

/**
 * Roadmap 045: the probe-target derivation, which is the whole of this item's
 * logic that is NOT a fetch or a React render — where the inherited config is
 * looked for, and what a hit/miss means under the pasted global config.
 *
 * The reference behavior is upstream's: `parentOrg` is the repo slug minus its
 * last segment and `topLevelOrg` its first (workers/global/index.js), and
 * `inheritConfigRepoName` is compiled against those
 * (workers/repository/init/inherited.js).
 */

describe("repoSlugOf", () => {
  test("takes a bare owner/repo as-is", () => {
    expect(repoSlugOf("renovate-org/backend-api")).toBe("renovate-org/backend-api");
  });

  test("drops a host-looking first segment", () => {
    expect(repoSlugOf("github.com/renovate-org/backend-api")).toBe("renovate-org/backend-api");
  });

  test("drops a scheme and host, and a trailing .git", () => {
    expect(repoSlugOf("https://gitlab.com/group/sub/repo.git")).toBe("group/sub/repo");
  });

  test("understands the scp-style form", () => {
    expect(repoSlugOf("git@github.com:renovate-org/backend-api.git")).toBe(
      "renovate-org/backend-api",
    );
  });

  test("tolerates a half-typed reference", () => {
    expect(repoSlugOf("renovate-org/")).toBe("renovate-org");
    expect(repoSlugOf("renovate-org")).toBe("renovate-org");
    expect(repoSlugOf("  ")).toBe("");
  });
});

describe("templateVarsFor", () => {
  test("parentOrg is the slug minus its last segment", () => {
    expect(templateVarsFor("renovate-org/backend-api")).toEqual({
      repository: "renovate-org/backend-api",
      parentOrg: "renovate-org",
      topLevelOrg: "renovate-org",
    });
  });

  test("a GitLab subgroup keeps its subgroup in parentOrg", () => {
    expect(templateVarsFor("group/sub/repo")).toEqual({
      repository: "group/sub/repo",
      parentOrg: "group/sub",
      topLevelOrg: "group",
    });
  });

  test("a single segment has no parent org yet", () => {
    expect(templateVarsFor("renovate-org")).toEqual({
      repository: "renovate-org",
      parentOrg: "",
      topLevelOrg: "",
    });
  });
});

describe("compileInheritTemplate", () => {
  const vars = templateVarsFor("group/sub/repo");

  test("substitutes the three variables upstream exposes", () => {
    expect(compileInheritTemplate("{{parentOrg}}/renovate-config", vars)).toBe(
      "group/sub/renovate-config",
    );
    expect(compileInheritTemplate("{{topLevelOrg}}/cfg", vars)).toBe("group/cfg");
    expect(compileInheritTemplate("{{ repository }}", vars)).toBe("group/sub/repo");
  });

  test("leaves a variable that is not known yet standing", () => {
    expect(compileInheritTemplate(INHERIT_REPO_TEMPLATE, templateVarsFor("renovate-org"))).toBe(
      INHERIT_REPO_TEMPLATE,
    );
  });

  test("passes a plain slug through untouched", () => {
    expect(compileInheritTemplate("my-org/renovate-config", vars)).toBe("my-org/renovate-config");
  });
});

describe("inheritPolicyOf", () => {
  test("reads the repo/file overrides", () => {
    expect(
      inheritPolicyOf({
        inheritConfigRepoName: " my-org/bot-config ",
        inheritConfigFileName: "defaults.json",
      }),
    ).toEqual({
      repoOverride: "my-org/bot-config",
      fileOverride: "defaults.json",
      explicitlyDisabled: false,
      explicitlyEnabled: false,
      strict: false,
    });
  });

  test("only an EXPLICIT false counts as disabled", () => {
    expect(inheritPolicyOf(null).explicitlyDisabled).toBe(false);
    expect(inheritPolicyOf({}).explicitlyDisabled).toBe(false);
    expect(inheritPolicyOf({ inheritConfig: true }).explicitlyDisabled).toBe(false);
    expect(inheritPolicyOf({ inheritConfig: false }).explicitlyDisabled).toBe(true);
  });

  // Roadmap 045, corrected 2026-07-26: the checkbox's auto-enable reads this
  // flag — see App's `inheritAuto`.
  test("only an EXPLICIT true counts as enabled", () => {
    expect(inheritPolicyOf(null).explicitlyEnabled).toBe(false);
    expect(inheritPolicyOf({}).explicitlyEnabled).toBe(false);
    expect(inheritPolicyOf({ inheritConfig: false }).explicitlyEnabled).toBe(false);
    expect(inheritPolicyOf({ inheritConfig: true }).explicitlyEnabled).toBe(true);
  });

  test("strict is on only for a literal true", () => {
    expect(inheritPolicyOf({ inheritConfigStrict: true }).strict).toBe(true);
    expect(inheritPolicyOf({ inheritConfigStrict: "true" }).strict).toBe(false);
    expect(inheritPolicyOf({}).strict).toBe(false);
  });

  test("ignores non-string / empty overrides", () => {
    const policy = inheritPolicyOf({ inheritConfigRepoName: 7, inheritConfigFileName: "   " });
    expect(policy.repoOverride).toBeUndefined();
    expect(policy.fileOverride).toBeUndefined();
  });
});

describe("inheritFieldValues", () => {
  const untouched = { repo: null, file: null };

  test("tracks the typed owner live, with the documented defaults", () => {
    expect(
      inheritFieldValues({
        repoInput: "github.com/renovate-org/backend-api",
        globalConfig: null,
        edits: untouched,
      }),
    ).toEqual({ repo: "renovate-org/renovate-config", file: INHERIT_FILE_DEFAULT });
  });

  test("shows the template itself until an owner exists", () => {
    expect(
      inheritFieldValues({ repoInput: "renovate-org", globalConfig: null, edits: untouched }).repo,
    ).toBe(INHERIT_REPO_TEMPLATE);
  });

  test("a pasted global config's overrides win over the defaults", () => {
    expect(
      inheritFieldValues({
        repoInput: "renovate-org/backend-api",
        globalConfig: {
          inheritConfigRepoName: "{{topLevelOrg}}/bot-config",
          inheritConfigFileName: "defaults.json",
        },
        edits: untouched,
      }),
    ).toEqual({ repo: "renovate-org/bot-config", file: "defaults.json" });
  });

  test("an edited field is the user's and stops tracking", () => {
    const fields = inheritFieldValues({
      repoInput: "renovate-org/backend-api",
      globalConfig: { inheritConfigFileName: "defaults.json" },
      edits: { repo: "elsewhere/config", file: "mine.json" },
    });
    expect(fields).toEqual({ repo: "elsewhere/config", file: "mine.json" });
  });

  test("each field is dirty on its own", () => {
    expect(
      inheritFieldValues({
        repoInput: "renovate-org/backend-api",
        globalConfig: null,
        edits: { repo: "elsewhere/config", file: null },
      }),
    ).toEqual({ repo: "elsewhere/config", file: INHERIT_FILE_DEFAULT });
  });

  test("a cleared field (null) is tracking again", () => {
    const tracking = inheritFieldValues({
      repoInput: "other-org/api",
      globalConfig: null,
      edits: untouched,
    });
    expect(tracking.repo).toBe("other-org/renovate-config");
  });
});

describe("inheritProbeTarget", () => {
  test("compiles against the repo that was actually loaded", () => {
    expect(
      inheritProbeTarget(
        { repo: INHERIT_REPO_TEMPLATE, file: INHERIT_FILE_DEFAULT },
        "renovate-org/backend-api",
      ),
    ).toEqual({ repo: "renovate-org/renovate-config", file: INHERIT_FILE_DEFAULT });
  });

  test("a user field may itself hold a template", () => {
    expect(
      inheritProbeTarget({ repo: " {{parentOrg}}/bot ", file: " cfg.json " }, "group/sub/repo"),
    ).toEqual({ repo: "group/sub/bot", file: "cfg.json" });
  });

  test("an unresolved or empty target is not fetchable", () => {
    expect(
      isProbeTargetResolved(
        inheritProbeTarget({ repo: INHERIT_REPO_TEMPLATE, file: "x.json" }, ""),
      ),
    ).toBe(false);
    expect(isProbeTargetResolved({ repo: "org/cfg", file: "" })).toBe(false);
    expect(isProbeTargetResolved({ repo: "org/cfg", file: "x.json" })).toBe(true);
  });
});

describe("inheritLayerState", () => {
  const target = { repo: "renovate-org/renovate-config", file: INHERIT_FILE_DEFAULT };

  test("no probe, no state", () => {
    expect(inheritLayerState(null, inheritPolicyOf(null))).toBeNull();
  });

  test("2a — a hit is auto-loaded and not warned about", () => {
    expect(inheritLayerState({ status: "loaded", target }, inheritPolicyOf({}))).toEqual({
      kind: "auto-loaded",
      target,
      disabledByGlobal: false,
    });
  });

  test("2c — a hit under inheritConfig: false is flagged", () => {
    expect(
      inheritLayerState({ status: "loaded", target }, inheritPolicyOf({ inheritConfig: false })),
    ).toEqual({ kind: "auto-loaded", target, disabledByGlobal: true });
  });

  test("2b — a miss is quiet by default and hard under strict", () => {
    expect(inheritLayerState({ status: "missing", target }, inheritPolicyOf(null))).toEqual({
      kind: "missing",
      target,
      strict: false,
    });
    expect(
      inheritLayerState(
        { status: "missing", target },
        inheritPolicyOf({ inheritConfigStrict: true }),
      ),
    ).toEqual({ kind: "missing", target, strict: true });
  });

  test("a refused request keeps its detail and the strict framing", () => {
    expect(
      inheritLayerState(
        { status: "unreachable", target, detail: "CORS." },
        inheritPolicyOf({ inheritConfigStrict: true }),
      ),
    ).toEqual({ kind: "unreachable", target, detail: "CORS.", strict: true });
  });
});
