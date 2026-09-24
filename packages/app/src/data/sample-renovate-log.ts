/**
 * Roadmap 095 — the "use a sample log" text: a tiny debug-level JSON log. No
 * `repository`, so it names no repo to load a config from.
 */
import { jsonLiteral } from "@renovate-config-debugger/engine/json";

export const SAMPLE_LOG_NAME = "renovate-sample.log";

const RECORDS: Record<string, unknown>[] = [
  { level: 30, renovateVersion: "44.97.5", msg: "Renovate started" },
  {
    level: 30,
    baseBranch: "main",
    stats: { managers: { dockerfile: {}, "github-actions": {}, npm: {} } },
    msg: "Dependency extraction complete",
  },
  {
    level: 20,
    baseBranch: "main",
    config: {
      npm: [
        {
          packageFile: "package.json",
          deps: [
            {
              depName: "react",
              currentValue: "^18.2.0",
              datasource: "npm",
              depType: "dependencies",
              updates: [{ updateType: "major", newValue: "^19.1.0" }],
            },
            {
              depName: "lodash",
              currentValue: "4.17.20",
              datasource: "npm",
              depType: "dependencies",
              updates: [{ updateType: "patch", newValue: "4.17.21" }],
            },
            {
              depName: "typescript",
              currentValue: "~5.9.2",
              datasource: "npm",
              depType: "devDependencies",
              updates: [],
            },
          ],
        },
      ],
      "github-actions": [
        {
          packageFile: ".github/workflows/ci.yml",
          deps: [
            {
              depName: "actions/checkout",
              currentValue: "v4",
              datasource: "github-tags",
              depType: "action",
              updates: [{ updateType: "major", newValue: "v5" }],
            },
          ],
        },
      ],
      dockerfile: [
        {
          packageFile: "Dockerfile",
          deps: [
            {
              depName: "node",
              currentValue: "22.11.0-alpine",
              datasource: "docker",
              depType: "final",
              updates: [],
            },
          ],
        },
      ],
    },
    msg: "packageFiles with updates",
  },
];

export const SAMPLE_LOG = RECORDS.map(jsonLiteral).join("\n");
