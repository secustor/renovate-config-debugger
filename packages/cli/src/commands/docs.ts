import { optionsSourceUrl, renovateVersion } from "@renovate-config-debugger/engine";
import { boolOption, outputFormat } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK } from "../io";
import { emitJson, emitLines } from "../output";
import { optionDocLines } from "../projections/option-doc";
import { askOptionDocs } from "../questions/option-docs";

/**
 * Renovate's own option metadata, for the exact pinned version — so an agent
 * stops guessing what an option means, or whether it still exists.
 */
export const docsCommand: Command = {
  name: "docs",
  summary: "what does this Renovate option mean? (for the pinned version)",
  usage: ["docs <option>", "docs <substring> --search"],
  details: [
    `Every answer is Renovate ${renovateVersion}'s own option table: type, default, allowed`,
    'values, where the option may appear (including "anywhere"), glob/regex and templating',
    "support, and, for a container, the options restricted to it.",
    `Source, pinned: ${optionsSourceUrl}`,
    "",
    "Renovate ships no per-option version history, so this cannot tell you when an option was",
    "added, changed or last worked differently — only what it means in the pinned version.",
  ],
  options: ["search", "format"],
  run(args, io) {
    const format = outputFormat(args);
    const query = args.positionals[0];
    if (!query) {
      throw new CliError("name an option, e.g. `rcd docs packageRules`");
    }
    const answer = askOptionDocs({
      name: query,
      search: boolOption(args, "search"),
      transport: "cli",
    });

    if (answer.kind === "search") {
      const { matches, total } = answer;
      if (format === "json") {
        emitJson(io, { renovateVersion, optionsSourceUrl, query, matches });
      } else {
        emitLines(io, [
          `${matches.length} of ${total} options in Renovate ${renovateVersion} match "${query}":`,
          ...matches.map((doc) => `  ${doc.name.padEnd(32)} ${doc.type}`),
        ]);
      }
      return Promise.resolve(EXIT_OK);
    }

    if (format === "json") {
      emitJson(io, { renovateVersion, optionsSourceUrl, ...answer.doc });
    } else {
      emitLines(io, optionDocLines(answer.doc, renovateVersion));
    }
    return Promise.resolve(EXIT_OK);
  },
};
