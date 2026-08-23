import type { StageId, StageStatus, ValidationMessage } from "@renovate-config-debugger/engine";
import type { CliIo } from "./io";

/**
 * Output primitives. Two rules the whole CLI keeps:
 * - the ANSWER goes to stdout, diagnostics go to stderr, so `rcd … | jq` and
 *   `rcd … > file` are always safe;
 * - `--format json` prints ONE JSON document and nothing else.
 */

export function emitJson(io: CliIo, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`);
}

export function emitLines(io: CliIo, lines: readonly string[]): void {
  io.out(`${lines.join("\n")}\n`);
}

export function writeNotes(io: CliIo, notes: readonly string[]): void {
  for (const note of notes) {
    io.err(`rcd: ${note}\n`);
  }
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const STATUS_MARK: Record<StageStatus, string> = { ok: "✓", error: "✗", skipped: "–" };

export function stageLines(stageStatus: Record<StageId, StageStatus>): string[] {
  return Object.entries(stageStatus).map(
    ([stage, status]) => `  ${STATUS_MARK[status]} ${stage.padEnd(8)} ${status}`,
  );
}

export function messageLines(prefix: string, messages: readonly ValidationMessage[]): string[] {
  return messages.map((m) => `  ${prefix} ${m.topic}: ${m.message}`);
}

/**
 * What a string COSTS on the wire — bytes, not UTF-16 code units, because
 * every budget this CLI keeps (the MCP result budget, a key index's size
 * column) is measured in the bytes a transport actually carries.
 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** A one-line preview of a value, for tables and tree rows. */
export function preview(value: unknown, max = 80): string {
  if (value === undefined) {
    return "(unset)";
  }
  const text = JSON.stringify(value) ?? String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
