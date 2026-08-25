# 087 — The ghost row, and dependencies from the loaded repo

Milestone: M21 · Status: done · Implements the deferred halves of
[078](078-dep-proposals-from-extraction.md) and revisits one 082 ruling.
Design: Claude Design project "Renovate Config Debugger", artboard
`Pin Options.dc.html` (variants `ghost` and `repo` / `combined` with
`repoAvailable: true`).

## The ask

Two pieces of the `Pin Options` artboard were left on the table when 080/082
shipped the Tests tab:

1. **The ghost variant** — the Add-a-test card collapsed behind a
   "+ Pin a dependency…" row. 082 rejected it ("a click in front of the tab's
   primary action"); the owner has now adopted it.
2. **The From-repository tab** — pick a pin from the dependencies actually in
   the loaded repository, which 082 deferred "pending 063/078" because the
   browser engine did not extract anything yet.

## The ghost row (082's ruling, revisited)

The card starts OPEN while nothing is pinned (the empty state's CTA must point
at a form that is on screen) and collapses to the ghost row once pins exist —
the pins are the tab's subject, and the entry form takes its height only while
a pin is being made. Expanded, the strip leads with "New pin" and closes with
the × that collapses it. Every open gesture (the ghost row, the empty state's
CTA and chips — all through the seed channel) moves focus into the form
AFTER it renders; `pin-add-dom.ts` now exports the focus TARGET, because only
`AddTestBox` knows when the form is actually mounted.

## Extraction (078's engine half)

As specced: two functional shims (`shims/fs.ts`, an in-memory `util/fs`;
`shims/npm-yarn.ts`, honest "no yarn context" answers) plus inert stubs for
the got-backed http stack and the heavy lookup-only leaves
(`shims/http.ts`, `shims/extract-leaves.ts`); `src/extract.ts` with
`matchManagersForFile` (the generated file patterns through upstream's own
`getMatchingFiles`) and `extractDeps` (curated lazy deep-import map,
`massageDepNames`, memory-cache reset per run); golden/shimmed fixture pairs
per mapped manager holding the byte-identity invariant. Launch set: cargo,
dockerfile, github-actions, gomod, helm-values, maven, npm, nuget, pep621,
pip_requirements — npm and maven through their internal single-file functions,
exactly the honest single-file semantics 078 wrote down.

`extractDeps` seeds files through upstream's own `writeLocalFile`, so the
golden project (real fs under a temp `GlobalConfig.localDir`) and the shimmed
one (the in-memory store) run identical engine code.

## Deltas from 078's spec

- **The input is the loaded repository, not a pasted file-set.** 063's
  `{ path, content }` input surface still does not exist; what DOES exist is
  the 085 load path, which already proves where the config came from. A
  successful repo load records `LoadedRepo` (platform, repo, endpoint, ref,
  and the untrusted-guard's `suppressTokens`, which every discovery fetch
  obeys); a new engine `fetchRepoTree` (GitHub only, one recursive git-trees
  request through the existing host transport) lists the files; paths the
  extractable managers claim (capped at 10 — each file is a request; the view
  counts what the cap dropped) are fetched with `fetchRepoFile` and extracted.
  Discovery is on demand — the first open of the tab, never the load itself —
  and once per loaded repo.
- **No custom managers** — 063 remains unimplemented; nothing here forecloses
  it.
- **No `rcd extract` subcommand yet** — `extractDeps` is on the engine surface,
  so the CLI gets it for free when 078's remaining scope lands.

## The tab (app half)

- `features/simulator/repo-deps.ts` owns the shapes and the pure
  `PackageDependency → FormState` mapping; `app/use-repo-deps.ts` computes the
  view (the 085 layering: the shell computes, the feature draws); it enters
  `AddTestBox` through the run-view context → `ResultsColumn` → `TestsPanel` →
  `PinsView` prop chain.
- Rows carry patch/minor/major quick-pins — extraction cannot know the next
  version, so the buttons name the update TYPE and the draft card beneath the
  list is where a version may be typed; "refine any field in Manual →" hands
  the whole descriptor to the form. A row whose dep is pinned wears
  "pinned · type" instead, derived from the pins list, not remembered.
- With the third tab live, the strip carries real tablist semantics —
  `role="tablist"`, `aria-selected`, arrow-key roving — exactly what 082 said
  should arrive with it. While no repo is loaded the tab stays visible and
  honestly disabled ("load a repo first").

## Incidental fix worth recording

The vitest `server.deps.inline: [/renovate/]` pattern (engine, app, cli
configs) matched THIS REPO'S OWN PATH — every node_modules dependency was
being inlined through the vite pipeline. Harmless for the graphs the suites
loaded before; the npm manager's extract graph (find-packages, @pnpm/*) made
it pathological. The pattern now names the renovate package's store path.

## Verification

- Engine: `test/extract.node.test.ts` (golden) writes
  `__snapshots__/extract-<manager>.json`; `test/extract.shimmed.test.ts`
  reproduces them byte-for-byte, and adds the fs-store round-trip
  (Cargo.lock → `lockedVersion`) and the memory-cache reset proof
  (an unparseable actions-lock marks deps `digestManagedExternally`; the next
  run must not see it).
- App: `repo-deps.test.ts` (mapping, rows, filter);
  `TestsPanel.shimmed.test.tsx` — ghost collapse/reopen, the repo tab pinning
  a row end-to-end over a faked view, the disabled-tab state, and the tablist
  ARIA.
- e2e: `21-pinned-tests.spec.ts` asserts the ghost row on a share-link arrival
  with pins; `helpers.ts`'s `openSimulator` expands the ghost first.
