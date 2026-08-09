import { describe, expect, test } from "vitest";
import { outputFormat, parseCommandArgs } from "./args";
import { CliError } from "./io";

describe("parseCommandArgs", () => {
  test("splits flags from positionals", () => {
    const args = parseCommandArgs(["renovate.json", "labels", "--format", "json"], ["format"]);
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
