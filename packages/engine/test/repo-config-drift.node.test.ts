/**
 * `CONFIG_FILE_NAMES` is a hand-copy of Renovate's brace-expanded
 * `configFileNames` (see `src/shims/repo-config.ts` for why it is not a live
 * call). This is its drift guard, in the golden project — the only regime with
 * the untouched renovate modules, so the only one where the comparison means
 * anything.
 *
 * `getConfigFileNames()` is called with NO platform on purpose: the constant
 * mirrors the unfiltered base list. Upstream's per-platform filtering and its
 * `.{platform}/renovate.json{,c,5}` append for non-github/gitlab hosts are
 * outside this guard.
 */
import { describe, expect, it } from "vitest";
import { CONFIG_FILE_NAMES } from "../src/index";

describe("CONFIG_FILE_NAMES", () => {
  it("matches Renovate's own expanded config file names (hand-copy drift guard)", async () => {
    const { getConfigFileNames } = await import("renovate/dist/config/app-strings.js");
    expect(CONFIG_FILE_NAMES).toEqual(getConfigFileNames());
  });
});
