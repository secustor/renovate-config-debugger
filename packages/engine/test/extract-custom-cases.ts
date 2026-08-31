/**
 * The shared table for the custom-manager golden/shimmed pair (roadmap 063).
 * Same regime as extract-cases.ts: golden runs the REAL renovate modules and
 * writes the file snapshots, shimmed runs the browser module graph and must
 * reproduce them byte-for-byte.
 *
 * Every pattern here uses NAMED CAPTURE GROUPS only — RE2 and native `RegExp`
 * agree on those, and the browser falls back to native (feasibility spike §3).
 * A lookahead/backreference fixture would pass here and lie about production.
 */
import type { CustomManagerInput } from "../src/index";

export interface CustomExtractCase {
  /** test name and snapshot key */
  name: string;
  fileName: string;
  content: string;
  /** the `customManagers[]` block, exactly as a resolved config carries it */
  block: CustomManagerInput;
  /** every dep the block must produce, in order — what a custom manager did
   *  NOT match is half of what these fixtures assert */
  expectDeps: { depName: string; currentValue: string }[];
}

/**
 * The spike's Dockerfile (#45071's actual complaint): a correct
 * `# renovate: datasource=…` comment, and below it the same comment with
 * `datasoure=` typo'd. The typo'd ARG must extract NOTHING.
 */
const DOCKERFILE = `FROM alpine:3.20

# renovate: datasource=github-releases depName=jqlang/jq
ARG JQ_VERSION=1.7.1

# renovate: datasoure=github-releases depName=typo/typo
ARG TYPO_VERSION=1.0.0
`;

const RENOVATE_COMMENT_MATCH_STRING =
  "# renovate: datasource=(?<datasource>[a-zA-Z0-9-._]+?) depName=(?<depName>[^\\s]+?)\\s" +
  "(?:ENV|ARG)\\s+[A-Za-z0-9_]+?_VERSION[ =\"']?(?<currentValue>.+?)[\"']?\\s";

export const REGEX_BLOCK: CustomManagerInput = {
  customType: "regex",
  managerFilePatterns: ["**/[Dd]ockerfile*"],
  matchStrings: [RENOVATE_COMMENT_MATCH_STRING],
};

const DEPS_YAML = `deps:
  - name: nginx
    version: 1.27.0
  - name: redis
    version: 7.4.0
`;

export const JSONATA_BLOCK: CustomManagerInput = {
  customType: "jsonata",
  fileFormat: "yaml",
  managerFilePatterns: ["**/deps.yaml"],
  matchStrings: ['deps.{ "depName": name, "currentValue": version, "datasource": "docker" }'],
};

export const CUSTOM_EXTRACT_CASES: CustomExtractCase[] = [
  {
    name: "regex-dockerfile",
    fileName: "Dockerfile",
    content: DOCKERFILE,
    block: REGEX_BLOCK,
    // one dep, not two: the `datasoure=` line below it is the honest mismatch
    expectDeps: [{ depName: "jqlang/jq", currentValue: "1.7.1" }],
  },
  {
    name: "jsonata-yaml",
    fileName: "deps.yaml",
    content: DEPS_YAML,
    block: JSONATA_BLOCK,
    expectDeps: [
      { depName: "nginx", currentValue: "1.27.0" },
      { depName: "redis", currentValue: "7.4.0" },
    ],
  },
];

/** A pattern native `RegExp` refuses to compile — `regEx()` throws, and the
 *  engine must report that rather than let it escape. */
export const BROKEN_REGEX_BLOCK: CustomManagerInput = {
  customType: "regex",
  managerFilePatterns: ["**/Dockerfile"],
  matchStrings: ["depName=(?<depName>[a-z"],
};

export function customExtractSnapshotPath(name: string): string {
  return `__snapshots__/extract-custom-${name}.json`;
}
