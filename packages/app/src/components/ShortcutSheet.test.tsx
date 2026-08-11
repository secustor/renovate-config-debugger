import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

// The real `showModal()` MOVES FOCUS into the dialog — onto its first
// focusable descendant (the Close button here; there is no `[autofocus]`),
// per the HTML spec's default. That move is the entire reason `restoreFocus`
// exists: without modeling it, the previously-focused element is simply never
// disturbed in jsdom, so a test asserting focus returned to it would pass
// even with the `restoreFocus` call deleted from the component.
function openStub(this: HTMLDialogElement) {
  this.open = true;
  this.querySelector<HTMLElement>("button:not([disabled]), a[href]")?.focus();
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

/** jsdom's layout engine never lays anything out, so the dialog's own
 *  `getBoundingClientRect()` reports an all-zero box — useless for a test
 *  that needs a real inside/outside distinction. */
function mockRect(
  el: HTMLElement,
  rect: { left: number; right: number; top: number; bottom: number },
) {
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }) as DOMRect;
}

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

  it("stands down rather than land on a page landmark's first control", () => {
    // The opener AND its immediate wrapper are both gone by the time the
    // sheet closes, so the ancestor walk reaches a `<main>` — whose first
    // focusable descendant, in the real app, is the "Skip to the config
    // editor" link. Landing there is the exact top-of-the-page failure this
    // fallback exists to prevent, so it must stop before the landmark rather
    // than search inside it.
    const main = document.createElement("main");
    const skipLink = document.createElement("a");
    skipLink.href = "#config-column";
    main.appendChild(skipLink);
    const wrapper = document.createElement("div");
    const opener = document.createElement("button");
    wrapper.appendChild(opener);
    main.appendChild(wrapper);
    document.body.appendChild(main);
    opener.focus();

    const { unmount } = render(<ShortcutSheet onClose={() => undefined} />);
    wrapper.remove();
    unmount();

    expect(document.activeElement).not.toBe(skipLink);
  });

  it("does not close on a drag-select that starts inside and releases past the edge", () => {
    // A user drag-selecting a shortcut row's text (to copy `Ctrl+Shift+Enter`)
    // releases wherever the selection ends, often past the sheet's edge. The
    // browser dispatches `click` on the dialog — the nearest common ancestor
    // of press and release — with the RELEASE coordinates, so a check that
    // reads the click's own coordinates misreads a text selection as a
    // backdrop dismissal.
    const onClose = vi.fn();
    const { container } = render(<ShortcutSheet onClose={onClose} />);
    const dialog = container.querySelector("dialog");
    if (!dialog) {
      throw new Error("dialog did not render");
    }
    mockRect(dialog, { left: 100, right: 400, top: 100, bottom: 400 });

    fireEvent.mouseDown(dialog, { clientX: 200, clientY: 200 });
    fireEvent.click(dialog, { clientX: 900, clientY: 900, detail: 1 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a press-and-release that both land outside the sheet", () => {
    const onClose = vi.fn();
    const { container } = render(<ShortcutSheet onClose={onClose} />);
    const dialog = container.querySelector("dialog");
    if (!dialog) {
      throw new Error("dialog did not render");
    }
    mockRect(dialog, { left: 100, right: 400, top: 100, bottom: 400 });

    fireEvent.mouseDown(dialog, { clientX: 900, clientY: 900 });
    fireEvent.click(dialog, { clientX: 900, clientY: 900, detail: 1 });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
