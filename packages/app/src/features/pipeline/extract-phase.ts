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

/** A custom-manager label (roadmap 093) — the walk names them `custom.<type>`,
 *  and they count against `customManagersConsidered`, not the built-in N. */
function isCustomManager(manager: string): boolean {
  return manager.startsWith("custom.");
}

/** The matched labels split the way the two denominators are: built-in names
 *  against `managersConsidered`, custom ones against the config's blocks. */
function matchedManagerCounts(view: RepoDepsView): { builtIn: number; custom: number } {
  const matched = matchedManagerNames(view);
  const custom = matched.filter(isCustomManager).length;
  return { builtIn: matched.length - custom, custom };
}

/** The files a custom block claimed — the honest custom half of the manager
 *  node's sentence, since which BLOCK claimed a file does not ride on the
 *  ledger (only its `custom.<type>` label does). */
function customClaimedFiles(view: RepoDepsView): RepoDepFile[] {
  return view.files.filter((file) => file.managers.some(isCustomManager));
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
 * result, which is the one number the rail's `ok` green is for. The meta counts
 * every matched label, custom ones included; the sentence keeps the two
 * denominators apart (see `managersOutcome`).
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
      outcome: managersOutcome(view),
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

/**
 * The manager node's sentence. "K of N managers" stays the BUILT-IN
 * arithmetic; the run's custom blocks are a second, differently-shaped count
 * (blocks considered, files they claimed), so they are said as their own
 * clause rather than folded into a ratio they do not share. Omitted entirely
 * when the run supplied no usable blocks.
 */
function managersOutcome(view: RepoDepsView): string {
  const { builtIn } = matchedManagerCounts(view);
  const base = `${nf.format(builtIn)} of ${nf.format(view.managersConsidered)} managers matched files`;
  if (view.customManagersConsidered === 0) {
    return base;
  }
  const blocks = plural(view.customManagersConsidered, "custom manager");
  const claimed = customClaimedFiles(view).length;
  return claimed === 0
    ? `${base}; your ${blocks} matched none`
    : `${base}, plus your ${blocks} claiming ${plural(claimed, "file")}`;
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

/** Why the extraction failed, for the row's expanded body — the count slot only
 *  has room for "extraction failed", and a broken `matchStrings` is the
 *  reader's own config (roadmap 093). Null when there is nothing to add. */
export function fileDepDetail(file: RepoDepFile): string | null {
  return file.error ?? null;
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
 * The last one is permanent until the discovery grows a fully config-aware
 * walk: `enabledManagers` and `ignorePaths` from the merged config are not
 * applied to it (only Renovate's own default ignore of `node_modules`/
 * `bower_components` and — since 093 — the config's `customManagers` are), so
 * production Renovate may consider fewer managers and fewer files than this
 * list shows. Saying so is cheaper than a reader concluding their
 * `enabledManagers` is being ignored by Renovate too.
 */
export function managerNotes(view: RepoDepsView): string[] {
  const notes: string[] = [];
  // Against the BUILT-IN denominator only: a `custom.` label matched a block
  // the walk was handed, not one of the N managers it asked.
  const { builtIn, custom } = matchedManagerCounts(view);
  const others = view.managersConsidered - builtIn;
  if (others > 0) {
    notes.push(`${plural(others, "other manager")} matched no files.`);
  }
  if (view.customManagersConsidered > 0 && custom === 0) {
    notes.push(
      `Your ${plural(view.customManagersConsidered, "custom manager block")} matched no files.`,
    );
  }
  // The shared clauses every discovery surface prints (`lib/discovery-caveats`)
  // — this card only sentence-cases them, so its counts and the footnotes'
  // are one arithmetic.
  notes.push(...discoveryCaveats(view).map((clause) => `${sentenceCase(clause)}.`));
  notes.push(
    "Renovate’s default ignorePaths (node_modules, bower_components) were applied, and so " +
      "were your config’s customManagers; enabledManagers and ignorePaths from your merged " +
      "config were not.",
  );
  return notes;
}

function sentenceCase(clause: string): string {
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}
