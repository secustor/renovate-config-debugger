/**
 * Minimal `spawn` wrapper for the hook scripts.
 *
 * Deliberately dependency-free (node: builtins only, no execa): SessionStart
 * and CwdChanged run *before* `pnpm install` necessarily has — provisioning a
 * fresh worktree is what they are for — so a hook that imports from
 * node_modules cannot bootstrap the very checkout it is meant to bootstrap.
 *
 * A hook's stdout is a control channel (Claude Code parses it as the hook's
 * JSON result), so child output is captured and mirrored to stderr, never
 * forwarded to stdout.
 */
import { spawn } from "node:child_process";

export interface ExecResult {
  ok: boolean;
  output: string;
}

export interface ExecOptions {
  cwd?: string;
  /** Capture only — don't mirror the child's output to stderr. */
  quiet?: boolean;
}

export function exec(
  cmd: string,
  args: string[] = [],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, RCV_AGENT_HOOK: "1" },
    });

    let output = "";
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString();
      output += text;
      if (!opts.quiet) {
        process.stderr.write(text);
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    // ENOENT (the tool isn't installed) resolves like a failed run rather than
    // rejecting — every caller here already has to handle "the check failed".
    child.on("error", (error) => {
      resolve({ ok: false, output: `${output}${String(error)}` });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output });
    });
  });
}
