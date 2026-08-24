import { describe, expect, it } from "vitest";
import { EMPTY_FORM, MULTI_VALUE_KEYS } from "./form";
import { parsePastedDescriptor, pasteImportNote } from "./paste-descriptor";

/**
 * Roadmap 082: the Paste-JSON tab's whole contract. The inputs are the shapes
 * a Renovate debug log actually produces — a descriptor with more keys than
 * this form has fields, one that names the dependency only by `depName`, and
 * the half-pasted text a reader gets when they miss a brace.
 */

describe("parsePastedDescriptor", () => {
  it("maps the known string keys and counts the rest", () => {
    const result = parsePastedDescriptor(
      JSON.stringify({
        packageName: "lodash",
        datasource: "npm",
        currentValue: "4.17.20",
        newValue: "4.17.21",
        updateType: "patch",
        manager: "npm",
        packageFile: "package.json",
        depType: "dependencies",
        // The keys a log entry carries that this form has no field for.
        fixedVersion: "4.17.20",
        updates: [{ newValue: "4.17.21" }],
        isSingleVersion: true,
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        fill: {
          packageName: "lodash",
          datasource: "npm",
          currentValue: "4.17.20",
          newValue: "4.17.21",
          updateType: "patch",
          manager: "npm",
          packageFile: "package.json",
          depType: "dependencies",
        },
        imported: 8,
        unknown: 3,
        unusable: 0,
        updateTypeGiven: true,
      },
    });
  });

  it("has a home for every field the form shows — none of them is an unknown key", () => {
    // The guard against the drift this replaced: KEYS was hand-listed and ran
    // ten fields behind the form, so a paste carrying `sourceUrl` was reported
    // as an unknown key while the form was showing an empty sourceUrl box.
    const multi = new Set<string>(MULTI_VALUE_KEYS);
    const descriptor = Object.fromEntries(
      Object.keys(EMPTY_FORM).map((key) => [key, multi.has(key) ? [`${key}-a`, `${key}-b`] : key]),
    );
    const result = parsePastedDescriptor(JSON.stringify(descriptor));

    expect(result.ok && result.value.unknown).toBe(0);
    expect(result.ok && result.value.unusable).toBe(0);
    expect(result.ok && result.value.imported).toBe(Object.keys(EMPTY_FORM).length);
    // The multi-value fields arrive as arrays and land as the comma-separated
    // string the form (and its chip editor) holds them in.
    expect(result.ok && result.value.fill.lockFiles).toBe("lockFiles-a, lockFiles-b");
    expect(result.ok && result.value.fill.sourceUrl).toBe("sourceUrl");
  });

  it("fills packageName from depName, and keeps both when both are given", () => {
    const only = parsePastedDescriptor('{"depName":"lodash"}');
    expect(only.ok && only.value.fill).toEqual({ depName: "lodash", packageName: "lodash" });
    // depName filled one field; the packageName it implies is not a second one.
    expect(only.ok && only.value.imported).toBe(1);

    const both = parsePastedDescriptor('{"depName":"actions/checkout","packageName":"checkout"}');
    expect(both.ok && both.value.fill).toEqual({
      depName: "actions/checkout",
      packageName: "checkout",
    });
  });

  it("counts a known key with an unusable value apart from an unknown one", () => {
    // `depType` IS a field of this form, so calling it an unknown key would
    // read as a bug in the parser; the note has to say what really happened.
    const result = parsePastedDescriptor(
      '{"packageName":"lodash","depType":["dependencies"],"fixedVersion":"1.0.0"}',
    );
    expect(result.ok && result.value.fill).toEqual({ packageName: "lodash" });
    expect(result.ok && result.value.unusable).toBe(1);
    expect(result.ok && result.value.unknown).toBe(1);
    expect(result.ok && result.value.updateTypeGiven).toBe(false);
    expect(result.ok && pasteImportNote(result.value)).toBe(
      "Imported 1 field from pasted JSON · 2 keys ignored (1 the form can't hold)",
    );
  });

  it("reports what is wrong instead of failing silently", () => {
    expect(parsePastedDescriptor("   ")).toEqual({
      ok: false,
      error: "Paste a dependency descriptor first.",
    });
    expect(parsePastedDescriptor('{"packageName": "lodash"').ok).toBe(false);
    expect(parsePastedDescriptor('[{"packageName":"lodash"}]')).toEqual({
      ok: false,
      error: "That JSON is not an object — a descriptor is a single object.",
    });
  });
});

describe("pasteImportNote", () => {
  it("names the count, and the ignored keys only when there are some", () => {
    const base = { fill: {}, updateTypeGiven: false, unusable: 0 };
    expect(pasteImportNote({ ...base, imported: 5, unknown: 0 })).toBe(
      "Imported 5 fields from pasted JSON",
    );
    // Pluralised both ways — the design's copy is written for the plural, and
    // "1 unknown keys" would be the one place this note reads as a template.
    expect(pasteImportNote({ ...base, imported: 1, unknown: 1 })).toBe(
      "Imported 1 field from pasted JSON · 1 unknown key ignored",
    );
  });
});
