/**
 * Upstream-drift tripwire for the forked `migrateConfig`.
 *
 * `src/shims/migration.ts` copies the control flow of
 * `renovate/dist/config/migration.js` line-for-line. When Renovate is bumped
 * that upstream file can change, silently invalidating the fork. This test
 * pins a hash of the upstream source; when it changes, re-diff the fork against
 * the new upstream and update the expected hash below.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const renovateRoot = dirname(require.resolve("renovate/package.json"));

function hashOf(distRelPath: string): string {
  const source = readFileSync(join(renovateRoot, "dist", distRelPath), "utf8");
  return createHash("sha256").update(source).digest("hex");
}

describe("migrateConfig fork stays in sync with upstream", () => {
  it("upstream config/migration.js is unchanged since the fork was written", () => {
    // renovate 43.275.0. If this fails after a renovate bump: open
    // node_modules/renovate/dist/config/migration.js, re-diff it against
    // src/shims/migration.ts, port any changes, then update this hash.
    expect(hashOf("config/migration.js")).toBe(
      "8597eaf3e9cd9e5221ee72e69c89b939235f7ac7bc180f26472a0f2dcd30e9bc",
    );
  });

  it("upstream MigrationsService.run is unchanged since the fork was written", () => {
    // The fork re-implements MigrationsService.run's per-key dispatch. If this
    // fails, re-check runMigrations() in src/shims/migration.ts.
    expect(hashOf("config/migrations/migrations-service.js")).toBe(
      "e1862cb3a432d6e49959beedabb1537390c046bb9cd9bf549e3c6c0adefc10d4",
    );
  });
});
