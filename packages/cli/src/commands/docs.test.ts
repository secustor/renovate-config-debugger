import { describe, expect, test } from "vitest";
import { main } from "../main";
import { recordingIo } from "../test-harness";

describe("docs", () => {
  test("an option's metadata for the pinned Renovate", async () => {
    const io = recordingIo();
    expect(await main(["docs", "packageRules", "--format", "json"], io)).toBe(0);
    const doc = io.json() as { name: string; url: string; renovateVersion: string };
    expect(doc.name).toBe("packageRules");
    expect(doc.url).toContain("docs.renovatebot.com");
    expect(doc.renovateVersion).toMatch(/^\d+\./);
  });

  test("--search lists candidates", async () => {
    const io = recordingIo();
    expect(await main(["docs", "matchPackage", "--search", "--format", "json"], io)).toBe(0);
    const found = io.json() as { matches: { name: string }[] };
    expect(found.matches.map((m) => m.name)).toContain("matchPackageNames");
  });

  test("an option that does not exist points at --search", async () => {
    const io = recordingIo();
    expect(await main(["docs", "nopeNotAnOption"], io)).toBe(1);
    expect(io.stderr).toContain("--search");
  });
});
