import { describe, expect, it } from "vitest";
import { type RunInputs, type RunRequest, runRequestKey } from "./run-inputs";

/**
 * Roadmap 067 review: the identity `onRun` folds duplicate run requests by.
 *
 * The two halves matter in opposite directions and both have a history. Folding
 * too little is three serial pipeline runs for one impatient user pressing ⌘⏎
 * three times at a slow preset fetch — the finding this exists for. Folding too
 * much is the second review's defect, where a run requested after the config had
 * already been mutated was dropped and the results described text that was no
 * longer on screen. So every field a run's outcome depends on has a test saying
 * a difference there is a different request.
 */

const BASE_INPUTS: RunInputs = {
  fileName: "renovate.json",
  content: '{"extends":["config:recommended"]}',
  platform: "github",
  endpoint: "https://api.github.com",
};

function request(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    inputs: BASE_INPUTS,
    injectedPresets: {},
    suppressTokens: false,
    fatalSeq: 0,
    preserveScroll: false,
    keepTab: false,
    ...overrides,
  };
}

function withInputs(overrides: Partial<RunInputs>): Partial<RunRequest> {
  return { inputs: { ...BASE_INPUTS, ...overrides } };
}

describe("runRequestKey", () => {
  it("gives two identical requests the same key", () => {
    expect(runRequestKey(request())).toBe(runRequestKey(request()));
  });

  it("does not depend on the order the caller built its inputs in", () => {
    // Three modules assemble `RunInputs` — App, the share-link hook and the
    // repo-load hook — and nothing makes them agree on key order.
    const ordered = request({
      inputs: {
        fileName: "renovate.json",
        content: "{}",
        platform: "github",
        endpoint: "https://api.github.com",
      },
    });
    const shuffled = request({
      inputs: {
        endpoint: "https://api.github.com",
        platform: "github",
        content: "{}",
        fileName: "renovate.json",
      },
    });
    expect(runRequestKey(ordered)).toBe(runRequestKey(shuffled));
  });

  it("separates a request whose config was edited", () => {
    // Round five's defect, from the other side: press ⌘⏎, fix the typo the
    // first run is about to report, press ⌘⏎ again. The second press must run.
    const edited = request(withInputs({ content: "{ }" }));
    expect(runRequestKey(edited)).not.toBe(runRequestKey(request()));
  });

  it("separates a request carrying a different injected preset", () => {
    // Injecting marks the node injected BEFORE it runs, so a folded re-run
    // would leave the tree describing a resolution that never happened.
    const injected = request({ injectedPresets: { "github>org/renovate": { automerge: true } } });
    expect(runRequestKey(injected)).not.toBe(runRequestKey(request()));
  });

  it("separates every other field a run's outcome depends on", () => {
    const base = runRequestKey(request());
    const varied: Partial<RunRequest>[] = [
      withInputs({ fileName: "renovate.json5" }),
      withInputs({ platform: "gitlab" }),
      withInputs({ endpoint: "https://gitlab.example.com/api/v4" }),
      withInputs({ globalConfig: { onboarding: false } }),
      withInputs({ inheritedConfig: { labels: ["deps"] } }),
      withInputs({ platformOverride: true }),
      // Credentials: a suppressed run and an authenticated one resolve private
      // presets differently.
      { suppressTokens: true },
      // Which banner the run may clear (`applyFatal`), and where the run leaves
      // the reader — a run that keeps the tab and one that resets it are two
      // different screens even from identical inputs.
      { fatalSeq: 1 },
      { preserveScroll: true },
      { keepTab: true },
    ];
    for (const overrides of varied) {
      expect(runRequestKey(request(overrides))).not.toBe(base);
    }
  });

  it("treats an absent layer and an absent flag as themselves, not as noise", () => {
    // `undefined` disappears inside JSON.stringify, so the normalization to
    // null/false is what keeps a missing field from colliding with a present
    // one in the position after it.
    const noLayers = runRequestKey(request());
    expect(runRequestKey(request(withInputs({ globalConfig: {} })))).not.toBe(noLayers);
  });
});
