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
import { EMPTY_REPO_DEPS } from "@/features/simulator/repo-deps";
import type { RepoConnectOffer, RepoDep, RepoDepFile, RepoDepsView } from "@/types/repo";

/** A repository nothing has been loaded from — the base every other state is
 *  spread over, and the "not loaded" state on its own. Re-exported from the
 *  app's own idle view rather than re-typed, so a fixture can never describe a
 *  record the app would not produce. */
export { EMPTY_REPO_DEPS as EMPTY_VIEW };

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

/**
 * A finished walk of `acme/webapp`: four matched files — two read, one past the
 * fetch cap, one with nothing in it — over the deps the caller passes. Each
 * read file's `depCount` is counted FROM `deps`, so a fixture can never claim a
 * file yielded a number the dep list does not back.
 */
export function readyView(
  deps: readonly RepoDep[],
  over: Partial<RepoDepsView> = {},
): RepoDepsView {
  const countIn = (file: string) => deps.filter((d) => d.packageFile === file).length;
  return {
    ...EMPTY_REPO_DEPS,
    status: "ready",
    repo: "acme/webapp",
    deps: [...deps],
    files: [
      walkFile("package.json", ["npm"], {
        extractedBy: "npm",
        depCount: countIn("package.json"),
        outcome: "extracted",
      }),
      walkFile("Dockerfile", ["dockerfile"], {
        extractedBy: "dockerfile",
        depCount: countIn("Dockerfile"),
        outcome: "extracted",
      }),
      walkFile("docs/package.json", ["npm"]),
      walkFile(".github/workflows/ci.yml", ["github-actions"], { outcome: "no-deps" }),
    ],
    managersConsidered: 100,
    ...over,
  };
}
