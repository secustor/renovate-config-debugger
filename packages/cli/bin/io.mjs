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
 * exception — so a peer that closes the pipe (`rcd tree … | head`, or an MCP
 * host that stops reading) crashes the process from inside a `write` nobody
 * awaited. The SDK owns stdout only while `rcd mcp` is connected, so every
 * other command's ANSWER stream is unowned; both arms are pre-checked for an
 * existing listener, so the transport's handler and ours never displace one
 * another.
 *
 * Stderr is silent because there is nowhere left to report a broken stderr to.
 * On stdout, EPIPE is silent for the same reason, but any other write error
 * truncated the answer, so it is reported and sets a nonzero exit code — which
 * both bins preserve (`… = (await main(…)) || process.exitCode`), since the
 * event normally arrives while main is still awaited.
 *
 * `test/bin.test.ts`'s "a peer that stops reading is not a crash" covers the
 * EPIPE arm only; the non-EPIPE arm above, and the exit code it sets, are
 * still unasserted.
 */
function guardStdio() {
  if (process.stderr.listenerCount("error") === 0) {
    process.stderr.on("error", () => {});
  }
  if (process.stdout.listenerCount("error") === 0) {
    process.stdout.on("error", (err) => {
      if (err?.code === "EPIPE") {
        return;
      }
      process.stderr.write(`rcd: stdout write failed: ${err?.message ?? String(err)}\n`);
      // EXIT_ERROR from src/io.ts; the bin is outside the transformed bundle.
      process.exitCode = 1;
    });
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
