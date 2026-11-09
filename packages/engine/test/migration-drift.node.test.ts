/**
 * Upstream-drift tripwire for the forked `migrateConfig` and the two transitive
 * deps it vendors.
 *
 * `src/shims/migration.ts` copies the control flow of
 * `renovate/dist/config/migration.js` line-for-line. When Renovate is bumped
 * that upstream file can change, silently invalidating the fork. This test
 * pins a hash of the upstream source; when it changes, re-diff the fork against
 * the new upstream and update the expected hash below. It also pins the
 * versions of the two deps `src/shims/renovate-deps.ts` vendors verbatim.
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
    // renovate 44.221.4. If this fails after a renovate bump: open
    // node_modules/renovate/dist/config/migration.js, re-diff it against
    // src/shims/migration.ts, port any changes, then update this hash.
    expect(hashOf("config/migration.js")).toBe(
      "409a0caed3d0533b2689b525d94c6f8dac7c56c7754e5ba02a63cd9a88b72830",
    );
  });

  it("upstream MigrationsService.run is unchanged since the fork was written", () => {
    // The fork re-implements MigrationsService.run's per-key dispatch. If this
    // fails, re-check runMigrations() in src/shims/migration.ts.
    expect(hashOf("config/migrations/migrations-service.js")).toBe(
      "8dc7c132653d38c729ec4db0efe3111e272b48e6c381622c8295c3559b18857d",
    );
  });
});

describe("vendored transitive deps are unchanged", () => {
  it("renovate still pins the exact versions src/shims/renovate-deps.ts copied", () => {
    // A failure (bumped version, or an exact pin turned into a range) means
    // re-diffing src/shims/renovate-deps.ts against the new upstream copy.
    const manifest = JSON.parse(readFileSync(join(renovateRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies.dequal).toBe("2.0.3");
    expect(manifest.dependencies["@sindresorhus/is"]).toBe("8.1.0");
  });
});
