import {
  EXTRACTABLE_MANAGERS,
  type ExtractOutcome,
  extractDeps,
  matchManagersForFile,
} from "@renovate-config-debugger/engine";

/**
 * "What would Renovate extract from this file?" — behind `rcd extract` and the
 * MCP server's `extract_deps` (see `./pipeline` for what this layer is). No
 * held run is involved: the answer depends only on the file's content and the
 * pinned Renovate's own managers. Mirrors 087's engine surface exactly —
 * `matchManagersForFile` for filename detection, `extractDeps` per matched
 * manager — so this layer adds no logic of its own beyond running one over the
 * other and reporting both.
 *
 * Several managers can legitimately claim one filename (`pyproject.toml` is
 * pep621's, pixi's and poetry's): with no `manager`, every EXTRACTABLE match
 * runs and gets its own section. `manager` forces one — the only door for a
 * pattern-less manager (empty `managerFilePatterns`), and how to pick among
 * several claimants.
 */

export interface ExtractionQuestion {
  fileName: string;
  content: string;
  manager?: string | undefined;
  /** Stops enqueuing further managers when the caller cancelled (MCP). */
  signal?: AbortSignal | undefined;
}

export interface ExtractReport {
  fileName: string;
  /** Every manager whose file patterns matched, extractable or not. */
  matchedManagers: string[];
  requestedManager?: string;
  results: ExtractOutcome[];
}

export async function askExtraction(question: ExtractionQuestion): Promise<ExtractReport> {
  const { fileName, content, manager, signal } = question;
  const matchedManagers = matchManagersForFile(fileName);
  if (manager) {
    return {
      fileName,
      matchedManagers,
      requestedManager: manager,
      results: [await extractDeps({ fileName, content, manager }, signal)],
    };
  }
  const extractable = matchedManagers.filter((m) => EXTRACTABLE_MANAGERS.includes(m));
  if (extractable.length === 0) {
    // Either nothing matched (`no-manager`) or everything that did is
    // unmapped (`unsupported-manager`) — one call with no override reports
    // exactly which, in the engine's own words.
    return {
      fileName,
      matchedManagers,
      results: [await extractDeps({ fileName, content }, signal)],
    };
  }
  const results: ExtractOutcome[] = [];
  // Sequential on purpose: the engine serializes its queue anyway, and a
  // cancelled call must stop enqueuing.
  for (const candidate of extractable) {
    results.push(await extractDeps({ fileName, content, manager: candidate }, signal));
  }
  return { fileName, matchedManagers, results };
}

/** Whether at least one section actually produced dependencies. */
export function anySucceeded(report: ExtractReport): boolean {
  return report.results.some((outcome) => outcome.ok);
}
