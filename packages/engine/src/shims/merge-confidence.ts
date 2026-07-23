/**
 * Browser shim for renovate/dist/util/merge-confidence/index.js, whose real
 * implementation drags got (a Node-only HTTP stack, via util/http) into the
 * bundle — got crashes at module-evaluation time in the browser. The only
 * consumer in the browsered subgraph is the MergeConfidenceMatcher
 * (util/package-rules/merge-confidence.js), which calls `getApiToken()` and
 * throws MISSING_API_CREDENTIALS when it is undefined — exactly what a
 * browser run, which can define no merge-confidence host rule, should see.
 * The 006 simulator never invokes that matcher, reporting `matchConfidence`
 * clauses as "not simulated" instead.
 */
export function getApiToken(): string | undefined {
  return undefined;
}
