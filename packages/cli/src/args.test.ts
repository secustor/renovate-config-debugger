import { describe, expect, test } from "vitest";
import { intOption, outputFormat, parseCommandArgs } from "./args";
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

describe("intOption", () => {
  test("an empty value is an error, not a coerced 0", () => {
    expect(() => intOption(parseCommandArgs(["--rule", ""], ["rule"]), "rule", { min: 0 })).toThrow(
      /--rule must be a non-negative integer \(got ""\)/,
    );
  });

  test("a whitespace-padded value still reads as its integer", () => {
    expect(intOption(parseCommandArgs(["--rule", " 3 "], ["rule"]), "rule", { min: 0 })).toBe(3);
  });

  test("a non-decimal spelling is an error, and the message names the alternative", () => {
    expect(() =>
      intOption(parseCommandArgs(["--depth", "1e3"], ["depth"]), "depth", {
        min: 0,
        or: '"all"',
      }),
    ).toThrow(/--depth must be a non-negative integer or "all"/);
  });
});
