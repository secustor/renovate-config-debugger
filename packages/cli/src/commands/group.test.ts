import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

/**
 * Roadmap 074: the batch-level question both replay-03 entry sessions could
 * only hedge on — "would this group actually reach its minimumGroupSize?" —
 * answered from the same evaluation `simulate` runs, over several updates.
 */

const REACT = '{"depName":"react","packageName":"react","updateType":"minor"}';
const REACT_DOM = '{"depName":"react-dom","packageName":"react-dom","updateType":"minor"}';
const LODASH = '{"depName":"lodash","packageName":"lodash","updateType":"patch"}';

describe("group", () => {
  test("tallies groups and answers the minimumGroupSize gate", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "group",
          fixture("group-minimum.json"),
          "--dep",
          REACT,
          "--dep",
          REACT_DOM,
          "--dep",
          LODASH,
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const tally = io.json() as {
      updates: number;
      groups: {
        groupName: string;
        size: number;
        minimumGroupSize: number;
        wouldForm: boolean;
        verdict: string;
        members: { depName: string }[];
      }[];
      ungrouped: { depName: string }[];
      notes: string[];
    };
    expect(tally.updates).toBe(3);
    const react = tally.groups.find((group) => group.groupName === "react monorepo");
    expect(react).toMatchObject({ size: 2, minimumGroupSize: 3, wouldForm: false });
    expect(react?.verdict).toContain("would WAIT: 2 updates of the 3");
    expect(react?.members.map((member) => member.depName)).toEqual(["react", "react-dom"]);
    expect(tally.ungrouped.map((member) => member.depName)).toEqual(["lodash"]);
    // The honesty caveat is part of the answer, not optional prose.
    expect(tally.notes.join(" ")).toContain("updates YOU supplied");
  });

  test("pretty output states the verdict per group", async () => {
    const io = recordingIo();
    expect(
      await main(["group", fixture("group-minimum.json"), "--dep", REACT, "--dep", REACT_DOM], io),
    ).toBe(0);
    expect(io.stdout).toContain('"react monorepo" would WAIT');
    expect(io.stdout).toContain("react (minor)");
    expect(io.stdout).toContain("updates YOU supplied");
  });

  test("a group with no gate forms from the updates it has", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "group",
          fixture("group-minimum.json"),
          "--dep",
          '{"depName":"chalk","packageName":"chalk","updateType":"patch"}',
          "--dep",
          LODASH,
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const tally = io.json() as { groups: { groupName: string; wouldForm: boolean }[] };
    expect(tally.groups).toEqual([
      expect.objectContaining({ groupName: "cosmetics", wouldForm: true }),
    ]);
  });

  test("one update is simulate's question, and the error says so", async () => {
    const io = recordingIo();
    expect(await main(["group", fixture("group-minimum.json"), "--dep", REACT], io)).toBe(1);
    expect(io.stderr).toContain("at least two updates");
    expect(io.stderr).toContain("rcd simulate");
  });

  test("an update that leaves rule inputs unset is flagged per member", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "group",
          fixture("mixed-rules.json"),
          "--dep",
          '{"depName":"react"}',
          "--dep",
          '{"depName":"lodash"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const tally = io.json() as { notes: string[] };
    // mixed-rules has a matchSourceUrls rule neither bare descriptor can feed.
    expect(tally.notes.join(" ")).toContain("could not match because this update leaves a field");
  });
});

describe("group --deps-file", () => {
  test("reads the batch from a JSON array file", async () => {
    const io = recordingIo();
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "rcd-group-"));
    const path = join(dir, "updates.json");
    await writeFile(path, `[${REACT},${REACT_DOM}]`, "utf8");
    expect(
      await main(
        ["group", fixture("group-minimum.json"), "--deps-file", path, "--format", "json"],
        io,
      ),
    ).toBe(0);
    const tally = io.json() as { updates: number; groups: { size: number }[] };
    expect(tally.updates).toBe(2);
    expect(tally.groups[0]?.size).toBe(2);
  });

  test("a file that is not an array is an error naming the file", async () => {
    const io = recordingIo();
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "rcd-group-"));
    const path = join(dir, "not-an-array.json");
    await writeFile(path, "{}", "utf8");
    expect(await main(["group", fixture("group-minimum.json"), "--deps-file", path], io)).toBe(1);
    expect(io.stderr).toContain("JSON array");
  });
});

describe("simulate keeps its one-dep contract", () => {
  test("a second --dep on simulate is an error pointing at group", async () => {
    const io = recordingIo();
    expect(
      await main(["simulate", fixture("grouped.json"), "--dep", REACT, "--dep", REACT_DOM], io),
    ).toBe(1);
    expect(io.stderr).toContain("rcd group");
  });
});
