import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MultiValueInput } from "./MultiValueInput";

/**
 * Roadmap 079 follow-up: paste auto-split. Pasting several values at once
 * (registry URLs, categories, …) should commit one chip per value instead of
 * dumping the whole blob into the draft as one unsplittable token.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <MultiValueInput name="registryUrls" label="registryUrls" value={value} onChange={setValue} />
  );
}

function paste(input: HTMLElement, text: string) {
  return fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe("MultiValueInput — paste auto-split", () => {
  it("splits a comma-separated paste into one chip per value", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls");

    paste(input, "https://a.example, https://b.example, https://c.example");

    const chips = [...view.container.querySelectorAll(".sim-chip")].map((c) =>
      c.firstChild?.textContent?.trim(),
    );
    expect(chips).toEqual(["https://a.example", "https://b.example", "https://c.example"]);
    // The paste was claimed, not inserted as text.
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("splits on newlines, semicolons and whitespace runs alike", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls");

    paste(input, "a\nb; c   d");

    const chips = [...view.container.querySelectorAll(".sim-chip")].map((c) =>
      c.firstChild?.textContent?.trim(),
    );
    expect(chips).toEqual(["a", "b", "c", "d"]);
  });

  it("lets a single-token paste fall through to default insertion", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls");

    const dispatched = paste(input, "https://a.example");

    // Not claimed: fireEvent reports true when the default wasn't prevented.
    expect(dispatched).toBe(true);
    expect(view.container.querySelectorAll(".sim-chip")).toHaveLength(0);
  });

  it("drops empties from a trailing separator without leaving a stray chip", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls");

    paste(input, "a, b,");

    const chips = [...view.container.querySelectorAll(".sim-chip")].map((c) =>
      c.firstChild?.textContent?.trim(),
    );
    expect(chips).toEqual(["a", "b"]);
  });

  it("dedupes within the pasted batch and against already-committed chips", () => {
    const view = render(<Harness initial="a" />);
    const input = view.getByLabelText("registryUrls");

    paste(input, "a, b, b, c");

    const chips = [...view.container.querySelectorAll(".sim-chip")].map((c) =>
      c.firstChild?.textContent?.trim(),
    );
    expect(chips).toEqual(["a", "b", "c"]);
  });

  it("leaves a partially typed draft untouched by a multi-value paste", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "still-typing" } });
    paste(input, "a, b");

    expect(input.value).toBe("still-typing");
    const chips = [...view.container.querySelectorAll(".sim-chip")].map((c) =>
      c.firstChild?.textContent?.trim(),
    );
    expect(chips).toEqual(["a", "b"]);
  });
});
