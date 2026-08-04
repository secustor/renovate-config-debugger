/**
 * Roadmap 009 (auth-failure surfacing) — the two decisions the feature rests
 * on, both pure and both tested here rather than through the UI that renders
 * them: WHICH failures a run-level banner should name
 * ({@link collectGithubAuthFailures}) and WHAT a failing row's badge says
 * ({@link stateBadge}).
 *
 * The fixtures spell the engine's real messages ("… — rate limit or missing
 * token" from the github preset shim, renovate's own "dep not found") because
 * the match IS a pair of regexes over those strings: a fixture paraphrasing
 * them would keep passing after the engine's wording moved on.
 */
import type { PresetNode } from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { collectGithubAuthFailures, githubPresetDisplayName, stateBadge } from "./tree-shared";

const RATE_LIMIT_MESSAGE =
  "GitHub API rejected the request (HTTP 403) — rate limit or missing token";
const NOT_FOUND_MESSAGE = "dep not found";
// What a not-found ACTUALLY looks like on a real run's node: renovate rewrites
// the fetcher's message into its validation copy before throwing, and the
// engine mirrors that rewrite onto the node — see githubAuthFailure's docs.
const NOT_FOUND_REWRITTEN_MESSAGE = "Cannot find preset's package (github>org/private-presets)";

let nextId = 0;

/** A tree node with only the fields these two functions read. */
function node(partial: Partial<PresetNode> & { name: string }): PresetNode {
  return {
    id: `n${++nextId}`,
    state: "resolved",
    children: [],
    ...partial,
  } as PresetNode;
}

/** A failed `github>owner/repo` preset in one of the two auth flavors. */
function githubFailure(repo: string, message: string, name = `github>${repo}`): PresetNode {
  return node({
    name,
    state: "error",
    source: { presetSource: "github", repo },
    error: { topic: "Preset", message },
  });
}

describe("collectGithubAuthFailures", () => {
  test("an absent tree has no failures", () => {
    expect(collectGithubAuthFailures(undefined)).toEqual({ failures: [], rateLimited: false });
  });

  test("a clean run has no failures", () => {
    const root = node({
      name: "repo config",
      children: [node({ name: "config:recommended" }), node({ name: "github>org/presets" })],
    });
    expect(collectGithubAuthFailures(root).failures).toEqual([]);
  });

  test("finds a not-found github failure nested anywhere in the tree", () => {
    const root = node({
      name: "repo config",
      children: [
        node({
          name: "github>org/shared-config",
          source: { presetSource: "github", repo: "org/shared-config" },
          children: [githubFailure("org/private-presets", NOT_FOUND_MESSAGE)],
        }),
      ],
    });
    const { failures, rateLimited } = collectGithubAuthFailures(root);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.name).toBe("github>org/private-presets");
    expect(failures[0]?.rateLimited).toBe(false);
    expect(rateLimited).toBe(false);
  });

  test("prunes internal subtrees — internal presets never reference external ones", () => {
    const root = node({
      name: "repo config",
      children: [
        node({
          name: "config:recommended",
          source: { presetSource: "internal" },
          // Cannot happen on a real run (internal presets only reference other
          // internal presets); the fixture pins that the walk RELIES on that
          // invariant instead of re-checking every internal node.
          children: [githubFailure("org/private-presets", NOT_FOUND_MESSAGE)],
        }),
      ],
    });
    expect(collectGithubAuthFailures(root).failures).toEqual([]);
  });

  test("matches renovate's rewritten not-found message (the shape real runs carry)", () => {
    const root = node({
      name: "repo config",
      children: [githubFailure("org/private-presets", NOT_FOUND_REWRITTEN_MESSAGE)],
    });
    const { failures, rateLimited } = collectGithubAuthFailures(root);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.rateLimited).toBe(false);
    expect(rateLimited).toBe(false);
  });

  test("ignores errors that are not sign-in-fixable github fetches", () => {
    const root = node({
      name: "repo config",
      children: [
        // A github preset that failed for an unrelated reason.
        githubFailure("org/presets", "Invalid JSON in preset"),
        // The right message, but not a github source.
        node({
          name: "gitlab>org/presets",
          state: "error",
          source: { presetSource: "gitlab", repo: "org/presets" },
          error: { topic: "Preset", message: RATE_LIMIT_MESSAGE },
        }),
        // The right message and source, but the node did not fail.
        node({ name: "github>org/ok", source: { presetSource: "github", repo: "org/ok" } }),
      ],
    });
    expect(collectGithubAuthFailures(root).failures).toEqual([]);
  });

  test("dedupes by repository — one unreachable repo is one thing to fix", () => {
    const root = node({
      name: "repo config",
      children: [
        githubFailure("org/private", NOT_FOUND_MESSAGE, "github>org/private:base"),
        githubFailure("org/private", NOT_FOUND_MESSAGE, "github>org/private:extra"),
        githubFailure("org/other", NOT_FOUND_MESSAGE),
      ],
    });
    const { failures } = collectGithubAuthFailures(root);
    expect(failures.map((f) => f.name)).toEqual(["github>org/private:base", "github>org/other"]);
  });

  test("reports failures in tree order, so the banner names the first one", () => {
    const root = node({
      name: "repo config",
      children: [
        node({ name: "config:recommended", children: [githubFailure("org/a", NOT_FOUND_MESSAGE)] }),
        githubFailure("org/b", NOT_FOUND_MESSAGE),
      ],
    });
    expect(collectGithubAuthFailures(root).failures.map((f) => f.name)).toEqual([
      "github>org/a",
      "github>org/b",
    ]);
  });

  test("the aggregate is rate-limited when ANY failure was", () => {
    const root = node({
      name: "repo config",
      children: [
        githubFailure("org/a", NOT_FOUND_MESSAGE),
        githubFailure("org/b", RATE_LIMIT_MESSAGE),
      ],
    });
    const { failures, rateLimited } = collectGithubAuthFailures(root);
    expect(rateLimited).toBe(true);
    expect(failures.map((f) => f.rateLimited)).toEqual([false, true]);
  });

  test("a duplicated rate limit still flips the aggregate, dedupe notwithstanding", () => {
    const root = node({
      name: "repo config",
      children: [
        githubFailure("org/a", NOT_FOUND_MESSAGE),
        githubFailure("org/a", RATE_LIMIT_MESSAGE),
      ],
    });
    expect(collectGithubAuthFailures(root)).toMatchObject({ rateLimited: true });
    expect(collectGithubAuthFailures(root).failures).toHaveLength(1);
  });
});

describe("githubPresetDisplayName", () => {
  test("keeps the preset as it was written when it names the repo", () => {
    const failure = githubFailure("org/presets", NOT_FOUND_MESSAGE, "github>org/presets:base");
    expect(githubPresetDisplayName(failure)).toBe("github>org/presets:base");
  });

  test("synthesizes the writable form when the raw name drifted from the repo", () => {
    const failure = githubFailure("org/presets", NOT_FOUND_MESSAGE, "local>renovate-config");
    expect(githubPresetDisplayName(failure)).toBe("github>org/presets");
  });

  test("falls back to the raw name when there is no structured repo", () => {
    const bare = node({ name: "some-preset", state: "error" });
    expect(githubPresetDisplayName(bare)).toBe("some-preset");
  });
});

describe("stateBadge", () => {
  test("a resolved node wears no badge", () => {
    expect(stateBadge(node({ name: "config:recommended" }))).toBeNull();
  });

  test("an ordinary error is still just `failed`", () => {
    const badge = stateBadge(githubFailure("org/presets", "Invalid JSON in preset"));
    expect(badge).toEqual({ label: "failed", className: "state-error" });
  });

  test("a private/not-found github preset says `no access`", () => {
    const badge = stateBadge(githubFailure("org/private", NOT_FOUND_MESSAGE));
    expect(badge).toEqual({ label: "no access", className: "state-error auth-no-access" });
  });

  test("a throttled github preset says `rate limited`", () => {
    const badge = stateBadge(githubFailure("org/presets", RATE_LIMIT_MESSAGE));
    expect(badge).toEqual({ label: "rate limited", className: "state-error auth-rate-limited" });
  });

  test("non-error states keep their own wording", () => {
    expect(stateBadge(node({ name: "x", state: "ignored" }))?.label).toBe(
      "ignored via ignorePresets",
    );
    expect(stateBadge(node({ name: "x", state: "aborted" }))?.className).toBe("state-aborted");
  });
});
