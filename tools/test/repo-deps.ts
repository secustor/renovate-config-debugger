/**
 * The shared fixtures for repository DISCOVERY (roadmap 087/089/090): the
 * `RepoDepsView` a walk produces, one extracted dependency, one matched file,
 * and the connect offer the pre-report states are drawn from.
 *
 * Four suites across three slices assert on this one record — the Dependencies
 * tab, the Pipeline tab's Extract phase and its picker, and the Extract phase's
 * pure derivations — and every one of them used to spell the whole nine-field
 * view by hand. Adding `files` and `managersConsidered` to the type then meant
 * hand-patching each copy, which is the bill this file exists to stop paying.
 *
 * Under `tools/test` rather than in the app's `src/`, like the oauth harness:
 * test scaffolding can never ride into the production build, and a fixture
 * shared by two feature slices has no home inside either of them.
 */
import type { RepoConnectOffer, RepoDep, RepoDepFile } from "@/types/repo";

/** A repository nothing has been loaded from — the base every other state is
 *  spread over, and the "not loaded" state on its own. Re-exported from the
 *  app's own idle view rather than re-typed, so a fixture can never describe a
 *  record the app would not produce. */
export { EMPTY_REPO_DEPS as EMPTY_VIEW } from "@/features/simulator/repo-deps";

/** The shell's offer, with both handlers inert. Pass `{ onConnect }` /
 *  `{ onOpenLoad }` over it to assert one was called. */
export const CONNECT_OFFER: RepoConnectOffer = {
  suggestion: null,
  onConnect: () => undefined,
  onOpenLoad: () => undefined,
};

/** One extracted dependency, keyed the way discovery keys them. */
export function repoDep(
  name: string,
  file: string,
  manager: string,
  over: Partial<RepoDep> = {},
): RepoDep {
  return {
    key: `${file}:0:${name}`,
    depName: name,
    value: "1.0.0",
    meta: `${file} · 1.0.0`,
    manager,
    packageFile: file,
    fill: { depName: name, manager, packageFile: file },
    ...over,
  };
}

/** One file the walk matched. Defaults to the honest worst case — claimed and
 *  never read — so a test that means anything else has to say so. */
export function walkFile(
  path: string,
  managers: string[],
  over: Partial<RepoDepFile> = {},
): RepoDepFile {
  return { path, managers, extractedBy: null, depCount: 0, outcome: "not-read", ...over };
}
