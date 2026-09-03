import { describe, expect, test } from "vitest";
import { parseCommandArgs } from "./args";
import { endpointTokenPolicy, takeInputFile, tokensFromEnv } from "./run-input";
import { fixture, runCli, runJson } from "../test/harness";

/** Reaching the config — and what a config that cannot be read or parsed does
 *  to a run. */

describe("input", () => {
  test("a config file that is not there fails the run and names the path", async () => {
    const run = await runCli(["digest", fixture("nope.json")]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("cannot read config file");
    expect(run.stderr).toContain("nope.json");
    expect(run.stdout).toBe("");
  });

  test("a config that cannot be parsed is Renovate refusing it, not a failed run", async () => {
    const run = await runJson<{
      accepted: boolean;
      stageStatus: { parse: string; validate: string };
      messages: { message: string }[];
    }>(["validate", fixture("broken.json5"), "--format", "json"]);
    expect(run.code).toBe(2);
    const report = run.payload;
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
  test("RCD_* wins over the ambient conventions", () => {
    expect(
      tokensFromEnv({ RCD_GITHUB_TOKEN: "rcd", GITHUB_TOKEN: "ambient", GH_TOKEN: "gh" }),
    ).toEqual({ githubToken: "rcd" });
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

  test("every supported host has its own RCD_ variable", () => {
    expect(
      tokensFromEnv({
        RCD_GITLAB_TOKEN: "gl",
        RCD_GITEA_TOKEN: "gt",
        RCD_FORGEJO_TOKEN: "fj",
      }),
    ).toEqual({ gitlabToken: "gl", giteaToken: "gt", forgejoToken: "fj" });
  });
});

describe("endpointTokenPolicy", () => {
  test("no global config: the endpoint is ours, tokens flow", () => {
    expect(endpointTokenPolicy({}, undefined).suppress).toBe(false);
  });

  test("a global config that chooses the endpoint withholds the tokens", () => {
    const policy = endpointTokenPolicy({}, { endpoint: "https://evil.example" });
    expect(policy.suppress).toBe(true);
    expect(policy.reason).toContain("--trust-endpoints");
  });

  test("--platform-override puts us back in charge", () => {
    expect(
      endpointTokenPolicy({ platformOverride: true }, { endpoint: "https://evil.example" })
        .suppress,
    ).toBe(false);
  });

  test("--trust-endpoints is the explicit opt-in", () => {
    expect(
      endpointTokenPolicy({ trustEndpoints: true }, { endpoint: "https://mine.example" }).suppress,
    ).toBe(false);
  });

  test("a global config that sets neither platform nor endpoint is harmless", () => {
    expect(endpointTokenPolicy({}, { onboarding: false }).suppress).toBe(false);
  });

  /**
   * Roadmap 068 (M3). `--endpoint` on the CLI is a person's explicit choice —
   * `callerEndpoint` stays unset there. Over MCP the same value arrives as a
   * tool parameter the MODEL chose, plausibly copied out of the config under
   * inspection, so it gets the same treatment as an endpoint a config chose.
   */
  test("an endpoint the caller supplied over MCP withholds the tokens", () => {
    const policy = endpointTokenPolicy(
      { callerEndpoint: "https://ghe.attacker.example/api/v3/" },
      undefined,
      "mcp",
    );
    expect(policy.suppress).toBe(true);
    expect(policy.reason).toContain("ghe.attacker.example");
    expect(policy.reason).toContain("trustEndpoints: true");
  });

  test("platformOverride does not vouch for an endpoint the caller invented", () => {
    expect(
      endpointTokenPolicy(
        { callerEndpoint: "https://ghe.attacker.example/api/v3/", platformOverride: true },
        undefined,
        "mcp",
      ).suppress,
    ).toBe(true);
  });

  test("trustEndpoints is the one opt-in that does", () => {
    expect(
      endpointTokenPolicy(
        { callerEndpoint: "https://ghe.mine.example/api/v3/", trustEndpoints: true },
        undefined,
        "mcp",
      ).suppress,
    ).toBe(false);
  });
});
