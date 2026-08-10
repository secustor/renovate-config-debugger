/**
 * The suites that run against the SHIMMED module graph — the browser's graph.
 *
 * One list, two consumers: this package's `shimmed` project runs them against
 * `src/`, and `packages/cli`'s `bundle` project re-runs the same files with the
 * engine pointed at the published `dist/engine-surface.js` (roadmap 059). The
 * parity proof is only worth what it covers, so a suite added here must not be
 * able to reach one regime and miss the other — which a glob per config, in a
 * directory where two of these files carry no `.shimmed.` infix, could not
 * guarantee.
 *
 * Paths are relative to `packages/engine`; the CLI config prefixes them.
 */
export const SHIMMED_TESTS = [
  "test/global-inherit.shimmed.test.ts",
  "test/pipeline.shimmed.test.ts",
  "test/preset-fetchers.test.ts",
  "test/provenance.shimmed.test.ts",
  "test/repo-config.test.ts",
  "test/resolved-config.shimmed.test.ts",
  "test/simulate-package-rules.shimmed.test.ts",
  "test/version.shimmed.test.ts",
];
