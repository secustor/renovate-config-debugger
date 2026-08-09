import { describe, expect, test } from "vitest";
import { parseCommandArgs } from "./args";
import { main } from "./main";
import { endpointTokenPolicy, takeInputFile, tokensFromEnv } from "./run-input";
import { fixture, recordingIo } from "./test-harness";

/** Reaching the config — and what a config that cannot be read or parsed does
 *  to a run. */

describe("input", () => {
  test("a config file that is not there fails the run and names the path", async () => {
    const io = recordingIo();
    expect(await main(["digest", fixture("nope.json")], io)).toBe(1);
    expect(io.stderr).toContain("cannot read config file");
    expect(io.stderr).toContain("nope.json");
    expect(io.stdout).toBe("");
  });

  test("a config that cannot be parsed is Renovate refusing it, not a failed run", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("broken.json5"), "--format", "json"], io)).toBe(2);
    const report = io.json() as {
      accepted: boolean;
      stageStatus: { parse: string; validate: string };
      messages: { message: string }[];
    };
    expect(report.accepted).toBe(false);
    expect(report.stageStatus.parse).toBe("error");
    // Nothing downstream of a failed parse ran, so the verdict is the parse.
    expect(report.stageStatus.validate).toBe("skipped");
    expect(report.messages[0]?.message).toContain("JSON5.parse error");
  });
});

describe("takeInputFile", () => {
  test("the first positional is the config file", () => {
    const args = parseCommandArgs(["renovate.json", "labels"], ["stdin", "repo"]);
    expect(takeInputFile(args)).toEqual({ file: "renovate.json", rest: ["labels"] });
  });

  test("with --stdin every positional belongs to the subcommand", () => {
    const args = parseCommandArgs(["--stdin", "labels"], ["stdin", "repo"]);
    expect(takeInputFile(args)).toEqual({ rest: ["labels"] });
  });

  test("…and with --repo too", () => {
    const args = parseCommandArgs(["--repo", "o/r", "labels"], ["stdin", "repo"]);
    expect(takeInputFile(args)).toEqual({ rest: ["labels"] });
  });
});

describe("tokensFromEnv", () => {
  test("RCV_* wins over the ambient conventions", () => {
    expect(
      tokensFromEnv({ RCV_GITHUB_TOKEN: "rcv", GITHUB_TOKEN: "ambient", GH_TOKEN: "gh" }),
    ).toEqual({ githubToken: "rcv" });
  });

  test("falls back to GITHUB_TOKEN, then GH_TOKEN", () => {
    expect(tokensFromEnv({ GH_TOKEN: "gh" })).toEqual({ githubToken: "gh" });
    expect(tokensFromEnv({ GITHUB_TOKEN: "gh-actions", GH_TOKEN: "cli" })).toEqual({
      githubToken: "gh-actions",
    });
  });

  test("blank values are not tokens", () => {
    expect(tokensFromEnv({ GITHUB_TOKEN: "   " })).toEqual({});
  });

  test("every supported host has its own RCV_ variable", () => {
    expect(
      tokensFromEnv({
        RCV_GITLAB_TOKEN: "gl",
        RCV_GITEA_TOKEN: "gt",
        RCV_FORGEJO_TOKEN: "fj",
      }),
    ).toEqual({ gitlabToken: "gl", giteaToken: "gt", forgejoToken: "fj" });
  });
});

const guardArgs = (argv: string[]) =>
  parseCommandArgs(argv, ["trust-endpoints", "platform-override"]);

describe("endpointTokenPolicy", () => {
  const args = guardArgs;

  test("no global config: the endpoint is ours, tokens flow", () => {
    expect(endpointTokenPolicy(args([]), undefined).suppress).toBe(false);
  });

  test("a global config that chooses the endpoint withholds the tokens", () => {
    const policy = endpointTokenPolicy(args([]), { endpoint: "https://evil.example" });
    expect(policy.suppress).toBe(true);
    expect(policy.reason).toContain("--trust-endpoints");
  });

  test("--platform-override puts us back in charge", () => {
    expect(
      endpointTokenPolicy(args(["--platform-override"]), { endpoint: "https://evil.example" })
        .suppress,
    ).toBe(false);
  });

  test("--trust-endpoints is the explicit opt-in", () => {
    expect(
      endpointTokenPolicy(args(["--trust-endpoints"]), { endpoint: "https://mine.example" })
        .suppress,
    ).toBe(false);
  });

  test("a global config that sets neither platform nor endpoint is harmless", () => {
    expect(endpointTokenPolicy(args([]), { onboarding: false }).suppress).toBe(false);
  });
});
