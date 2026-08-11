/**
 * Roadmap 067 — semantic-release, run by hand from `.github/workflows/release.yml`.
 *
 * One version for the whole repository: `tools/release/prepare.ts` stamps it
 * into every package that is not `private`, so "which CLI goes with which
 * engine" is answered by the numbers being equal rather than by a matrix.
 * That is also why the tag is `v<version>` and not the per-package `cli-v…`
 * that 059 sketched — there is one release, and it covers whatever is public.
 *
 * A `.mjs` config rather than `.releaserc.json` so this comment can exist; it
 * is in the lint override list next to `stylelint.config.mjs` for the default
 * export the tool requires.
 */

export default {
  // Releases are cut from main only. The workflow is `workflow_dispatch`, so
  // this is a guard against dispatching from a feature branch, not a trigger.
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        releaseRules: [
          // 059's version scheme: 0.x, breaking changes in the MINOR. Without
          // this, the first `feat!:` would jump straight to 1.0.0 and imply a
          // stability promise the CLI explicitly does not make. Delete this
          // rule at 1.0 — after that, breaking means major again.
          { breaking: true, release: "minor" },
        ],
      },
    ],
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    [
      "@semantic-release/exec",
      {
        verifyConditionsCmd: "node tools/release/verify.ts",
        // Order matters and is the whole reason this is a chain rather than
        // three plugins: the version has to land in package.json before the
        // compat row is stamped from it, and both have to land before the
        // build, because `check-compat.ts` runs inside the build and compares
        // the two.
        prepareCmd: [
          "node tools/release/prepare.ts ${nextRelease.version}",
          "node packages/cli/scripts/stamp-compat.ts",
          "pnpm --filter @renovate-config-debugger/cli build",
        ].join(" && "),
        publishCmd: "node tools/release/publish.ts",
      },
    ],
    [
      "@semantic-release/git",
      {
        // The compat table is release history, so it has to accumulate: if the
        // stamped row never came back to main, the next release would prepend
        // onto a stale table and the previous row would be lost.
        assets: [
          "CHANGELOG.md",
          "package.json",
          "packages/*/package.json",
          "packages/cli/README.md",
        ],
        // `[skip ci]`: this commit is the release that CI already passed a few
        // steps ago, re-running the full matrix on it proves nothing.
        message: "chore(release): v${nextRelease.version} [skip ci]",
      },
    ],
    "@semantic-release/github",
  ],
};
