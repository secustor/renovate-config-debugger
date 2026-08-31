/**
 * Roadmap 090 — the Extract phase's three nodes and the rows behind each of
 * them, as pure derivations over the discovery record (`RepoDepsView`, filled
 * by the shell's `useRepoDeps`).
 *
 * Everything here is arithmetic over what the walk ACTUALLY did, and the
 * discipline the file exists to hold is that it may state nothing else. The
 * walk matches every path in the tree but reads only the first ten (087's
 * fetch cap), so a matched file the cap dropped is `not-read` — never "no
 * deps", which would be a claim about bytes nobody fetched. Likewise the
 * denominator: `managersConsidered` is how many managers the walk asked, not
 * how many managers Renovate has.
 *
 * Pure and DOM-free, so the counts, the ordering and every sentence under a
 * card are unit-testable without a renderer.
 */
import { nf, plural } from "@/lib/format";
import { discoveryCaveats } from "@/lib/discovery-caveats";
import type { RepoDep, RepoDepFile, RepoDepsView } from "@/types/repo";

export type ExtractNodeId = "managers" | "files" | "deps";

/** The tone a node's meta line wears — the rail's own vocabulary, minus the
 *  ones extraction cannot produce. */
export type ExtractNodeTone = "neutral" | "ok";

export interface ExtractNode {
  id: ExtractNodeId;
  label: string;
  /** The glyph-short line under the node's name. */
  meta: string;
  metaTone: ExtractNodeTone;
  /** The card header's sentence when this node is selected — what the step
   *  came out as, said in full. */
  outcome: string;
}

/** English plural for the one irregular noun this phase counts. */
function dependencies(n: number): string {
  return `${nf.format(n)} ${n === 1 ? "dependency" : "dependencies"}`;
}

/** Every manager's claimed files, keyed in walk order of first claim — the
 *  ONE pass the manager card's rows, names and notes all read, instead of a
 *  files×managers rescan per question (the fetch cap admits hundreds of
 *  files, so the quadratic spellings stopped being free). */
function filesByManager(view: RepoDepsView): Map<string, RepoDepFile[]> {
  const claimed = new Map<string, RepoDepFile[]>();
  for (const file of view.files) {
    for (const manager of file.managers) {
      const files = claimed.get(manager);
      if (files === undefined) {
        claimed.set(manager, [file]);
      } else {
        files.push(file);
      }
    }
  }
  return claimed;
}

/** Managers that claimed at least one file, in walk order of first claim. */
export function matchedManagerNames(view: RepoDepsView): string[] {
  return [...filesByManager(view).keys()];
}

/** The files the walk actually READ — everything the cap did not drop. */
export function scannedFiles(view: RepoDepsView): RepoDepFile[] {
  return view.files.filter((file) => file.outcome !== "not-read");
}

/**
 * The three nodes, always all three: the phase is a fixed sequence, and a
 * step that found nothing still ran.
 *
 * Only the last node's meta is toned — the deps it produced are the phase's
 * result, which is the one number the rail's `ok` green is for. The custom
 * managers 063 will add would show as "K + M custom" here; nothing produces a
 * `custom.` manager today, so the suffix is omitted rather than printed as
 * "+ 0 custom".
 */
export function extractNodes(view: RepoDepsView): ExtractNode[] {
  const managers = matchedManagerNames(view);
  const scanned = scannedFiles(view);
  const repo = view.repo === "" ? "the repository" : view.repo;
  return [
    {
      id: "managers",
      label: "Match managers",
      meta: nf.format(managers.length),
      metaTone: "neutral",
      outcome: `${managers.length} of ${nf.format(view.managersConsidered)} managers matched files`,
    },
    {
      id: "files",
      label: "Scan files",
      meta: plural(scanned.length, "package file"),
      metaTone: "neutral",
      outcome: `${plural(scanned.length, "package file")} scanned`,
    },
    {
      id: "deps",
      label: "Extract deps",
      meta: `+${nf.format(view.deps.length)}`,
      metaTone: "ok",
      outcome: `${dependencies(view.deps.length)} from ${repo}`,
    },
  ];
}

/** One row of the Match-managers card: a manager and the files it claimed. */
export interface ExtractManagerRow {
  manager: string;
  files: RepoDepFile[];
  /** The muted, ellipsized preview a collapsed row shows. Every path, joined
   *  — the row's width does the eliding, so nothing is silently dropped. */
  preview: string;
}

/** Managers that claimed a file, most files first (name as the tiebreak, so
 *  the order is stable across runs). */
export function managerRows(view: RepoDepsView): ExtractManagerRow[] {
  const rows = [...filesByManager(view)].map(([manager, files]) => {
    return { manager, files, preview: files.map((file) => file.path).join(", ") };
  });
  return rows.toSorted(
    (a, b) => b.files.length - a.files.length || a.manager.localeCompare(b.manager),
  );
}

/** What one file of the walk contributed — the count in the manager card's
 *  expanded list, and the same sentence the files card leads with. */
export function fileDepNote(file: RepoDepFile): string {
  if (file.outcome === "not-read") {
    return "not read";
  }
  if (file.outcome === "unreadable") {
    return "could not be read";
  }
  if (file.outcome === "error") {
    return "extraction failed";
  }
  return file.depCount === 0 ? "no deps" : plural(file.depCount, "dep");
}

/** Whether a file's note is a RESULT (green) or an absence (muted). */
export function fileDepTone(file: RepoDepFile): ExtractNodeTone {
  return file.outcome === "extracted" && file.depCount > 0 ? "ok" : "neutral";
}

/** One row of the Scan-files card: the file, and the deps it produced. */
export interface ExtractFileRow {
  file: RepoDepFile;
  deps: RepoDep[];
}

export function fileRows(view: RepoDepsView): ExtractFileRow[] {
  // One pass over the deps, not one filter per file — same cap arithmetic as
  // `filesByManager` above.
  const depsByFile = new Map<string, RepoDep[]>();
  for (const dep of view.deps) {
    const deps = depsByFile.get(dep.packageFile);
    if (deps === undefined) {
      depsByFile.set(dep.packageFile, [dep]);
    } else {
      deps.push(dep);
    }
  }
  return scannedFiles(view).map((file) => ({
    file,
    deps: depsByFile.get(file.path) ?? [],
  }));
}

/** One row of the Extract-deps card: a manager and everything it extracted. */
export interface ExtractDepGroup {
  manager: string;
  deps: RepoDep[];
}

/** Grouped by the manager that extracted them, in the order extraction
 *  produced them — the walk's own order, which is the file order. */
export function depGroups(view: RepoDepsView): ExtractDepGroup[] {
  const groups = new Map<string, RepoDep[]>();
  for (const dep of view.deps) {
    const existing = groups.get(dep.manager);
    if (existing === undefined) {
      groups.set(dep.manager, [dep]);
    } else {
      existing.push(dep);
    }
  }
  return [...groups].map(([manager, deps]) => ({ manager, deps }));
}

/**
 * The Match-managers card's footnotes — the honest accounting of what this
 * walk is NOT.
 *
 * The last one is permanent until the discovery grows a config-aware walk:
 * `enabledManagers` and `ignorePaths` from the merged config are not applied
 * to it (only Renovate's own default ignore of `node_modules`/
 * `bower_components` is), so production Renovate may consider fewer managers
 * and fewer files than this list shows. Saying so is cheaper than a reader
 * concluding their `enabledManagers` is being ignored by Renovate too.
 */
export function managerNotes(view: RepoDepsView): string[] {
  const notes: string[] = [];
  const matched = matchedManagerNames(view).length;
  const others = view.managersConsidered - matched;
  if (others > 0) {
    notes.push(`${plural(others, "other manager")} matched no files.`);
  }
  // The shared clauses every discovery surface prints (`lib/discovery-caveats`)
  // — this card only sentence-cases them, so its counts and the footnotes'
  // are one arithmetic.
  notes.push(...discoveryCaveats(view).map((clause) => `${sentenceCase(clause)}.`));
  notes.push(
    "Renovate’s default ignorePaths (node_modules, bower_components) were applied; " +
      "enabledManagers and ignorePaths from your merged config were not.",
  );
  return notes;
}

function sentenceCase(clause: string): string {
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}
