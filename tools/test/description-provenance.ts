/**
 * The `DescriptionProvenance` record the description card and its digest are
 * built from (roadmap 069/083). Three suites used to spell the same builder
 * out, and one of them had already dropped the length invariant.
 *
 * Under `tools/test` like the discovery fixtures: test scaffolding can never
 * ride into the production build.
 */
import type { DescriptionProvenance } from "@renovate-config-debugger/engine";

/** The engine guarantees `entries.length + unattributed.length ===
 *  finalLength`; the fixture keeps that unless a test overrides it on purpose. */
export function descriptionProvenance(
  overrides: Partial<DescriptionProvenance> = {},
): DescriptionProvenance {
  const attributed = overrides.entries ?? [];
  const nonText = overrides.unattributed ?? [];
  return {
    dropped: [],
    ruleDescriptions: [],
    degraded: false,
    finalLength: attributed.length + nonText.length,
    ...overrides,
    entries: attributed,
    unattributed: nonText,
  };
}
