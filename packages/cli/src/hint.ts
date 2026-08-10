import type { CliIo } from "./io";

/**
 * Roadmap 060: the one SHIPPED in-band mechanism by which a CLI can tell an
 * agent that a companion plugin exists.
 *
 * When Claude Code runs a command it sets `CLAUDECODE=1`; a marker line on
 * stderr is stripped from the output before the model ever sees it, and turned
 * into a one-time "install this plugin?" prompt for the *user*. Deduplicated
 * per plugin on their side, so emitting more than once is harmless — but the
 * flag below keeps it to once per process anyway.
 *
 * Everything else researched for this — hidden in-page hints, `.well-known`
 * manifests, llms.txt as a signal — was rejected: the first is the canonical
 * indirect-prompt-injection pattern, the others are consumed by no shipping
 * client (see roadmap/2026-08-agent-debug-interface-research.md).
 *
 * Expectations, deliberately set low: Claude Code only prompts for plugins
 * listed in the official Anthropic marketplace, so until such a listing exists
 * the marker is inert. It is cheap, forward-compatible, and never on stdout.
 *
 * Being off stdout turned out not to be enough: agents run commands with
 * `2>&1`, and a marker printed before a JSON payload becomes the first line of
 * a document that no longer parses. `main.ts` therefore withholds it from any
 * invocation that asked for machine output, and from `validate`, whose exit-2
 * stderr is read by a hook that strips nothing — see `answersWithoutHint`.
 */

/** Matches the plugin directory's name (roadmap 061). */
export const PLUGIN_NAME = "renovate-config-debugger";

/** Official-marketplace-only: a hint naming a self-hosted marketplace is
 *  silently dropped, so this stays pointed at the future listing. */
const MARKETPLACE = "claude-plugins-official";

export const HINT_MARKER = `<claude-code-hint v="1" type="plugin" value="${PLUGIN_NAME}@${MARKETPLACE}" />`;

let emitted = false;

/** Emits the marker on stderr, at most once per process, and only inside
 *  Claude Code. Call sites: `--help`, an unknown subcommand, the first run. */
export function emitPluginHint(io: CliIo): void {
  if (emitted || io.env.CLAUDECODE !== "1") {
    return;
  }
  emitted = true;
  io.err(`${HINT_MARKER}\n`);
}

/** Tests only: the once-per-process latch is module state. */
export function resetPluginHintForTest(): void {
  emitted = false;
}
