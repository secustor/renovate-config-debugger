/**
 * The two hook results these scripts emit. Hook output is JSON on stdout —
 * https://code.claude.com/docs/en/hooks — so nothing else may be printed
 * there (diagnostics go to stderr, see `exec.ts`).
 */

interface BlockOutput {
  decision: "block";
  reason: string;
}

interface DenyOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
}

/** Stop: don't finish the turn — `reason` is handed back to the agent. */
export function block(reason: string): void {
  const output: BlockOutput = { decision: "block", reason };
  console.log(JSON.stringify(output));
}

/** PreToolUse: refuse the call — `reason` is handed back to the agent. */
export function deny(reason: string): void {
  const output: DenyOutput = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  console.log(JSON.stringify(output));
}
