# 067 — semantic-release: one version for every public package

Milestone: M16 · Status: done (2026-08-10)

## Summary

059 left the release as a manual ritual: bump `packages/cli/package.json` by
hand, add a compat row by hand, push a `cli-v<version>` tag, write a GitHub
release, and hope the three agree — the publish workflow checked only that the
tag matched the version. This item hands the arithmetic to semantic-release.
A `workflow_dispatch` run reads the conventional commits since the last `v*`
tag, decides the version, stamps it into **every package that is not
`private`**, publishes them to npm, and writes the GitHub release with the
generated notes.

The decision to release stays a decision. Which version, and what the notes
say, stops being one.

## User story

As the maintainer, I want to press one button and get a correct release — the
same version across the public packages, a changelog I did not write, a GitHub
release, and npm tarballs — so that shipping is not an eight-step checklist
where step four is the one that goes wrong.

## Scope

- `release.config.mjs` at the root, `.github/workflows/release.yml` on
  `workflow_dispatch` only (dry run by default).
- `tools/release/` — the version stamp, the publish loop and the preflight
  guards, all driven off `pnpm list` rather than a hardcoded package list.
- `packages/cli/scripts/stamp-compat.ts` — 059's compat row, written by the
  release instead of by hand, sharing one parser with `check-compat.ts`.
- `publish-cli.yml` retired; its gates moved into `release.yml`.

## Decisions

- **One version for all public packages, not independent versioning.** The
  packages are cut from the same tree and embed the same Renovate; "which CLI
  matches which engine" should be answered by the numbers being equal, not by
  a matrix. The cost is publishing a package that did not change in a given
  release. At 0.x, against a repository this size, that is much cheaper than
  the alternative — and it is why the tag is `v<version>`, not 059's
  per-package `cli-v<version>`: there is one release, and it covers whatever
  is currently public.
- **"Public" is `private: false`, discovered at release time.** Today that is
  `packages/cli` alone. When 056 unprivates the engine it joins the release
  with no edit to any of this. A list maintained in the release tooling would
  be a second source of truth for something a manifest already states.
- **Breaking changes bump the MINOR.** 059 committed to a `0.x` scheme with
  breaking changes in the minor; semantic-release's default would take the
  first `feat!:` straight to `1.0.0` and imply a stability promise the CLI
  explicitly does not make. One `releaseRules` entry in `release.config.mjs`
  says so, and carries the note to delete it at 1.0.
- **A Renovate bump is a release, enforced in `renovate.json`.** 059 required
  it; nothing made it happen. `renovate` sits in `packages/engine`'s
  `dependencies` with `semanticCommitType: "fix"` pinned on its packageRule, so
  the bump PR lands as `fix(deps): …` and the next release picks it up as a
  patch. Every other dependency here is bundled at build time from a
  `devDependency` and lands as `chore(deps): …`, which releases nothing —
  lockfile maintenance should not cut a version.
- **The compat row is stamped, and still checked.** `stamp-compat.ts` writes
  the row from the same three facts `check-compat.ts` reads, during `prepare`
  and before `build`. The check is not redundant: the release stamps one row,
  the check catches every _other_ way the table can stop being true — a
  Renovate bump on main, a manual edit, a botched merge. Both now share
  `compat-table.ts` rather than parsing the README twice.
- **The release commit goes back to main.** The compat table is release
  history and has to accumulate; if the stamped row never returned, the next
  release would prepend onto a stale table and drop the previous row.
  `@semantic-release/git` commits `CHANGELOG.md`, the manifests and the CLI
  README as `chore(release): v<version> [skip ci]`.
- **`pnpm publish`, not `@semantic-release/npm`.** pnpm is the only publisher
  of the three that rewrites `workspace:*` to a real range while packing. The
  CLI inlines its workspace deps and has none left in the tarball, but the next
  public package need not, and a literal `workspace:*` in a published manifest
  is a broken install nobody notices until someone runs it.
- **Dry run is the default.** A published version is permanent; the obvious
  button press should be the safe one. Untick `dry-run` to actually release.

## As built (2026-08-10)

- `release.config.mjs` chains four things through `@semantic-release/exec`,
  and the order is the whole reason it is a chain: `prepare.ts` writes the
  version into the manifests, `stamp-compat.ts` writes the row _from_ that
  version, and only then does `build` run — because `check-compat.ts` runs
  inside the build and compares the two.
- `tools/release/verify.ts` fails the run before anything is computed when
  there is no `v*` tag (semantic-release would otherwise silently call the
  first release `1.0.0`) or no npm token on a non-dry run (which would
  otherwise die at the last step with the tree half-stamped). Both errors say
  what to do about it.
- `compat-table.ts` re-renders the whole table with the columns padded to
  their widest cell, so a two-digit minor produces a one-row diff instead of
  re-aligning every historical row.
- `release.yml` runs 059's gates — lint, format, typecheck, CLI tests, the
  build, the bundle-parity suite and a bin smoke test — on the exact tree
  being released, before semantic-release starts. Only the version string
  differs between that build and the one the release makes.

## Before the first run

Three things this item cannot do for the repository:

1. **`NPM_TOKEN`** in the repository secrets, and the
   `@renovate-config-debugger` npm organization created (059's outstanding
   item — whichever of 056/059 lands first creates it).
2. **A baseline tag.** With no `v*` tag, semantic-release starts at `1.0.0`.
   Tag the merge commit of this item with the version the tree already claims:

   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```

   `verify.ts` refuses to run until that exists, so this cannot be forgotten
   silently.

3. **Push access to main for the release commit.** If main is protected, the
   default `GITHUB_TOKEN` cannot push; the workflow prefers a `RELEASE_TOKEN`
   secret (a PAT with `contents: write`) when one is set, and falls back to
   `GITHUB_TOKEN` when it is not.
