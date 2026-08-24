import { describe, expect, test } from "vitest";
import {
  groupByTopic,
  OTHER_TOPIC_ID,
  topicForDescription,
  topicTitle,
  TOPIC_ORDER,
} from "./description-topics";

/**
 * Roadmap 083. Every sentence quoted here is a REAL Renovate `description`,
 * not invented prose — the classifier is a keyword match over author text, so
 * a fixture of made-up sentences would only prove that the regexes match
 * themselves.
 *
 * Two sources: the artboard's own mock rows (which are `:prHourlyLimit2`,
 * `:prConcurrent10`, `config:recommended` and `workarounds:all` sentences, and
 * whose filing the design DRAWS, so they double as the spec), and the live
 * `config:recommended` array as `rcd provenance renovate.json description`
 * prints it for the pinned Renovate.
 */

/** The sentences the artboard draws, with the topic it draws them under. */
const ARTBOARD: readonly [string, string][] = [
  ["Rate limit PR creation to a maximum of two per hour.", "prs"],
  ["Limit to maximum 10 open PRs at any time.", "prs"],
  ["Enable Renovate Dependency Dashboard creation.", "prs"],
  ["Group all npm minor updates into one PR.", "grouping"],
  ["Group known monorepo packages together.", "grouping"],
  ["Use curated list of recommended non-monorepo package groupings.", "grouping"],
  ["Automerge patch updates.", "automerge"],
  ["Apply crowd-sourced workarounds for known problems with packages.", "safety"],
  ["Apply crowd-sourced package replacement rules.", "safety"],
  ["Ignore node_modules, bower_components, vendor and test directories.", "safety"],
  // The artboard's own "Everything else" tail: a commit-message sentence and
  // two per-package `workarounds:all` notes. "PR titles" is not a PR-volume
  // sentence and a one-package "Ignore …" is not a housekeeping rule, so the
  // classifier has to leave all three alone.
  ["Use semantic prefixes for commit messages and PR titles.", "other"],
  ["Ignore spring cloud 1.x releases.", "other"],
  ["Ignore http4s digest-based 1.x milestones.", "other"],
];

describe("the artboard's own rows classify as the design draws them", () => {
  for (const [text, expected] of ARTBOARD) {
    test(text, () => {
      expect(topicForDescription(text)).toBe(expected);
    });
  }
});

/** `config:recommended`, resolved by the pinned Renovate. */
const RECOMMENDED: readonly [string, string][] = [
  ["Enable Renovate Dependency Dashboard creation.", "prs"],
  [
    "Use semantic commit type `fix` for dependencies and `chore` for all others if semantic commits are in use.",
    "other",
  ],
  [
    "Ignore `node_modules`, `bower_components`, `vendor` and various test/tests (except for nuget) directories.",
    "safety",
  ],
  ["Group known monorepo packages together.", "grouping"],
  ["Use curated list of recommended non-monorepo package groupings.", "grouping"],
  ["Show only the Age and Confidence Merge Confidence badges for pull requests.", "prs"],
  ["Apply crowd-sourced package replacement rules.", "safety"],
  ["Apply crowd-sourced workarounds for known problems with packages.", "safety"],
  [
    "Ensure that every dependency pinned by digest and sourced from GitHub.com and Github enterprise contains a link to the commit-to-commit diff",
    "safety",
  ],
  ["Correctly link to the source code for golang.org/x packages", "other"],
  ["Provide a link to octochangelog's improved breakdown for Renovate's changelogs", "other"],
];

describe("config:recommended's real sentences", () => {
  for (const [text, expected] of RECOMMENDED) {
    test(text.slice(0, 60), () => {
      expect(topicForDescription(text)).toBe(expected);
    });
  }
});

test("the specific topics are asked before the broad one", () => {
  // `schedule:*` and `:automerge*` prose overlaps constantly. Matching in
  // DISPLAY order would file both of these under Pull requests & noise, which
  // is the bucket a reader scans for "how noisy is this" — not for "what merges
  // itself".
  expect(topicForDescription("Weekly automerge schedule on early Monday mornings.")).toBe(
    "automerge",
  );
  expect(topicForDescription("Group all automerge PRs into one schedule window.")).toBe(
    "automerge",
  );
});

test("a sentence matching no keyword is kept, not dropped", () => {
  expect(topicForDescription("Use the `docker` versioning for the `busybox` image.")).toBe(
    OTHER_TOPIC_ID,
  );
});

test("grouping wins over the PR bucket for a sentence naming both", () => {
  // The artboard's own "Group all npm minor updates into one PR." — a grouping
  // sentence that happens to end in "PR".
  expect(topicForDescription("Group all npm minor updates into one PR.")).toBe("grouping");
});

test("matching is case-insensitive", () => {
  expect(topicForDescription("AUTOMERGE PATCH UPDATES.")).toBe("automerge");
  expect(topicForDescription("apply crowd-sourced WORKAROUNDS.")).toBe("safety");
});

test("`pin` matches the word, not any word containing it", () => {
  // `\bpin` alone would file every "spring cloud" workaround under Safety.
  expect(topicForDescription("Ignore spring cloud 1.x releases.")).toBe(OTHER_TOPIC_ID);
  expect(topicForDescription("Pin all Docker digests.")).toBe("safety");
  expect(topicForDescription("Every dependency pinned by digest gets a diff link")).toBe("safety");
});

describe("groupByTopic", () => {
  const rows = ARTBOARD.map(([text], index) => ({ text, index }));

  test("returns the design's order, with the unmatched tail last", () => {
    const groups = groupByTopic(rows);
    expect(groups.map((group) => group.id)).toEqual([
      "prs",
      "grouping",
      "automerge",
      "safety",
      OTHER_TOPIC_ID,
    ]);
    expect(groups.map((group) => group.title)).toEqual([
      "Pull requests & noise",
      "Grouping",
      "Automerge",
      "Safety & housekeeping",
      "Everything else",
    ]);
  });

  test("keeps every row exactly once, in the order it arrived", () => {
    const groups = groupByTopic(rows);
    const seen = groups.flatMap((group) => group.rows);
    expect(seen).toHaveLength(rows.length);
    expect(seen.toSorted((a, b) => a.index - b.index)).toEqual(rows);
    // …and within a group, the input order survives untouched.
    const grouping = groups.find((group) => group.id === "grouping");
    expect(grouping?.rows.map((row) => row.index)).toEqual([3, 4, 5]);
  });

  test("a topic nothing matched does not render at all", () => {
    const groups = groupByTopic([{ text: "Automerge patch updates." }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("automerge");
  });

  test("an empty list is an empty list, not five empty headings", () => {
    expect(groupByTopic([])).toEqual([]);
  });
});

test("every topic in the render order has a title", () => {
  for (const id of TOPIC_ORDER) {
    expect(topicTitle(id)).not.toBe("");
  }
  expect(topicTitle(OTHER_TOPIC_ID)).toBe("Everything else");
});
