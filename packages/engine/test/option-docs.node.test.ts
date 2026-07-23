import { describe, expect, it } from "vitest";
import { getOptionIndex } from "../src/option-docs";

describe("option index", () => {
  it("exposes renovate's option metadata for hover docs", () => {
    const { options } = getOptionIndex();
    const rangeStrategy = options.get("rangeStrategy");
    expect(rangeStrategy?.description).toMatch(/range/i);
    expect(rangeStrategy?.type).toBe("string");
    expect(rangeStrategy?.default).toBe("auto");
    expect(rangeStrategy?.allowedValues).toContain("pin");
    expect(rangeStrategy?.url).toBe(
      "https://docs.renovatebot.com/configuration-options/#rangestrategy",
    );
    expect(options.has("notARenovateOption")).toBe(false);
  });

  it("links global-only options to the self-hosted docs page", () => {
    const { options } = getOptionIndex();
    const token = options.get("token");
    expect(token?.globalOnly).toBe(true);
    expect(token?.url).toBe("https://docs.renovatebot.com/self-hosted-configuration/#token");
  });

  it("derives container options from parents declarations", () => {
    const { containers } = getOptionIndex();
    expect(containers.has("packageRules")).toBe(true);
    expect(containers.has("hostRules")).toBe(true);
    // free-form objects must not be containers, or their keys would be
    // flagged as unknown options
    expect(containers.has("constraints")).toBe(false);
    expect(containers.has(".")).toBe(false);
  });
});
