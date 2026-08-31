import { useState } from "react";
import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MultiValueInput } from "./MultiValueInput";

/**
 * Roadmap 079 follow-up: paste auto-split. Pasting several values at once
 * (registry URLs, categories, …) should commit one chip per value instead of
 * dumping the whole blob into the draft as one unsplittable token.
 *
 * WHICH values a blob splits into is `splitPastedValues`' own question, asked
 * in `form.test.ts`; what is under test here is the editor around it — whether
 * the event is claimed, what reaches the committed list, and what the draft is
 * left holding.
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

/** The committed chips, in order. Read off each chip's remove button, whose
 *  accessible name IS the value it would remove — the chip's own claim, rather
 *  than whichever DOM node its label happens to be. */
function chips(view: RenderResult): string[] {
  return view
    .queryAllByRole("button", { name: /^Remove / })
    .map((button) => button.getAttribute("aria-label")?.replace(/^Remove /, "") ?? "");
}

describe("MultiValueInput — paste auto-split", () => {
  it("commits one chip per pasted value instead of inserting the blob", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls");

    paste(input, "https://a.example, https://b.example, https://c.example");

    expect(chips(view)).toEqual(["https://a.example", "https://b.example", "https://c.example"]);
    // The paste was claimed, not inserted as text.
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("lets a single-token paste fall through to default insertion", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls");

    const dispatched = paste(input, "https://a.example");

    // Not claimed: fireEvent reports true when the default wasn't prevented.
    expect(dispatched).toBe(true);
    expect(chips(view)).toEqual([]);
  });

  it("drops empties from a trailing separator without leaving a stray chip", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls");

    paste(input, "a, b,");

    expect(chips(view)).toEqual(["a", "b"]);
  });

  it("dedupes within the pasted batch and against already-committed chips", () => {
    const view = render(<Harness initial="a" />);
    const input = view.getByLabelText("registryUrls");

    paste(input, "a, b, b, c");

    expect(chips(view)).toEqual(["a", "b", "c"]);
  });

  it("leaves a partially typed draft untouched by a multi-value paste", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("registryUrls") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "still-typing" } });
    paste(input, "a, b");

    expect(input.value).toBe("still-typing");
    expect(chips(view)).toEqual(["a", "b"]);
  });
});
