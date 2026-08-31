import {
  EXTRACTABLE_MANAGERS,
  type ExtractOutcome,
  extractDeps,
  matchManagersForFile,
  type PackageDependency,
} from "@renovate-config-debugger/engine";
import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_ERROR, EXIT_OK } from "../io";
import { emitJson, emitLines } from "../output";
import { readTextFile } from "../run-input";

/**
 * Roadmap 078's CLI half: "what would Renovate extract from this file?",
 * headless. Mirrors 087's engine surface exactly — `matchManagersForFile` for
 * filename detection, `extractDeps` per matched manager — so this command adds
 * no logic of its own beyond running one over the other and reporting both.
 *
 * Several managers can legitimately claim one filename (`pyproject.toml` is
 * pep621's, pixi's and poetry's): with no `--manager`, every EXTRACTABLE match
 * runs and gets its own section. `--manager` forces one — the only door for
 * the eleven pattern-less managers (empty `managerFilePatterns`), and how to
 * pick among several claimants.
 */

interface ExtractReport {
  fileName: string;
  /** Every manager whose file patterns matched, extractable or not. */
  matchedManagers: string[];
  requestedManager?: string;
  results: ExtractOutcome[];
}

async function runExtraction(
  fileName: string,
  content: string,
  manager?: string,
): Promise<ExtractReport> {
  const matchedManagers = matchManagersForFile(fileName);
  if (manager) {
    return {
      fileName,
      matchedManagers,
      requestedManager: manager,
      results: [await extractDeps({ fileName, content, manager })],
    };
  }
  const extractable = matchedManagers.filter((m) => EXTRACTABLE_MANAGERS.includes(m));
  if (extractable.length === 0) {
    // Either nothing matched (`no-manager`) or everything that did is
    // unmapped (`unsupported-manager`) — one call with no override reports
    // exactly which, in the engine's own words.
    return { fileName, matchedManagers, results: [await extractDeps({ fileName, content })] };
  }
  const results: ExtractOutcome[] = [];
  for (const candidate of extractable) {
    results.push(await extractDeps({ fileName, content, manager: candidate }));
  }
  return { fileName, matchedManagers, results };
}

function depLine(dep: PackageDependency, fileDatasource: string | undefined): string {
  const name = dep.depName ?? dep.packageName ?? "(unnamed)";
  const value = dep.currentValue ?? "(no current value)";
  const datasource = dep.datasource ?? fileDatasource;
  const bits = [name.padEnd(28), value.padEnd(16), datasource ?? "(no datasource)"];
  if (dep.depType) {
    bits.push(dep.depType);
  }
  return `    ${bits.join(" ")}`;
}

function reportLines(report: ExtractReport): string[] {
  const lines: string[] = [];
  for (const outcome of report.results) {
    if (outcome.ok) {
      const { manager, deps, datasource } = outcome.file;
      lines.push(
        `${manager} — ${deps.length} dependenc${deps.length === 1 ? "y" : "ies"} in ${report.fileName}`,
      );
      for (const dep of deps) {
        lines.push(depLine(dep, datasource));
      }
    } else {
      lines.push(`✗ ${outcome.message}`);
    }
    lines.push("");
  }
  return lines;
}

/** Whether at least one section actually produced dependencies. */
function anySucceeded(report: ExtractReport): boolean {
  return report.results.some((outcome) => outcome.ok);
}

export const extractCommand: Command = {
  name: "extract",
  summary: "which dependencies would Renovate extract from this file?",
  usage: ["extract <file> [--manager <name>]"],
  details: [
    "Reads the file locally and runs Renovate's own extraction, the same code",
    "path the app's From-repository tab uses — not a guess at the shape of a",
    "dependency, the real depName/currentValue/datasource/depType.",
    "",
    "With no --manager, every manager whose file patterns match the filename",
    "runs and gets its own section — pyproject.toml is pep621's, pixi's and",
    "poetry's, and all three are reported. --manager forces one: the only door",
    "for a pattern-less manager (argocd, kubernetes, tekton, pep723, …), and how",
    "to pick among several claimants.",
    "",
    "Only the curated manager set the browser engine ships runs here; a matched",
    "manager outside it reports an honest 'not supported' rather than a guess.",
  ],
  options: ["manager", "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const file = args.positionals[0];
    if (!file) {
      throw new CliError("name a file, e.g. `rcd extract package.json`");
    }
    const content = await readTextFile(file, "file");
    const manager = stringOption(args, "manager");
    const report = await runExtraction(file, content, manager);
    const ok = anySucceeded(report);

    if (format === "json") {
      emitJson(io, report);
    } else {
      const lines =
        report.results.length === 1 && !report.results[0]?.ok
          ? [`✗ ${report.results[0]?.message}`]
          : reportLines(report);
      emitLines(io, lines);
    }
    return ok ? EXIT_OK : EXIT_ERROR;
  },
};
