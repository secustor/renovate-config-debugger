import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("validate", () => {
  test("a config Renovate accepts exits 0", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    expect(io.json()).toMatchObject({ accepted: true, messages: [] });
  });

  test("a config Renovate would refuse exits 2 and explains why", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("invalid.json"), "--format", "json"], io)).toBe(2);
    const report = io.json() as {
      accepted: boolean;
      messages: { severity: string; message: string; docsUrl?: string }[];
    };
    expect(report.accepted).toBe(false);
    expect(report.messages[0]?.severity).toBe("error");
    expect(report.messages[0]?.message).toContain("labels");
  });

  test("pretty output leads with the verdict", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("invalid.json")], io)).toBe(2);
    expect(io.stdout).toContain("REFUSE");
  });
});
