/**
 * Roadmap 095 — how every discovery surface names where its rows came from: a
 * loaded repository or a Renovate log. Shared because three slices print it.
 */
import type { RepoDepsView } from "@/types/repo";

/** Whether there is anything to discover from — a loaded repo or a log. */
export function hasDepsSource(view: RepoDepsView): boolean {
  return view.source.kind === "log" || view.repo !== "";
}

export function isLogSource(view: RepoDepsView): boolean {
  return view.source.kind === "log";
}

/** `acme/webapp`, `Renovate log of acme/webapp (v44.97.5)` or `Renovate log (v44.97.5)`. */
export function repoDepsSourceLabel(view: RepoDepsView): string {
  const source = view.source;
  if (source.kind === "repo") {
    return view.repo;
  }
  // platform=local logs the literal "local" as the repository — never a name.
  const slug = source.slug === null || source.slug === "local" ? null : source.slug;
  const base = slug === null ? "Renovate log" : `Renovate log of ${slug}`;
  return source.renovateVersion === null ? base : `${base} (v${source.renovateVersion})`;
}

/** What a log-sourced view cannot promise; empty for a repository. */
export function logSourceNotes(view: RepoDepsView): string[] {
  const source = view.source;
  if (source.kind !== "log") {
    return [];
  }
  const notes: string[] = [];
  const { renovateVersion, pinnedVersion } = source;
  if (renovateVersion !== null && pinnedVersion !== null && renovateVersion !== pinnedVersion) {
    notes.push(
      `the log was written by Renovate v${renovateVersion}; this debugger runs v${pinnedVersion}`,
    );
  }
  if (source.otherBaseBranches.length > 0) {
    const shown = source.baseBranch ?? "the default branch";
    notes.push(
      `only ${shown} is shown — the log also covers ${source.otherBaseBranches.join(", ")}`,
    );
  }
  return notes;
}
