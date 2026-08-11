import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ShortcutSheet } from "./ShortcutSheet";

/**
 * Roadmap 067 — the sheet closing has to hand focus back, and the hard case is
 * the one that looks like it already works: `?` pressed with the session menu
 * open captures a MENU ITEM as the opener, and `showModal()`'s own focus move
 * is what makes the menu close, so the captured element is gone before the
 * sheet restores. Nothing here knows about the session menu — it is rebuilt as
 * plain markup, because the fallback is about DOM shape, not about that menu.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

// jsdom 30 ships `<dialog>` without its modal methods, so the sheet's own
// `showModal()` throws there — a jsdom limitation, not app behavior. Stubbing
// the pair it calls is enough: what these tests assert is where FOCUS lands
// when the sheet goes away, which is this component's job in every browser.
const dialogProto: Partial<HTMLDialogElement> = HTMLDialogElement.prototype;

function openStub(this: HTMLDialogElement) {
  this.open = true;
}

function closeStub(this: HTMLDialogElement) {
  this.open = false;
}

beforeAll(() => {
  dialogProto.showModal ??= openStub;
  dialogProto.close ??= closeStub;
});

interface Menu {
  wrapper: HTMLElement;
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  item: HTMLButtonElement;
}

function openMenu(): Menu {
  const wrapper = document.createElement("span");
  const trigger = document.createElement("button");
  const panel = document.createElement("div");
  const item = document.createElement("button");
  panel.appendChild(item);
  wrapper.append(trigger, panel);
  document.body.appendChild(wrapper);
  item.focus();
  return { wrapper, trigger, panel, item };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ShortcutSheet", () => {
  it("returns focus to the opener when it is still mounted", () => {
    const { trigger } = openMenu();
    trigger.focus();

    const { unmount } = render(<ShortcutSheet onClose={() => undefined} />);
    unmount();

    expect(document.activeElement).toBe(trigger);
  });

  it("falls back to the nearest surviving ancestor when the opener is gone", () => {
    const { trigger, panel, item } = openMenu();
    expect(document.activeElement).toBe(item);

    const { unmount } = render(<ShortcutSheet onClose={() => undefined} />);
    // What the session menu's own `focusin` listener does the moment
    // `showModal()` moves focus into the dialog: the panel, and the captured
    // opener with it, stops existing.
    panel.remove();
    unmount();

    // Not <body> — the next Tab would restart at the skip link.
    expect(document.activeElement).toBe(trigger);
  });
});
