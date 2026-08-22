import { describe, expect, it } from "vitest";
import { descriptorEntries, descriptorJsonText } from "./descriptor-json";
import { EMPTY_FORM, type FormState } from "./form";

/**
 * Roadmap 082: the document must be the descriptor — every field the
 * simulation is actually given, in a stable order, and nothing else. 079's
 * fixed eight-key preview is what this replaces: it silently omitted the
 * advanced fields that decide half the verdicts (`sourceUrl` was the decisive
 * matcher in two of the persona study's three problems).
 */

function form(over: Partial<FormState>): FormState {
  return { ...EMPTY_FORM, ...over };
}

describe("descriptorEntries", () => {
  it("prints the sentence's keys first, then every other field that is set", () => {
    const entries = descriptorEntries(
      form({
        packageName: "lodash",
        datasource: "npm",
        currentValue: "4.17.20",
        newValue: "4.17.21",
        manager: "npm",
        sourceUrl: "https://github.com/lodash/lodash",
        registryUrls: "https://registry.npmjs.org, https://npm.acme.dev",
        versioning: "semver",
      }),
      "patch",
    );

    expect(entries.map((e) => e.key)).toEqual([
      "packageName",
      "datasource",
      "currentValue",
      "newValue",
      "updateType",
      "manager",
      "sourceUrl",
      "registryUrls",
      "versioning",
    ]);
    // The multi-value fields arrive as the ARRAY Renovate receives, not as the
    // comma-joined string the form stores.
    const registries = entries.find((e) => e.key === "registryUrls");
    expect(registries?.json).toBe('["https://registry.npmjs.org","https://npm.acme.dev"]');
    expect(registries?.isString).toBe(false);
  });

  it("keeps both names when a descriptor carries two", () => {
    const entries = descriptorEntries(
      form({ packageName: "checkout", depName: "actions/checkout" }),
      "",
    );
    expect(entries.map((e) => e.key)).toEqual(["packageName", "depName"]);
  });

  it("carries the isBump flag the simulation is given", () => {
    const entries = descriptorEntries(form({ packageName: "lodash" }), "bump");
    const bump = entries.find((e) => e.key === "isBump");
    expect(bump?.json).toBe("true");
    expect(bump?.isString).toBe(false);
  });
});

describe("descriptorJsonText", () => {
  it("is the entries, so the clipboard and the screen cannot differ", () => {
    expect(
      descriptorJsonText(form({ packageName: "lodash", lockFiles: "package-lock.json" }), "patch"),
    ).toBe(
      `{
  "packageName": "lodash",
  "updateType": "patch",
  "lockFiles": ["package-lock.json"]
}
`,
    );
  });

  it("is an empty object when nothing identifying is set", () => {
    expect(descriptorJsonText(EMPTY_FORM, "")).toBe("{}\n");
    expect(descriptorEntries(EMPTY_FORM, "")).toEqual([]);
  });
});
