import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, json, messageLines, stageLines, writeNotes } from "../output";
import { parseConfigScope, parseKeys, projectConfig } from "../projections/config-view";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * The superset: raw `TraceResult` slices. Everything else is `run` plus a
 * projection, so this is where an agent goes when it wants the event stream or
 * the stage ordering itself.
 */

const SELECTABLE = [
  "status",
  "errors",
  "warnings",
  "final",
  "events",
  "tree",
  "layers",
  "platform",
] as const;

type Selection = (typeof SELECTABLE)[number];

const DEFAULT_SELECTION: Selection[] = ["status", "errors", "warnings", "final"];

function parseSelection(raw: string | undefined): Selection[] {
  if (!raw) {
    return DEFAULT_SELECTION;
  }
  if (raw === "all") {
    return [...SELECTABLE];
  }
  return raw.split(",").map((part) => {
    const key = part.trim();
    const found = SELECTABLE.find((s) => s === key);
    if (!found) {
      throw new CliError(`--select: unknown slice "${key}" (known: ${SELECTABLE.join(", ")}, all)`);
    }
    return found;
  });
}

export const runCommand: Command = {
  name: "run",
  summary: "run the pipeline and print the trace slices you ask for",
  usage: ["run [file] [--select status,errors,warnings,final]"],
  details: [
    "The default selection is the small one. `--select events` and",
    "`--select tree` are the firehose: a `config:recommended` run carries",
    "over a thousand tree nodes with four config bodies each — prefer",
    "`rcd tree` / `rcd provenance`, which project them.",
    "",
    "`--keys` and `--config-scope` project `--select final` ONLY — this is the",
    "run's whole effective config, so it is reported at `--config-scope full`:",
    "the globalOnly options are the answer when you are debugging a self-hosted",
    "global or inherited layer. `--config-scope package-rules` drops them.",
  ],
  options: [...INPUT_OPTIONS, "select", "keys", "config-scope", "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const selection = parseSelection(stringOption(args, "select"));
    const keys = parseKeys(stringOption(args, "keys"));
    const scope = parseConfigScope(stringOption(args, "config-scope"), "--config-scope");
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);

    const projected =
      result.finalConfig && (keys || scope)
        ? projectConfig(result.finalConfig, { scope: scope ?? "full", ...(keys ? { keys } : {}) })
        : undefined;

    const slices: Record<string, unknown> = {};
    for (const key of selection) {
      switch (key) {
        case "status":
          slices.stageStatus = result.stageStatus;
          break;
        case "errors":
          slices.errors = result.errors;
          break;
        case "warnings":
          slices.warnings = result.warnings;
          break;
        case "final":
          slices.finalConfig = projected ? projected.config : result.finalConfig;
          if (projected) {
            slices.configView = projected.view;
          }
          break;
        case "events":
          slices.events = result.events;
          break;
        case "tree":
          slices.presetTree = result.presetTree;
          break;
        case "layers":
          slices.layerConfigs = result.layerConfigs;
          break;
        default:
          slices.platformContext = result.platformContext;
          break;
      }
    }

    if (format === "json") {
      emitJson(io, { renovateVersion: result.renovateVersion, ...slices });
    } else {
      const lines: string[] = [`Renovate ${result.renovateVersion}`];
      if (selection.includes("status")) {
        lines.push("", "Stages:", ...stageLines(result.stageStatus));
      }
      if (selection.includes("errors") && result.errors.length > 0) {
        lines.push("", "Errors:", ...messageLines("✗", result.errors));
      }
      if (selection.includes("warnings") && result.warnings.length > 0) {
        lines.push("", "Warnings:", ...messageLines("!", result.warnings));
      }
      if (selection.includes("platform")) {
        lines.push(
          "",
          `Platform: ${result.platformContext.platform} (${result.platformContext.endpoint})`,
        );
      }
      if (selection.includes("final")) {
        lines.push(
          "",
          "Effective config:",
          json(projected ? projected.config : result.finalConfig),
        );
        if (projected) {
          lines.push(`(${json(projected.view)})`);
        }
      }
      if (selection.includes("layers")) {
        lines.push("", "Layers:", json(result.layerConfigs));
      }
      if (selection.includes("tree")) {
        lines.push("", "Preset tree:", json(result.presetTree));
      }
      if (selection.includes("events")) {
        lines.push("", "Events:", json(result.events));
      }
      emitLines(io, lines);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
