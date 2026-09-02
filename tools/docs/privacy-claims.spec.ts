import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The public deployment ships roadmap 065's cookie mode, so the refresh token
 * outlives the tab. A user-facing doc that promises "closing the tab clears
 * every token" is then a privacy claim the deployment contradicts, which is
 * what this pins: the two shipped docs against whichever mode the Worker
 * config declares.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

/** `//` comments only — enough for wrangler.jsonc, which has no block ones. */
const wrangler = read("packages/oauth-worker/wrangler.jsonc").replaceAll(/^\s*\/\/[^\n]*/gm, "");

/** `cookieMode()` in the Worker: the flag on, and a host that is not `*.workers.dev`. */
const cookieModeShipped =
  /"REFRESH_COOKIE"\s*:\s*"true"/.test(wrangler) &&
  [...wrangler.matchAll(/"pattern"\s*:\s*"([^/"]+)/g)].some(
    ([, host]) => host !== undefined && !host.endsWith(".workers.dev"),
  );

describe("the privacy docs match the deployed worker", () => {
  it.each(["README.md", "docs/GitHub-App-Access.md"])(
    "%s describes the refresh token the way the worker stores it, and points at the table",
    (path) => {
      const text = read(path);
      // Both directions: turning `REFRESH_COOKIE` back off has to take the
      // cookie wording out of the docs, not leave this pinning a dead claim.
      expect(text.includes("`HttpOnly` cookie")).toBe(cookieModeShipped);
      expect(text).toContain("Auth-Flow.md");
    },
  );
});
