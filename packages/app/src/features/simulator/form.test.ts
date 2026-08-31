import { describe, expect, it } from "vitest";
import {
  activeQuickFill,
  EMPTY_FORM,
  joinValues,
  QUICK_FILLS,
  splitPastedValues,
  splitValues,
  toDescriptor,
} from "./form";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 079: the two derivations the redesigned form added — which quick-fill
 * chip is lit, and the comma-string ⇄ chips view over the multi-value fields.
 */

function fillFor(label: string): Partial<FormState> {
  const hit = QUICK_FILLS.find((q) => q.label === label);
  if (!hit) {
    throw new Error(`no quick fill named ${label}`);
  }
  return hit.fill;
}

describe("activeQuickFill", () => {
  it("lights nothing on an empty form", () => {
    expect(activeQuickFill(EMPTY_FORM)).toBeNull();
  });

  it("lights the chip whose values the form still holds", () => {
    const form = { ...EMPTY_FORM, ...fillFor("npm dependency") };
    expect(activeQuickFill(form)).toBe("npm dependency");
  });

  it("keeps it lit through an edit the fill never made", () => {
    // `repository` is nobody's quick-fill — filling it does not stop this form
    // from being the npm example.
    const form = { ...EMPTY_FORM, ...fillFor("npm dependency"), repository: "acme/webapp" };
    expect(activeQuickFill(form)).toBe("npm dependency");
  });

  it("drops it the moment one of the fill's own values changes", () => {
    const form = { ...EMPTY_FORM, ...fillFor("npm dependency"), packageName: "react" };
    expect(activeQuickFill(form)).toBeNull();
  });
});

describe("multi-value fields", () => {
  it("splits and rejoins the comma string the form has always held", () => {
    expect(splitValues("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(splitValues("  ")).toEqual([]);
    expect(joinValues(["a", "b"])).toBe("a, b");
  });

  it("round-trips through the descriptor unchanged", () => {
    // The chips are a view: what `toDescriptor` sends is what the comma string
    // always sent, which is what the share link encodes.
    const form: FormState = { ...EMPTY_FORM, registryUrls: joinValues(["https://a", "https://b"]) };
    expect(toDescriptor(form).registryUrls).toEqual(["https://a", "https://b"]);
  });
});

describe("splitPastedValues", () => {
  it("splits a pasted list on commas, semicolons and whitespace runs alike", () => {
    expect(splitPastedValues("https://a, https://b, https://c")).toEqual([
      "https://a",
      "https://b",
      "https://c",
    ]);
    expect(splitPastedValues("a\nb; c   d")).toEqual(["a", "b", "c", "d"]);
  });

  it("drops the empties a trailing or doubled separator leaves behind", () => {
    expect(splitPastedValues("a, b,")).toEqual(["a", "b"]);
    expect(splitPastedValues("a,, b")).toEqual(["a", "b"]);
    // A list of nothing is still a list — claimed, not inserted as text.
    expect(splitPastedValues("  ")).toEqual([]);
  });

  it("declines a paste that carries a single value", () => {
    expect(splitPastedValues("https://a.example")).toBeNull();
    expect(splitPastedValues("")).toBeNull();
  });
});
