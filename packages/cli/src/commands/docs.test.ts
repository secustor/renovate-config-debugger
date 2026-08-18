import { describe, expect, test } from "vitest";
import { main } from "../main";
import { recordingIo } from "../test-harness";

describe("docs", () => {
  test("an option's metadata for the pinned Renovate", async () => {
    const io = recordingIo();
    expect(await main(["docs", "packageRules", "--format", "json"], io)).toBe(0);
    const doc = io.json() as {
      name: string;
      url: string;
      renovateVersion: string;
      optionsSourceUrl: string;
      isContainer: boolean;
      childOptions: string[];
      placement: { kind: string };
    };
    expect(doc.name).toBe("packageRules");
    expect(doc.url).toContain("docs.renovatebot.com");
    expect(doc.renovateVersion).toMatch(/^\d+\./);
    // Version-pinned, unlike `url` — docs.renovatebot.com serves latest.
    expect(doc.optionsSourceUrl).toContain(`renovate/v/${doc.renovateVersion}`);
    expect(doc.isContainer).toBe(true);
    expect(doc.childOptions).toContain("matchPackageNames");
    expect(doc.placement.kind).toBe("unrestricted");
  });

  test("pretty output names the version and says where the option may go", async () => {
    const io = recordingIo();
    expect(await main(["docs", "minimumReleaseAge"], io)).toBe(0);
    expect(io.stdout).toContain("— Renovate ");
    expect(io.stdout).toContain("placement: no restriction");
  });

  test("--search lists candidates", async () => {
    const io = recordingIo();
    expect(await main(["docs", "matchPackage", "--search", "--format", "json"], io)).toBe(0);
    const found = io.json() as { matches: { name: string }[]; optionsSourceUrl: string };
    expect(found.matches.map((m) => m.name)).toContain("matchPackageNames");
    expect(found.optionsSourceUrl).toContain("renovate/v/");
  });

  test("--search counts against the pinned version's option table", async () => {
    const io = recordingIo();
    expect(await main(["docs", "matchPackage", "--search"], io)).toBe(0);
    expect(io.stdout).toMatch(/^\d+ of \d+ options in Renovate \d+\.\d+\.\d+ match "matchPackage"/);
  });

  test("--help states the version-history ceiling rather than leaving a gap", async () => {
    const io = recordingIo();
    expect(await main(["docs", "--help"], io)).toBe(0);
    expect(io.stdout).toContain("no per-option version history");
  });

  test("an option that does not exist points at --search", async () => {
    const io = recordingIo();
    expect(await main(["docs", "nopeNotAnOption"], io)).toBe(1);
    expect(io.stderr).toContain("--search");
  });
});
