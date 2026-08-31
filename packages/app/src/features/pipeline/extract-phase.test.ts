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
import { readyView, repoDep as dep, walkFile } from "@tools/test/repo-deps";
import type { RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — what the Extract phase is allowed to SAY about a walk.
 *
 * The claims under test are honesty claims: a file the fetch cap dropped is
 * never counted as scanned and never described as empty, the manager
 * denominator is the walk's own, and the footnotes state the config the walk
 * does not apply.
 */

const VIEW: RepoDepsView = readyView([
  dep("react", "package.json", "npm"),
  dep("typescript", "package.json", "npm"),
  dep("node", "Dockerfile", "dockerfile"),
]);

/** Roadmap 093: the same walk, with two custom blocks in the run's config —
 *  one of which claimed (and extracted from) a file no built-in claims. */
const CUSTOM_VIEW: RepoDepsView = {
  ...VIEW,
  customManagersConsidered: 2,
  deps: [...VIEW.deps, dep("kubectl", "k8s/deploy.yaml", "custom.regex")],
  files: [
    ...VIEW.files,
    walkFile("k8s/deploy.yaml", ["custom.regex"], {
      extractedBy: "custom.regex",
      depCount: 1,
      outcome: "extracted",
    }),
  ],
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

  it("counts the run's custom blocks beside the built-in ratio, never inside it", () => {
    const [managers] = extractNodes(CUSTOM_VIEW);

    // The meta is every matched label; the sentence keeps the two denominators
    // apart — 3 built-ins of 100, and the blocks as their own clause.
    expect(managers?.meta).toBe("4");
    expect(managers?.outcome).toBe(
      "3 of 100 managers matched files, plus your 2 custom managers claiming 1 file",
    );
  });

  it("says so when the custom blocks claimed nothing", () => {
    const [managers] = extractNodes({ ...VIEW, customManagersConsidered: 1 });
    expect(managers?.outcome).toBe(
      "3 of 100 managers matched files; your 1 custom manager matched none",
    );
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

  it("keeps the 'matched no files' count against the built-in managers only", () => {
    const notes = managerNotes(CUSTOM_VIEW);

    // Four labels matched, but only three of them are managers the walk ASKED
    // — the custom one came from the config, not from the ledger of 100.
    expect(notes[0]).toBe("97 other managers matched no files.");
    expect(notes.some((note) => note.includes("custom manager block"))).toBe(false);
    expect(notes.at(-1)).toContain("so were your config’s customManagers");
  });

  it("reports custom blocks that matched nothing", () => {
    const notes = managerNotes({ ...VIEW, customManagersConsidered: 2 });
    expect(notes).toContain("Your 2 custom manager blocks matched no files.");
  });
});
