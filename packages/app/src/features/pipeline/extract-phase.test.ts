import { describe, expect, it } from "vitest";
import {
  depGroups,
  extractNodes,
  fileDepNote,
  fileDepTone,
  fileRows,
  managerNotes,
  managerRows,
  matchedManagerNames,
  scannedFiles,
} from "./extract-phase";
import type { RepoDep, RepoDepFile, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — what the Extract phase is allowed to SAY about a walk.
 *
 * The claims under test are honesty claims: a file the fetch cap dropped is
 * never counted as scanned and never described as empty, the manager
 * denominator is the walk's own, and the footnotes state the config the walk
 * does not apply.
 */

function dep(name: string, file: string, manager: string): RepoDep {
  return {
    key: `${file}:0:${name}`,
    depName: name,
    value: "1.0.0",
    meta: `${file} · 1.0.0`,
    manager,
    packageFile: file,
    fill: { depName: name, manager, packageFile: file },
  };
}

function walkFile(path: string, managers: string[], over: Partial<RepoDepFile> = {}): RepoDepFile {
  return { path, managers, extractedBy: null, depCount: 0, outcome: "not-read", ...over };
}

const VIEW: RepoDepsView = {
  status: "ready",
  repo: "acme/webapp",
  deps: [
    dep("react", "package.json", "npm"),
    dep("typescript", "package.json", "npm"),
    dep("node", "Dockerfile", "dockerfile"),
  ],
  files: [
    walkFile("package.json", ["npm"], { extractedBy: "npm", depCount: 2, outcome: "extracted" }),
    walkFile("Dockerfile", ["dockerfile"], {
      extractedBy: "dockerfile",
      depCount: 1,
      outcome: "extracted",
    }),
    walkFile("docs/package.json", ["npm"]),
    walkFile(".github/workflows/ci.yml", ["github-actions"], { outcome: "no-deps" }),
  ],
  managersConsidered: 100,
  truncated: false,
  error: null,
};

describe("extractNodes", () => {
  it("counts managers, scanned files and deps, each against what the walk did", () => {
    const [managers, files, deps] = extractNodes(VIEW);

    expect(managers?.meta).toBe("3");
    expect(managers?.outcome).toBe("3 of 100 managers matched files");
    // Three of the four matched files were READ — the fourth is past the cap.
    expect(files?.meta).toBe("3 package files");
    expect(files?.outcome).toBe("3 package files scanned");
    expect(deps?.meta).toBe("+3");
    expect(deps?.metaTone).toBe("ok");
    expect(deps?.outcome).toBe("3 dependencies from acme/webapp");
  });

  it("says one dependency rather than 1 dependencies", () => {
    const nodes = extractNodes({ ...VIEW, deps: [dep("react", "package.json", "npm")] });
    expect(nodes[2]?.outcome).toBe("1 dependency from acme/webapp");
  });
});

describe("the walk's own rows", () => {
  it("lists managers most files first, with every claimed file", () => {
    const rows = managerRows(VIEW);

    expect(rows.map((row) => row.manager)).toEqual(["npm", "dockerfile", "github-actions"]);
    expect(rows[0]?.files.map((f) => f.path)).toEqual(["package.json", "docs/package.json"]);
    expect(rows[0]?.preview).toBe("package.json, docs/package.json");
  });

  it("keeps a file the cap dropped out of the scanned list", () => {
    expect(scannedFiles(VIEW).map((f) => f.path)).not.toContain("docs/package.json");
    expect(matchedManagerNames(VIEW)).toContain("npm");
    expect(fileRows(VIEW).map((row) => row.file.path)).toEqual([
      "package.json",
      "Dockerfile",
      ".github/workflows/ci.yml",
    ]);
  });

  it("hands each scanned file the deps that came out of it", () => {
    const rows = fileRows(VIEW);
    expect(rows[0]?.deps.map((d) => d.depName)).toEqual(["react", "typescript"]);
    expect(rows[2]?.deps).toEqual([]);
  });

  it("never calls an unread file empty", () => {
    expect(fileDepNote(walkFile("docs/package.json", ["npm"]))).toBe("not read");
    expect(fileDepNote(walkFile("a.yml", ["x"], { outcome: "no-deps" }))).toBe("no deps");
    expect(fileDepNote(walkFile("b.json", ["x"], { outcome: "unreadable" }))).toBe(
      "could not be read",
    );
    expect(fileDepNote(walkFile("c.json", ["x"], { outcome: "error" }))).toBe("extraction failed");
    expect(
      fileDepNote(
        walkFile("d.json", ["x"], { outcome: "extracted", depCount: 6, extractedBy: "x" }),
      ),
    ).toBe("6 deps");
  });

  it("tones only a real count as a result", () => {
    expect(fileDepTone(walkFile("a", ["x"], { outcome: "extracted", depCount: 6 }))).toBe("ok");
    expect(fileDepTone(walkFile("b", ["x"], { outcome: "extracted", depCount: 0 }))).toBe(
      "neutral",
    );
    expect(fileDepTone(walkFile("c", ["x"]))).toBe("neutral");
  });

  it("groups the deps by the manager that read them, in extraction order", () => {
    expect(depGroups(VIEW).map((group) => [group.manager, group.deps.length])).toEqual([
      ["npm", 2],
      ["dockerfile", 1],
    ]);
  });
});

describe("managerNotes", () => {
  it("accounts for the managers that matched nothing and the files nobody read", () => {
    const notes = managerNotes(VIEW);

    expect(notes[0]).toBe("97 other managers matched no files.");
    // The shared clause (`lib/discovery-caveats`), sentence-cased by this card.
    expect(notes[1]).toContain("1 matched file not read");
    // The permanent one: this walk is not config-aware, and says so.
    expect(notes.at(-1)).toContain("enabledManagers and ignorePaths from your merged config");
  });

  it("drops the counts it has nothing to report, and adds the truncation", () => {
    const notes = managerNotes({
      ...VIEW,
      managersConsidered: 2,
      files: VIEW.files.slice(0, 2),
      truncated: true,
    });

    expect(notes.some((note) => note.includes("other manager"))).toBe(false);
    expect(notes.some((note) => note.includes("not read"))).toBe(false);
    expect(notes.some((note) => note.includes("truncated"))).toBe(true);
  });
});
