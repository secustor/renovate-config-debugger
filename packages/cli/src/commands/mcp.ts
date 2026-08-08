import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { Command } from "../command";
import { errorMessage, EXIT_OK } from "../io";
import { createMcpServer } from "../mcp/server";

/**
 * Roadmap 060: the MCP server, as a subcommand rather than a second package —
 * one entry point to install, document and hint at.
 *
 * SDK v2 serves it through the stdio ENTRY (`serveStdio`) rather than by
 * connecting a server to a transport directly, because the entry owns the era
 * decision for the connection: an opening `server/discover` pins a 2026-07-28
 * instance, a plain `initialize` pins a 2025-era one, and both come from the
 * same factory — so a client that speaks either revision is served by one
 * process, with no branching in the tool code. `legacy: 'reject'` would turn
 * the old handshake off; the default that keeps it is deliberate, since that
 * is still what most hosts speak.
 *
 * NOTHING may be written to stdout here: on a stdio transport, stdout IS the
 * protocol. Diagnostics go to stderr, which is why the server takes `io` and
 * uses only `io.err`.
 *
 * The process stays alive until the client closes the transport, so this
 * command returns only when the session ends.
 */
export const mcpCommand: Command = {
  name: "mcp",
  summary: "run as an MCP server over stdio (for agent sessions)",
  usage: ["mcp"],
  details: [
    "Register it once and every later session has the tools:",
    "  claude mcp add rcd -- pnpm dlx @renovate-config-debugger/cli mcp",
    "",
    "Same answers as the subcommands, better economics for a session: the",
    "engine boots once, and `run_config` HOLDS the trace so the drill-down",
    "tools query one consistent run instead of re-resolving per question.",
    "",
    "Speaks MCP 2026-07-28 and the legacy 2025-era handshake; the era is",
    "chosen per connection, so older clients keep working.",
  ],
  options: [],
  async run(_args, io) {
    // The wire is built here rather than left to `serveStdio`'s default for
    // one reason: the command has to observe it closing (below), and the
    // entry's handle reports only its own teardown. From the call on, the
    // entry owns it — it starts it, pumps every inbound message through it
    // and closes it when the connection ends.
    const transport = new StdioServerTransport();
    // ONE factory serves both eras; a probe instance the entry discards costs
    // a run store and nothing else.
    serveStdio(() => createMcpServer(io), {
      transport,
      onerror: (error) => io.err(`rcd: MCP server: ${errorMessage(error)}\n`),
    });
    io.err("rcd: MCP server ready on stdio.\n");
    await new Promise<void>((resolve) => {
      // MCP's Transport is not an EventTarget: `onclose` is the SDK's own
      // callback property, and `serveStdio` already installed the entry's
      // own handler on it — hence the chain rather than an assignment.
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- see above
      const closeEntry = transport.onclose;
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- see above
      transport.onclose = () => {
        closeEntry?.();
        resolve();
      };
    });
    return EXIT_OK;
  },
};
