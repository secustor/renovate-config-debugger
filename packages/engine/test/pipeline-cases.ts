/**
 * The shared fixture table for the pipeline golden/shimmed pair, beside
 * `extract-cases.ts` and for the same reason: golden runs the configs through
 * the REAL renovate modules and writes the file snapshots, shimmed runs the
 * browser module graph and must reproduce them byte-for-byte. Listing the
 * names, the reader and the snapshot path once is what makes a fixture added
 * here proven on BOTH sides — two hand-kept copies could not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The configs both twins run end to end and snapshot. Other fixtures in the
 *  directory (parse-error.json5, github-preset.json) belong to one suite's own
 *  failure case, so they are read by name rather than listed here. */
export const PIPELINE_CASES: string[] = [
  "legacy-config.json",
  "migration-steps.json",
  "internal-presets.json",
  "preset-package-rules.json",
  "invalid.json",
];

export function pipelineFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

export function pipelineSnapshotPath(name: string): string {
  return `__snapshots__/${name}.final.json`;
}
