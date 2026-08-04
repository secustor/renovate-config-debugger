/**
 * Reads and narrows the JSON Claude Code writes to a hook's stdin.
 *
 * Hand-written guards rather than zod: these scripts have to run before
 * `pnpm install` (see `exec.ts`), and the shape needed here is three optional
 * string fields. A malformed or unexpected payload always degrades to
 * `undefined` — a hook that can't read its input must not take a decision.
 */

function readStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringAt(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

export interface HookInput {
  /** The session's working directory (CwdChanged: the *new* one). */
  cwd: string | undefined;
  /** PreToolUse only, and only for Bash calls. */
  bashCommand: string | undefined;
}

export async function readHookInput(): Promise<HookInput> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readStdin());
  } catch {
    return { cwd: undefined, bashCommand: undefined };
  }

  const isBash = stringAt(parsed, "tool_name") === "Bash";
  return {
    cwd: stringAt(parsed, "cwd"),
    bashCommand: isBash && isRecord(parsed) ? stringAt(parsed.tool_input, "command") : undefined,
  };
}
