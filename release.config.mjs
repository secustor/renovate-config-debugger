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

const GROUP_ORDER = ["Features", "Bug Fixes", "Performance Improvements", "Reverts"];

const rankGroup = (group) => {
  const index = GROUP_ORDER.indexOf(group.title);
  return index === -1 ? GROUP_ORDER.length : index;
};

/**
 * Angular's own main template with the footer's `noteGroups` block hoisted
 * above the commit groups. `{{> footer}}` is deliberately not referenced any
 * more: it holds nothing but those notes, and rendering it too would print
 * every breaking change twice.
 */
const mainTemplate = `{{> header}}
{{#each noteGroups}}

### {{title}}

{{#each notes}}
* {{#if commit.scope}}**{{commit.scope}}:** {{/if}}{{text}}
{{/each}}
{{/each}}
{{#each commitGroups}}

{{#if title}}
### {{title}}

{{/if}}
{{#each commits}}
{{> commit root=@root}}
{{/each}}

{{/each}}
`;

/**
 * The angular preset's header pattern predates `feat!:` and its note keywords
 * only cover the singular `BREAKING CHANGE:`. Left alone, `feat(cli)!: …`
 * parses as a typeless commit: no breaking note for the analyzer to bump on,
 * and an untitled group at the bottom of the notes instead of an entry under
 * the section this file exists to put first. Both plugins parse the commits
 * separately, so both get this.
 */
const parserOpts = {
  headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
  breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!: (.*)$/,
  noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES"],
};

export default {
  // Releases are cut from main only. The workflow is `workflow_dispatch`, so
  // this is a guard against dispatching from a feature branch, not a trigger.
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        parserOpts,
        releaseRules: [
          // 059's version scheme: 0.x, breaking changes in the MINOR. Without
          // this, the first `feat!:` would jump straight to 1.0.0 and imply a
          // stability promise the CLI explicitly does not make. Delete this
          // rule at 1.0 — after that, breaking means major again.
          { breaking: true, release: "minor" },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        parserOpts,
        writerOpts: {
          mainTemplate,
          commitGroupsSort: (a, b) => rankGroup(a) - rankGroup(b) || a.title.localeCompare(b.title),
        },
      },
    ],
    [
      "@semantic-release/exec",
      {
        verifyConditionsCmd: "node tools/release/verify.ts",
        // Order matters and is the whole reason this is a chain rather than
        // three plugins: the version has to land in package.json before the
        // compatibility facts are stamped from it, and both have to land
        // before the build, because `check-compat.ts` runs inside the build
        // and — under RCD_RELEASE=1 — asserts the stamped manifest and README
        // describe this exact build.
        prepareCmd: [
          "node tools/release/prepare.ts ${nextRelease.version}",
          "node packages/cli/scripts/stamp-compat.ts",
          "RCD_RELEASE=1 pnpm --filter @renovate-config-debugger/cli build",
        ].join(" && "),
        publishCmd: "node tools/release/publish.ts",
      },
    ],
    // Deliberately NO @semantic-release/git and NO @semantic-release/changelog:
    // a release commits nothing back to main — the release-commit push was
    // exactly what main's ruleset rejects, and every committed release claim
    // eventually went stale (roadmap 067's amendment). Versions are derived
    // from tags, the GitHub release notes are the changelog, and the compat
    // history accumulates on the npm registry itself: every published version
    // carries a `renovateCompatibility` manifest field, and the next release
    // renders its table from the registry's record of them.
    "@semantic-release/github",
  ],
};
