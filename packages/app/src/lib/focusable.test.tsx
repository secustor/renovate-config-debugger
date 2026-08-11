import { afterEach, describe, expect, it } from "vitest";
import { FOCUSABLE_SELECTOR } from "./focusable";

/**
 * Roadmap 067 review finding 1 — `FOCUSABLE_SELECTOR` is a comma-separated
 * selector LIST, which is an OR: a native `<button tabindex="-1">` (every
 * inactive tab in the results strip) already matches the plain
 * `button:not([disabled])` branch on its own, so the trailing
 * `[tabindex]:not([tabindex='-1'])` branch never gets a say. `.test.tsx`
 * rather than `.test.ts` because matching a real selector needs a real DOM
 * (`querySelectorAll`), which only the jsdom "render" project provides.
 */

afterEach(() => {
  document.body.replaceChildren();
});

function matches(html: string): string[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).map((el) => el.id);
}

describe("FOCUSABLE_SELECTOR", () => {
  it("excludes a native button carrying tabindex=-1, not just a bare tabindex element", () => {
    // Exactly the results tab strip's shape: a roving-tabindex `<button>`
    // whose inactive members carry `tabIndex={-1}`.
    const ids = matches(
      `<button id="active" tabindex="0">Active tab</button>
       <button id="inactive" tabindex="-1">Inactive tab</button>`,
    );
    expect(ids).toEqual(["active"]);
  });

  it("still excludes a bare tabindex=-1 element with no native role", () => {
    const ids = matches(`<div id="widget" tabindex="-1">not reachable by Tab</div>`);
    expect(ids).toEqual([]);
  });

  it("still includes the widened native controls the module doc promises", () => {
    const ids = matches(
      `<a id="link" href="#x">link</a>
       <button id="btn">btn</button>
       <input id="field" />
       <select id="picker"><option>x</option></select>
       <textarea id="area"></textarea>
       <button id="disabled-btn" disabled>nope</button>
       <input id="disabled-field" disabled />`,
    );
    expect(ids).toEqual(["link", "btn", "field", "picker", "area"]);
  });
});
