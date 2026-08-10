import { computeProvenance, type TraceResult } from "@renovate-config-debugger/engine";
import {
  buildDigestInput,
  buildRunDigest,
  clauseText,
  deriveRunFacts,
  digestText,
  effectiveTally,
  type RunFacts,
} from "@renovate-config-debugger/app/headless";
import { wouldRefuse } from "../run-input";

/**
 * The Overview tab's paragraph and the numbers behind it — shared by
 * `rcd digest` and the MCP server's `run_config` summary.
 *
 * Every number is produced by the functions the web app renders with, which is
 * what roadmap 058's hoist bought: a re-implementation here would be a second
 * source of truth for a number the paragraph quotes.
 */
export interface DigestPayload {
  digest: string;
  clauses: { id: string; tone: string; text: string }[];
  accepted: boolean;
  counts: {
    errors: number;
    warnings: number;
    rewrites: number;
    presets: number;
    effectiveOptions: number | null;
    overridden: number | null;
  };
}

export function digestPayload(result: TraceResult, facts: RunFacts = deriveRunFacts(result)) {
  const provenance = computeProvenance(result);
  const tally = provenance ? effectiveTally(provenance.values()) : null;
  const clauses = buildRunDigest(buildDigestInput(result, facts, tally));
  const payload: DigestPayload = {
    digest: digestText(clauses),
    clauses: clauses.map((clause) => ({
      id: clause.id,
      tone: clause.tone,
      text: clauseText(clause),
    })),
    accepted: !wouldRefuse(result),
    counts: {
      errors: facts.errorCount,
      warnings: facts.warningCount,
      rewrites: facts.migrateSteps.length,
      presets: facts.presetCount,
      effectiveOptions: tally?.keys ?? null,
      overridden: tally?.overridden ?? null,
    },
  };
  return payload;
}
