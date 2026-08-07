/**
 * The published `mergeChildConfig` — Renovate's own child-over-parent config
 * merge (overwrite scalars, concatenate arrays, recurse into objects), the
 * operation every layer of the pipeline is built out of and the one a consumer
 * needs to replay a merge of its own.
 *
 * It is re-exported through this module rather than straight off
 * `renovate-adapter.ts` (roadmap 056): the adapter also re-exports a dozen
 * `renovate/dist` modules that ship no `.d.ts` — this package declares those
 * ambiently in `src/types/`, which works inside the workspace but is not
 * something a published entry point may drag into a consumer's type graph.
 * Declaring the signature here keeps `dist/index.d.ts` free of unresolvable
 * `renovate/dist/**` type paths. The implementation is upstream's, untouched.
 */
import { mergeChildConfig as upstreamMergeChildConfig } from "./renovate-adapter";

export function mergeChildConfig<
  Parent extends Record<string, unknown>,
  Child extends Record<string, unknown> | undefined,
>(parent: Parent, child: Child): Parent & Child {
  return upstreamMergeChildConfig(parent, child);
}
