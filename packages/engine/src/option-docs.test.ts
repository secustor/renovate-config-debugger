import { describe, expect, it } from "vitest";
import { getAllowedParents, getOptions } from "./renovate-adapter";
import { getOptionIndex, optionsSourceUrl, REQUIRED_IF_NOTE } from "./option-docs";

describe("option index", () => {
  it("exposes renovate's option metadata for hover docs", () => {
    const { options } = getOptionIndex();
    const rangeStrategy = options.get("rangeStrategy");
    expect(rangeStrategy?.description).toMatch(/range/i);
    expect(rangeStrategy?.type).toBe("string");
    expect(rangeStrategy?.default).toBe("auto");
    expect(rangeStrategy?.allowedValues).toContain("pin");
    expect(rangeStrategy?.url).toBe(
      "https://docs.renovatebot.com/configuration-options/#rangestrategy",
    );
    expect(options.has("notARenovateOption")).toBe(false);
  });

  it("links global-only options to the self-hosted docs page", () => {
    const { options } = getOptionIndex();
    const token = options.get("token");
    expect(token?.globalOnly).toBe(true);
    expect(token?.url).toBe("https://docs.renovatebot.com/self-hosted-configuration/#token");
  });

  it("derives container options from parents declarations", () => {
    const { containers } = getOptionIndex();
    expect(containers.has("packageRules")).toBe(true);
    expect(containers.has("hostRules")).toBe(true);
    // free-form objects must not be containers, or their keys would be
    // flagged as unknown options
    expect(containers.has("constraints")).toBe(false);
    expect(containers.has(".")).toBe(false);
  });

  it("cites the option table at the pinned version, not the drifting docs site", () => {
    expect(optionsSourceUrl).toMatch(
      /^https:\/\/www\.npmjs\.com\/package\/renovate\/v\/\d+\.\d+\.\d+/,
    );
  });
});

describe("placement", () => {
  it("says 'anywhere' out loud when upstream declares neither parents nor scopes", () => {
    const { options } = getOptionIndex();
    expect(options.get("ignoreDeps")?.placement).toEqual({ kind: "unrestricted" });
    // `$schema` is hand-modeled, and Renovate's validator ignores it at every
    // nesting level — so it is unrestricted too, not "unknown".
    expect(options.get("$schema")?.placement).toEqual({ kind: "unrestricted" });
  });

  it("names the containers an option is restricted to", () => {
    const { options } = getOptionIndex();
    const matchSourceUrls = options.get("matchSourceUrls");
    expect(matchSourceUrls?.placement).toEqual({
      kind: "restricted",
      parents: ["packageRules"],
      topLevel: false,
    });
    expect(matchSourceUrls?.patternMatch).toBe(true);
  });

  it("expands upstream's scopes into the parents they cover", () => {
    const { options } = getOptionIndex();
    const placement = options.get("minimumReleaseAge")?.placement;
    if (placement?.kind !== "restricted") {
      throw new Error("expected a restricted placement");
    }
    expect(placement.topLevel).toBe(true);
    expect(placement.parents).toEqual(
      expect.arrayContaining(["packageRules", "vulnerabilityAlerts", "npm", "major"]),
    );
    // lookup-scoped: a group's config is merged in after lookup, so `group` is not a parent
    expect(placement.parents).not.toContain("group");
  });

  it("lifts upstream's '.' out of the parent list into topLevel", () => {
    const { options } = getOptionIndex();
    const placement = options.get("enabled")?.placement;
    expect(placement?.kind).toBe("restricted");
    if (placement?.kind !== "restricted") {
      throw new Error("expected a restricted placement");
    }
    expect(placement.topLevel).toBe(true);
    expect(placement.parents).not.toContain(".");
    expect(placement.parents).toContain("packageRules");
    // exactly upstream's list minus the one "." entry, counted from upstream
    // rather than pinned: a bump that adds a manager grows this list.
    const enabled = getOptions().find((option) => option.name === "enabled");
    const upstreamParents = (enabled && getAllowedParents(enabled)) ?? [];
    expect(upstreamParents).toContain(".");
    expect(placement.parents).toHaveLength(upstreamParents.length - 1);
  });
});

describe("containers", () => {
  it("attaches the children to the container's own doc", () => {
    const { options } = getOptionIndex();
    const packageRules = options.get("packageRules");
    expect(packageRules?.isContainer).toBe(true);
    expect(packageRules?.childOptions).toContain("matchPackageNames");
    // The honesty invariant: `childOptions` is the RESTRICTED set, not
    // "everything legal here" — an unrestricted option may appear inside a
    // container without ever naming it.
    expect(packageRules?.childOptions).not.toContain("ignoreDeps");
    expect(options.get("ignoreDeps")?.placement.kind).toBe("unrestricted");
  });

  it("marks a container only because something named it", () => {
    const { options } = getOptionIndex();
    // neither carries an upstream container marker: `parents` names
    // `logLevelRemap`, and the `updateType` scope names `minor`.
    expect(options.get("logLevelRemap")?.childOptions).toEqual(["matchMessage", "newLogLevel"]);
    expect(options.get("minor")?.childOptions).toContain("enabled");
    expect(options.get("constraints")?.isContainer).toBeUndefined();
  });
});

describe("forwarded option metadata", () => {
  it("forwards the flags a reader would otherwise have to guess", () => {
    const { options } = getOptionIndex();
    expect(options.get("prPriority")?.allowNegative).toBe(true);
    expect(options.get("extends")?.allowString).toBe(true);
    expect(options.get("constraints")?.freeChoice).toBe(true);
    expect(options.get("onboarding")?.inheritConfigSupport).toBe(true);
    expect(options.get("extractVersion")?.format).toBe("regex");
    expect(options.get("packageRules")?.mergeable).toBe(true);
    expect(options.get("packageRules")?.stage).toBe("package");
  });

  it("attaches the pattern and templating prose to the flags that earn it", () => {
    const { options } = getOptionIndex();
    const commitMessage = options.get("commitMessage");
    expect(commitMessage?.supportsTemplating).toBe(true);
    expect(commitMessage?.notes?.join("\n")).toContain("docs.renovatebot.com/templates/");
    const matchPackageNames = options.get("matchPackageNames");
    expect(matchPackageNames?.notes?.join("\n")).toContain("string-pattern-matching");
  });

  it("carries requiredIf with the caveat that nothing enforces it", () => {
    const { options } = getOptionIndex();
    const fileFormat = options.get("fileFormat");
    expect(fileFormat?.requiredIf).toEqual([
      { siblingProperties: [{ property: "customType", value: "jsonata" }] },
    ]);
    expect(fileFormat?.notes).toContain(REQUIRED_IF_NOTE);
  });

  it("turns experimental issue numbers into links once, in the engine", () => {
    const { options } = getOptionIndex();
    expect(options.get("configMigration")?.experimentalIssueUrls).toEqual([
      "https://github.com/renovatebot/renovate/issues/16359",
    ]);
  });
});

/**
 * The regression net for a Renovate bump, alongside `migration-drift`: these
 * hold for every option in the table, so an upstream change to the shape of
 * `parents` cannot land quietly.
 */
describe("invariants over the whole option table", () => {
  it("states a placement for every option, restricted exactly when upstream says so", () => {
    const { options, containers } = getOptionIndex();
    const upstream = new Map(getOptions().map((option) => [option.name, option]));
    // a floor, not a pin: upstream adds options in ordinary minor releases, and
    // a pinned count would fail the `renovate` bump's snapshot refresh (an
    // artifact error on the bump PR) for a change this suite does not care about
    expect(upstream.size).toBeGreaterThan(400);
    expect(options.size).toBe(upstream.size + 1); // + the hand-modeled $schema

    for (const doc of options.values()) {
      const option = upstream.get(doc.name);
      const declaresParents = Boolean(option && getAllowedParents(option));
      expect(doc.placement.kind, doc.name).toBe(declaresParents ? "restricted" : "unrestricted");
      // The parents list, or an empty one when the option is unrestricted —
      // so the "no dotted paths" claim is asserted for every option rather
      // than only for the ones that reach inside an `if`.
      const parents = doc.placement.kind === "restricted" ? doc.placement.parents : [];
      expect(parents, doc.name).not.toContain(".");
      expect(doc.isContainer, doc.name).toBe(containers.has(doc.name) ? true : undefined);
      expect(doc.childOptions, doc.name).toEqual(containers.get(doc.name));
    }
  });
});
