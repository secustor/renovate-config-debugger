import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../../test/harness";

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
    const run = await runJson<{
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
    }>([
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
    ]);
    expect(run.code).toBe(0);
    const tally = run.payload;
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
    const run = await runCli([
      "group",
      fixture("group-minimum.json"),
      "--dep",
      REACT,
      "--dep",
      REACT_DOM,
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('"react monorepo" would WAIT');
    expect(run.stdout).toContain("react (minor)");
    expect(run.stdout).toContain("updates YOU supplied");
  });

  test("a group with no gate forms from the updates it has", async () => {
    const run = await runJson<{ groups: { groupName: string; wouldForm: boolean }[] }>([
      "group",
      fixture("group-minimum.json"),
      "--dep",
      '{"depName":"chalk","packageName":"chalk","updateType":"patch"}',
      "--dep",
      LODASH,
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const tally = run.payload;
    expect(tally.groups).toEqual([
      expect.objectContaining({ groupName: "cosmetics", wouldForm: true }),
    ]);
  });

  test("one update is simulate's question, and the error says so", async () => {
    const run = await runCli(["group", fixture("group-minimum.json"), "--dep", REACT]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("at least two updates");
    expect(run.stderr).toContain("rcd simulate");
  });

  test("an update that leaves rule inputs unset is flagged per member", async () => {
    const run = await runJson<{ notes: string[] }>([
      "group",
      fixture("mixed-rules.json"),
      "--dep",
      '{"depName":"react"}',
      "--dep",
      '{"depName":"lodash"}',
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const tally = run.payload;
    // mixed-rules has a matchSourceUrls rule neither bare descriptor can feed —
    // and the note names the field (replay-04: "a field" sent the entry
    // persona into trial and error that naming `sourceUrl` would have skipped).
    expect(tally.notes.join(" ")).toContain("could not match because this update leaves");
    expect(tally.notes.join(" ")).toContain("sourceUrl");
    expect(tally.notes.join(" ")).toContain("`rcd simulate`");
  });

  /** Replay-04: "0 groups" over starved descriptors read as "these updates
   *  just don't group" — the headline now says the tally may be blind. */
  test("a tally with no groups over gap-ridden updates corrects its headline", async () => {
    const run = await runCli([
      "group",
      fixture("mixed-rules.json"),
      "--dep",
      '{"depName":"left-pad"}',
      "--dep",
      '{"depName":"is-odd"}',
    ]);
    expect(run.code).toBe(0);
    // Neither dep matches a grouping rule, and both starve the matchSourceUrls
    // rule — the pretty headline carries the correction, not just a footnote.
    expect(run.stdout).toContain("0 groups over 2 simulated updates");
    expect(run.stdout).toContain("this tally may be blind, not empty");

    const json = await runJson<{ notes: string[] }>([
      "group",
      fixture("mixed-rules.json"),
      "--dep",
      '{"depName":"left-pad"}',
      "--dep",
      '{"depName":"is-odd"}',
      "--format",
      "json",
    ]);
    expect(json.code).toBe(0);
    // Same claim first in the JSON notes — the transports must agree.
    const tally = json.payload;
    expect(tally.notes[0]).toContain("this tally may be blind, not empty");
  });
});

let scratch: string | null = null;

afterEach(async () => {
  if (scratch !== null) {
    await rm(scratch, { recursive: true, force: true });
    scratch = null;
  }
});

/** A batch file in a scratch directory, since the flag's whole point is
 *  reading one. */
async function depsFile(name: string, content: string): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "rcd-group-"));
  const path = join(scratch, name);
  await writeFile(path, content, "utf8");
  return path;
}

describe("group --deps-file", () => {
  test("reads the batch from a JSON array file", async () => {
    const path = await depsFile("updates.json", `[${REACT},${REACT_DOM}]`);
    const run = await runJson<{ updates: number; groups: { size: number }[] }>([
      "group",
      fixture("group-minimum.json"),
      "--deps-file",
      path,
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    expect(run.payload.updates).toBe(2);
    expect(run.payload.groups[0]?.size).toBe(2);
  });

  /** The typo'd key is echoed back in the members, so the note is the only
   *  thing telling the reader that no rule ever read it. */
  test("a key no matcher reads is named against the member that carried it", async () => {
    const path = await depsFile(
      "updates.json",
      `[${REACT},{"depName":"react-dom","updatetype":"minor"}]`,
    );
    const run = await runJson<{ notes: string[] }>([
      "group",
      fixture("group-minimum.json"),
      "--deps-file",
      path,
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    expect(run.payload.notes).toContainEqual(
      expect.stringContaining("react-dom: 1 key ignored (`updatetype`)"),
    );
  });

  test("a file that is not an array is an error naming the file", async () => {
    const path = await depsFile("not-an-array.json", "{}");
    const run = await runCli(["group", fixture("group-minimum.json"), "--deps-file", path]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("JSON array");
  });
});

describe("simulate keeps its one-dep contract", () => {
  test("a second --dep on simulate is an error pointing at group", async () => {
    const run = await runCli([
      "simulate",
      fixture("grouped.json"),
      "--dep",
      REACT,
      "--dep",
      REACT_DOM,
    ]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("rcd group");
  });
});
