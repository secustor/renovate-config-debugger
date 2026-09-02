import { describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../../test/harness";

describe("validate", () => {
  test("a config Renovate accepts exits 0", async () => {
    const run = await runCli(["validate", fixture("clean.json"), "--format", "json"]);
    expect(run.code).toBe(0);
    expect(run.json()).toMatchObject({ accepted: true, messages: [] });
  });

  test("a config Renovate would refuse exits 2 and explains why", async () => {
    const run = await runJson<{
      accepted: boolean;
      messages: { severity: string; message: string; docsUrl?: string }[];
    }>(["validate", fixture("invalid.json"), "--format", "json"]);
    expect(run.code).toBe(2);
    const report = run.payload;
    expect(report.accepted).toBe(false);
    expect(report.messages[0]?.severity).toBe("error");
    expect(report.messages[0]?.message).toContain("labels");
  });

  test("pretty output leads with the verdict", async () => {
    const run = await runCli(["validate", fixture("invalid.json")]);
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("REFUSE");
  });

  /** A second file used to be dropped in silence, so `validate a.json b.json`
   *  validated `a.json` alone and exited 0 — a green hook over an unread file. */
  test("a second config file is an error naming it, not a silent one-file run", async () => {
    const run = await runCli(["validate", fixture("clean.json"), fixture("invalid.json")]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("does not take");
    expect(run.stderr).toContain("invalid.json");
  });
});
