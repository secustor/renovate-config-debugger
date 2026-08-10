/**
 * The process, as data. Both bins build the same object and hand it to
 * `main(argv, io)`: everything under `src/` is transformed with
 * `define: { "process.env": "{}" }` (the renovate shim plugin sets it, because
 * renovate's `lib/util/env` spreads `process.env` at import time), so the CLI
 * can never read the environment itself.
 */
export function processIo() {
  guardStdio();
  return {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    env: process.env,
    readStdin: async () => {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    },
    onDisconnect,
  };
}

/**
 * A stream with no `'error'` listener turns a write failure into an UNCAUGHT
 * exception — so a peer that closes the pipe (`rcd digest … | head`, or an MCP
 * host that stops reading our diagnostics) crashes the process on the next
 * write, from inside a `write` nobody awaited.
 *
 * BOTH streams, not just stderr: the MCP SDK installs its own stdout guard,
 * but it does that while `rcd mcp` is running and only then — the other nine
 * subcommands write their answer to a stdout nobody has claimed, which is
 * exactly the `| head` case. `out()` below is that write.
 *
 * Silence is the whole point: there is nowhere left to report a broken stream
 * to. The process keeps running and its own exit code still speaks.
 */
function guardStdio() {
  for (const stream of [process.stdout, process.stderr]) {
    if (stream.listenerCount("error") === 0) {
      stream.on("error", () => {});
    }
  }
}

/**
 * The stdio peer going away, as an event `src/` can observe without touching a
 * process global. Only `rcd mcp` needs it: the MCP SDK's stdio transport
 * listens for `data` and `error` only, so a client that closes the pipe never
 * reaches `transport.onclose` and the command would wait forever.
 *
 * Registration is per call and never eager — a SIGINT/SIGTERM listener is a
 * libuv handle that refs the loop, so a command that does not ask to be told
 * must not pay for one. Returns the disposer that takes them all back off,
 * which the caller runs once the wait is over however it ended.
 */
function onDisconnect(callback) {
  const off = () => {
    process.stdin.off("end", fire);
    process.stdin.off("close", fire);
    process.off("SIGINT", fire);
    process.off("SIGTERM", fire);
  };
  const fire = () => {
    off();
    callback();
  };
  process.stdin.on("end", fire);
  process.stdin.on("close", fire);
  process.on("SIGINT", fire);
  process.on("SIGTERM", fire);
  return off;
}
