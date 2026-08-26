/**
 * The two configs the app can start you with.
 *
 * They lived at the top of `App.tsx`, where they were the first ~30 lines a
 * reader met before reaching the component. `data/` exists for exactly this —
 * content the app ships rather than logic it runs — so the shell now starts at
 * its own subject.
 */

/** What an empty session opens on: the minimum a real `renovate.json` needs. */
export const DEFAULT_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"]
}
`;

/**
 * A richer starter config that gives every part of the app something to show:
 * a deprecated option (migrate), string shorthand (massage), presets and
 * packageRules for the simulator.
 */
export const EXAMPLE_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":dependencyDashboard"],
  "schedule": "before 6am on monday",
  "semanticCommits": true,
  "packageRules": [
    {
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    },
    {
      "matchPackageNames": ["react", "react-dom"],
      "groupName": "react"
    }
  ]
}
`;
