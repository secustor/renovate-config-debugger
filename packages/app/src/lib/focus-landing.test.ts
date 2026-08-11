import { describe, expect, it } from "vitest";
import {
  armLanding,
  createLandingActivity,
  jumpDisplacedFocus,
  landingWanted,
} from "./focus-landing";

/** Stands in for a focus holder. Only the two members `jumpDisplacedFocus`
 *  reads are real; everything else about an Element is beside the point here. */
function elementStub({ connected = true, hidden = false } = {}): Element {
  return {
    isConnected: connected,
    closest: (selector: string) => (hidden && selector === "[hidden]" ? elementStub() : null),
  } as unknown as Element;
}

/** Roadmap 067 — may a landing that waited still move the user? */
describe("landingWanted", () => {
  it("lands when nothing has happened since the gesture", () => {
    const activity = createLandingActivity();
    const chip = elementStub();
    expect(landingWanted(armLanding(activity, chip), activity, chip)).toBe(true);
  });

  it("abandons the landing once the user has typed", () => {
    const activity = createLandingActivity();
    const editor = elementStub();
    const ticket = armLanding(activity, editor);
    // ⌘⇧⏎ from the editor, then a character while the run resolves: the caret
    // never moved, so only the `input` count can see it.
    activity.inputSeq += 1;
    expect(landingWanted(ticket, activity, editor)).toBe(false);
  });

  it("abandons it when focus has moved somewhere real since", () => {
    const activity = createLandingActivity();
    const ticket = armLanding(activity, elementStub());
    expect(landingWanted(ticket, activity, elementStub())).toBe(false);
  });

  it("still lands when the jump itself dropped focus — that is the normal case", () => {
    const activity = createLandingActivity();
    // The activator sat in a panel the tab switch marked `hidden`, so the
    // browser blurred it in the same commit.
    const ticket = armLanding(activity, elementStub());
    expect(landingWanted(ticket, activity, null)).toBe(true);
  });

  it("abandons it when the user clicked something unfocusable instead", () => {
    const activity = createLandingActivity();
    const ticket = armLanding(activity, elementStub());
    // A click on a paragraph of prose blurs to body just like a tab switch
    // does — the `pointerdown` is what makes it a choice.
    activity.pointerSeq += 1;
    expect(landingWanted(ticket, activity, null)).toBe(false);
  });

  it("lets a newer landing supersede the one it was issued after", () => {
    // Two digit keys inside one animation frame (067 review): both landings are
    // armed before either runs, and both read the same focus holder.
    const activity = createLandingActivity();
    const third = armLanding(activity, null);
    const fifth = armLanding(activity, null);
    expect(landingWanted(third, activity, null)).toBe(false);
    // …so the older one moves nothing, and the newer one — the tab the strip
    // now shows as selected — still finds focus where its gesture left it.
    expect(landingWanted(fifth, activity, null)).toBe(true);
  });
});

/** Roadmap 067 review — is the focus this jump would take focus the jump itself
 *  displaced, or something the user still holds? */
describe("jumpDisplacedFocus", () => {
  it("counts holding nothing as displaced", () => {
    expect(jumpDisplacedFocus(null)).toBe(true);
  });

  it("counts an activator the jump hid or removed as displaced", () => {
    expect(jumpDisplacedFocus(elementStub({ connected: false }))).toBe(true);
    expect(jumpDisplacedFocus(elementStub({ hidden: true }))).toBe(true);
  });

  it("leaves a live, visible holder alone — the editor keeps its caret", () => {
    expect(jumpDisplacedFocus(elementStub())).toBe(false);
  });
});
