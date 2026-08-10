import { getOptionIndex, renovateVersion } from "@renovate-config-debugger/engine";
import { boolOption, outputFormat } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK } from "../io";
import { emitJson, emitLines } from "../output";

/**
 * Renovate's own option metadata, for the exact pinned version — so an agent
 * stops guessing what an option means, or whether it still exists.
 */
export const docsCommand: Command = {
  name: "docs",
  summary: "what does this Renovate option mean? (for the pinned version)",
  usage: ["docs <option>", "docs <substring> --search"],
  options: ["search", "format"],
  run(args, io) {
    const format = outputFormat(args);
    const query = args.positionals[0];
    if (!query) {
      throw new CliError("name an option, e.g. `rcd docs packageRules`");
    }
    const index = getOptionIndex();

    if (boolOption(args, "search")) {
      const needle = query.toLowerCase();
      const matches = [...index.options.values()]
        .filter((doc) => doc.name.toLowerCase().includes(needle))
        .map((doc) => ({ name: doc.name, type: doc.type, description: doc.description }));
      if (format === "json") {
        emitJson(io, { renovateVersion, query, matches });
      } else {
        emitLines(io, [
          `${matches.length} option(s) matching "${query}":`,
          ...matches.map((doc) => `  ${doc.name.padEnd(32)} ${doc.type}`),
        ]);
      }
      return Promise.resolve(EXIT_OK);
    }

    const doc = index.options.get(query);
    if (!doc) {
      throw new CliError(
        `Renovate ${renovateVersion} has no option "${query}" — try \`rcd docs ${query} --search\``,
      );
    }
    if (format === "json") {
      emitJson(io, { renovateVersion, ...doc, isContainer: index.containers.has(doc.name) });
    } else {
      emitLines(io, [
        `${doc.name} (${doc.type}${doc.subType ? ` of ${doc.subType}` : ""})`,
        "",
        doc.description,
        ...(doc.default === undefined ? [] : [`default: ${JSON.stringify(doc.default)}`]),
        ...(doc.allowedValues ? [`allowed: ${doc.allowedValues.join(", ")}`] : []),
        ...(doc.parents ? [`valid under: ${doc.parents.join(", ")}`] : []),
        ...(doc.globalOnly ? ["self-hosted (global) config only"] : []),
        ...(doc.experimental ? [`experimental: ${doc.experimentalDescription ?? "yes"}`] : []),
        ...(doc.deprecationMsg ? [`deprecated: ${doc.deprecationMsg}`] : []),
        "",
        doc.url,
      ]);
    }
    return Promise.resolve(EXIT_OK);
  },
};
