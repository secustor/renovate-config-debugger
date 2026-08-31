import { describe, expect, it, vi } from "vitest";
import { depBadge, depFields, DEP_COLUMNS, depTableRow } from "./dep-rows";
import type { RepoDep } from "@/types/repo";

/**
 * Roadmap 089 — the `RepoDep → DataTableRow` mapping: what a row says, what it
 * groups under, what its open body lists, and what its two actions hand back.
 */

const DEP: RepoDep = {
  key: "package.json:0:react",
  depName: "react",
  value: "^17.0.0",
  meta: "package.json · ^17.0.0",
  manager: "npm",
  packageFile: "package.json",
  fill: {
    manager: "npm",
    packageFile: "package.json",
    depName: "react",
    packageName: "react",
    currentValue: "^17.0.0",
    datasource: "npm",
    depType: "dependencies",
  },
};

const NOOP = { onPin: () => undefined, onOpenInSimulator: () => undefined };

describe("depTableRow", () => {
  it("fills every declared column from the extracted descriptor", () => {
    const row = depTableRow(DEP, NOOP);
    expect(row.key).toBe(DEP.key);
    expect(row.lead).toBe("react");
    // Every column the table declares has a cell — a column with no answer
    // would render "—", never a missing key nobody noticed.
    for (const column of DEP_COLUMNS) {
      expect(row.cells).toHaveProperty(column.id);
    }
    expect(row.cells.currentValue).toBe("^17.0.0");
    expect(row.cells.datasource).toBe("npm");
    expect(row.cells.depType).toBe("dependencies");
  });

  it("groups by package file with the manager as the header's pill, and by manager", () => {
    const row = depTableRow(DEP, NOOP);
    expect(row.groups.packageFile).toEqual({ title: "package.json", pill: "npm" });
    expect(row.groups.manager).toEqual({ title: "npm" });
  });

  it("hands the WHOLE descriptor to each action, not just the name", () => {
    const onPin = vi.fn();
    const onOpenInSimulator = vi.fn();
    const row = depTableRow(DEP, { onPin, onOpenInSimulator });
    const [pin, simulate] = row.actions ?? [];

    pin?.onClick();
    simulate?.onClick();
    expect(onPin).toHaveBeenCalledExactlyOnceWith(DEP.fill);
    expect(onOpenInSimulator).toHaveBeenCalledExactlyOnceWith(DEP.fill);
  });
});

describe("depFields", () => {
  it("lists what the descriptor carries, in reading order, and omits the rest", () => {
    expect(depFields(DEP.fill).map((f) => f.label)).toEqual([
      "depName",
      "packageName",
      "currentValue",
      "datasource",
      "depType",
      "manager",
      "packageFile",
    ]);
  });

  it("drops an empty string as firmly as a missing key", () => {
    expect(depFields({ depName: "react", depType: "" }).map((f) => f.label)).toEqual(["depName"]);
  });

  it("hands each label its glossary term — the manual form's cards", () => {
    const fields = depFields({ depName: "react", packageName: "react", versioning: "semver" });
    expect(fields.map((f) => f.term)).toEqual(["simDepName", "simPackageName", "simVersioning"]);
  });
});

describe("depBadge", () => {
  it("marks a custom manager and nothing else", () => {
    expect(depBadge("npm")).toBeUndefined();
    expect(depBadge("dockerfile")).toBeUndefined();
    // Roadmap 063's managers, when they arrive.
    expect(depBadge("custom.regex")?.text).toBe("custom.regex");
    expect(depBadge("custom.jsonata")?.title).toContain("custom manager");
  });
});
