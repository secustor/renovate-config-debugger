import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("provenance", () => {
  test("lists the options some layer set, with the winning layer", async () => {
    const io = recordingIo();
    expect(await main(["provenance", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const report = io.json() as {
      tally: { keys: number; overridden: number };
      keys: { key: string; winner: string }[];
    };
    expect(report.tally.keys).toBeGreaterThan(0);
    expect(report.keys.find((k) => k.key === "labels")?.winner).toBe("repo");
  });

  test("one key gives the whole override chain", async () => {
    const io = recordingIo();
    expect(
      await main(["provenance", fixture("clean.json"), "labels", "--format", "json"], io),
    ).toBe(0);
    const entry = io.json() as { key: string; chain: { layer: string; action: string }[] };
    expect(entry.key).toBe("labels");
    expect(entry.chain.at(-1)?.layer).toBe("repo");
  });

  test("a key nothing set is an error, not an empty answer", async () => {
    const io = recordingIo();
    expect(await main(["provenance", fixture("clean.json"), "notAnOption"], io)).toBe(1);
  });
});
