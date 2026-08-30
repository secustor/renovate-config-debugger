import { describe, expect, it } from "vitest";
import { deriveStarterPins, nextVersion, starterFormForRule } from "./starter-pins";
import { EMPTY_FORM, toDescriptor } from "./form";

/**
 * Roadmap 091: a starter pin has one job — FIRE the rule it was derived from.
 * So the tests are about the two halves of that promise: the descriptor
 * carries what the rule matches on, and a rule whose matchers cannot be
 * satisfied exactly produces nothing at all rather than a near miss.
 */

describe("starterFormForRule", () => {
  it("builds the design's pair from a manager+updateType rule and a bare updateType rule", () => {
    const grouped = starterFormForRule({
      matchManagers: ["npm"],
      matchUpdateTypes: ["minor"],
      groupName: "npm minor",
    });
    expect(grouped?.manager).toBe("npm");
    expect(grouped?.updateType).toBe("minor");
    // The version move implies the type it claims: 4.17.20 → 4.18.0.
    expect(grouped?.currentValue).toBe("4.17.20");
    expect(grouped?.newValue).toBe("4.18.0");

    const automerged = starterFormForRule({ matchUpdateTypes: ["patch"], automerge: true });
    // No ecosystem named — the app's own npm quick-fill, whose pair already IS
    // a patch, so nothing is synthesized.
    expect(automerged?.manager).toBe("npm");
    expect(automerged?.updateType).toBe("patch");
    expect(automerged?.newValue).toBe("4.17.21");
  });

  it("names the rule's own package, depType and datasource", () => {
    const form = starterFormForRule({
      matchPackageNames: ["@types/node"],
      matchDepTypes: ["devDependencies"],
      matchDatasources: ["npm"],
    });
    expect(form?.packageName).toBe("@types/node");
    expect(form?.depType).toBe("devDependencies");
    expect(form?.datasource).toBe("npm");
    // A datasource with a manager we know how to pair it with keeps the pair.
    expect(form?.manager).toBe("npm");
  });

  it("uses a neutral package for a manager it holds no sample for", () => {
    const form = starterFormForRule({ matchManagers: ["gradle"] });
    expect(form?.manager).toBe("gradle");
    expect(form?.packageName).toBe("example-package");
    expect(form?.currentValue).toBe("1.2.3");
    expect(form?.newValue).toBe("1.3.0");
  });

  it("carries a descriptor the simulator can actually run", () => {
    const form = starterFormForRule({ matchManagers: ["dockerfile"] });
    expect(form).not.toBeNull();
    const descriptor = toDescriptor(form ?? EMPTY_FORM);
    expect(descriptor.manager).toBe("dockerfile");
    expect(descriptor.updateType).toBe("major");
    expect(descriptor.currentValue).toBeDefined();
    expect(descriptor.newValue).toBeDefined();
  });

  it("skips rules whose matchers cannot be satisfied synthetically", () => {
    // A matcher with no form field to satisfy it.
    expect(starterFormForRule({ matchCurrentVersion: ">=1.0.0", automerge: true })).toBeNull();
    expect(starterFormForRule({ matchSourceUrls: ["https://github.com/a/b"] })).toBeNull();
    // Satisfiable matcher, unsatisfiable VALUE: a pattern describes a set, and
    // a starter has to be a member of it.
    expect(starterFormForRule({ matchPackageNames: ["@types/**"] })).toBeNull();
    expect(starterFormForRule({ matchPackageNames: ["/^react/"] })).toBeNull();
    expect(starterFormForRule({ matchManagers: ["!npm"] })).toBeNull();
    // An update type no version pair implies.
    expect(starterFormForRule({ matchUpdateTypes: ["lockFileMaintenance"] })).toBeNull();
    // A datasource with no manager to pair it with.
    expect(starterFormForRule({ matchDatasources: ["crate"] })).toBeNull();
    // Nothing to demonstrate: a rule with no matchers fires on everything.
    expect(starterFormForRule({ automerge: true })).toBeNull();
    // Not a rule at all.
    expect(starterFormForRule("nonsense")).toBeNull();
    expect(starterFormForRule({ matchManagers: [7] })).toBeNull();
  });

  it("skips an update type the named ecosystem's versions cannot express", () => {
    // `20-alpine` has no minor segment, and inventing one invents a tag.
    expect(
      starterFormForRule({ matchManagers: ["dockerfile"], matchUpdateTypes: ["minor"] }),
    ).toBeNull();
  });
});

describe("nextVersion", () => {
  it("moves the segment the update type names and resets what is below it", () => {
    expect(nextVersion("4.17.20", "major")).toBe("5.0.0");
    expect(nextVersion("4.17.20", "minor")).toBe("4.18.0");
    expect(nextVersion("4.17.20", "patch")).toBe("4.17.21");
    // A single segment can still move a major, suffix intact.
    expect(nextVersion("20-alpine", "major")).toBe("21-alpine");
  });

  it("returns null rather than inventing a segment", () => {
    expect(nextVersion("20-alpine", "minor")).toBeNull();
    expect(nextVersion("1.2", "patch")).toBeNull();
    expect(nextVersion("latest", "major")).toBeNull();
  });
});

describe("deriveStarterPins", () => {
  it("takes at most two, from distinct rules", () => {
    const forms = deriveStarterPins([
      { matchManagers: ["npm"], matchUpdateTypes: ["minor"], groupName: "npm minor" },
      { matchUpdateTypes: ["patch"], automerge: true },
      { matchManagers: ["dockerfile"], pinDigests: true },
    ]);
    expect(forms).toHaveLength(2);
    expect(forms.map((form) => form.updateType)).toStrictEqual(["minor", "patch"]);
  });

  it("does not pin the same descriptor twice", () => {
    const forms = deriveStarterPins([
      { matchManagers: ["npm"], matchUpdateTypes: ["minor"] },
      { matchManagers: ["npm"], matchUpdateTypes: ["minor"], automerge: true },
      { matchManagers: ["nuget"] },
    ]);
    expect(forms).toHaveLength(2);
    expect(forms[1]?.manager).toBe("nuget");
  });

  it("derives nothing from rules it cannot satisfy — the empty state stays", () => {
    expect(deriveStarterPins([])).toStrictEqual([]);
    expect(deriveStarterPins([{ matchCurrentVersion: "1.x" }, { automerge: true }])).toStrictEqual(
      [],
    );
  });
});
