import { describe, expect, test } from "vitest";
import { outputFormat, parseCommandArgs } from "../src/args";
import { CliError } from "../src/io";
import { endpointTokenPolicy, takeInputFile, tokensFromEnv } from "../src/run-input";

describe("parseCommandArgs", () => {
  test("splits flags from positionals", () => {
    const args = parseCommandArgs(
      ["renovate.json", "labels", "--format", "json"],
      ["format", "help"],
    );
    expect(args.positionals).toEqual(["renovate.json", "labels"]);
    expect(args.values.format).toBe("json");
  });

  test("a flag the subcommand does not accept is an error, not a silent no-op", () => {
    expect(() => parseCommandArgs(["--dep", "{}"], ["format"])).toThrow(CliError);
  });

  test("--inject is repeatable", () => {
    const args = parseCommandArgs(["--inject", "a=1.json", "--inject", "b=2.json"], ["inject"]);
    expect(args.values.inject).toEqual(["a=1.json", "b=2.json"]);
  });
});

describe("outputFormat", () => {
  test("defaults to pretty", () => {
    expect(outputFormat(parseCommandArgs([], ["format"]))).toBe("pretty");
  });

  test("rejects anything but pretty/json", () => {
    expect(() => outputFormat(parseCommandArgs(["--format", "yaml"], ["format"]))).toThrow(
      /--format must be/,
    );
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
