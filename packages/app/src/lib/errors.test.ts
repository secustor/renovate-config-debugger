import { describe, expect, it } from "vitest";
import { causedErrorMessage, errorMessage } from "./errors";

/**
 * The one place a caught `unknown` becomes a string, so the shapes it may be
 * handed are exactly the shapes a rejected fetcher actually throws.
 */

describe("errorMessage", () => {
  it("reads an Error's message, and falls back to String() for anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});

describe("causedErrorMessage", () => {
  it("prefers the wrapper's nested detail over its generic message", () => {
    const wrapper = Object.assign(new Error("Request failed"), {
      err: { message: "404 Not Found" },
    });
    expect(causedErrorMessage(wrapper)).toBe("404 Not Found");
  });

  it("falls back when the nested message is not a string", () => {
    const wrapper = Object.assign(new Error("Request failed"), {
      err: { message: { detail: "404" } },
    });
    expect(causedErrorMessage(wrapper)).toBe("Request failed");
  });

  it("leaves a plain Error alone", () => {
    expect(causedErrorMessage(new Error("boom"))).toBe("boom");
    expect(causedErrorMessage(null)).toBe("null");
  });
});
