import { getOptionIndex, type OptionDoc, renovateVersion } from "@renovate-config-debugger/engine";
import { CliError } from "../io";
import type { RunTransport } from "../run-input";

/**
 * "What does this option mean, in the Renovate we pin?" — behind `rcd docs`
 * and the MCP server's `get_option_docs` (see `./pipeline` for what this layer
 * is). No held run is involved: the answer depends only on the pinned
 * Renovate's own option table.
 */

export interface OptionDocsQuestion {
  /** An option name, or a substring when `search` is set. */
  name: string;
  search?: boolean | undefined;
  transport: RunTransport;
}

/** Enough of an option to pick the one you meant; ask again by name for the rest. */
export interface OptionMatch {
  name: string;
  type: string;
  description: string;
}

export type OptionDocsAnswer =
  | { kind: "search"; matches: OptionMatch[]; total: number }
  | { kind: "option"; doc: OptionDoc };

const NO_SUCH_OPTION: Record<RunTransport, (name: string) => string> = {
  cli: (name) =>
    `Renovate ${renovateVersion} has no option "${name}" — try \`rcd docs ${name} --search\``,
  mcp: (name) => `Renovate ${renovateVersion} has no option "${name}" — retry with search: true`,
};

export function askOptionDocs(question: OptionDocsQuestion): OptionDocsAnswer {
  const { name, search, transport } = question;
  const index = getOptionIndex();
  if (search) {
    const needle = name.toLowerCase();
    return {
      kind: "search",
      matches: [...index.options.values()]
        .filter((doc) => doc.name.toLowerCase().includes(needle))
        .map((doc) => ({ name: doc.name, type: doc.type, description: doc.description })),
      total: index.options.size,
    };
  }
  const doc = index.options.get(name);
  if (!doc) {
    throw new CliError(NO_SUCH_OPTION[transport](name));
  }
  return { kind: "option", doc };
}
