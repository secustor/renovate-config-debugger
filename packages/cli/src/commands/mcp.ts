import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Command } from "../command";
import { EXIT_OK } from "../io";
import { createMcpServer } from "../mcp/server";

/**
 * Roadmap 060: the MCP server, as a subcommand rather than a second package —
 * one entry point to install, document and hint at.
 *
 * NOTHING may be written to stdout here: on a stdio transport, stdout IS the
 * protocol. Diagnostics go to stderr, which is why the server takes `io` and
 * uses only `io.err`.
 *
 * The process stays alive until the client goes away, so this command returns
 * only when the session ends.
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
  ],
  options: [],
  async run(_args, io) {
    const server = createMcpServer(io);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    io.err("rcd: MCP server ready on stdio.\n");
    // Two ways a session ends, and the SDK only reports one of them: its stdio
    // transport listens for `data` and `error`, so a client that closes the
    // pipe reaches `io.onDisconnect` and never `transport.onclose`. Whichever
    // arrives first ends the wait.
    let disposeDisconnect: (() => void) | undefined;
    try {
      await new Promise<void>((resolve) => {
        // MCP's Transport is not an EventTarget: `onclose` is the SDK's own
        // callback property, and this is its only consumer in this process.
        // oxlint-disable-next-line unicorn/prefer-add-event-listener -- see above
        transport.onclose = () => resolve();
        disposeDisconnect = io.onDisconnect?.(resolve);
      });
    } finally {
      disposeDisconnect?.();
    }
    // Flushes whatever the transport still owes and drops its stdin listeners,
    // so the process can reach its own exit rather than being killed at one.
    await server.close();
    return EXIT_OK;
  },
};
