import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ESCAPE_PRIORITY, pushEscapeLayer } from "@/lib/escape-stack";
import { FOCUS_RESULTS_SHORTCUT, HELP_SHORTCUT, type Shortcut } from "@/lib/shortcuts";
import { useShortcut } from "./use-shortcut";

/**
 * Roadmap 068 review — the bare-key overlay gate, and the one binding that is
 * exempt from it. `?` is advertised by the session menu's own "Press ? any
 * time" row, so a gate that suppressed it while that menu was open made the app
 * break a promise printed one line above the key.
 */

function Harness({ shortcut, onFire }: { shortcut: Shortcut; onFire: () => void }) {
  useShortcut(shortcut, onFire);
  return <input aria-label="a field" />;
}

describe("useShortcut under an overlay", () => {
  it("holds a jump key back while a menu covers the page", () => {
    const onFire = vi.fn();
    render(<Harness shortcut={FOCUS_RESULTS_SHORTCUT} onFire={onFire} />);
    const release = pushEscapeLayer(() => undefined, ESCAPE_PRIORITY.menu);

    fireEvent.keyDown(window, { key: "r" });
    // `r` MOVES the page under a layer the reader is looking at — Escape first,
    // then the jump.
    expect(onFire).not.toHaveBeenCalled();

    release();
    fireEvent.keyDown(window, { key: "r" });
    expect(onFire).toHaveBeenCalledOnce();
  });

  it("lets `?` through, from under a menu and from under a popover", () => {
    const onFire = vi.fn();
    render(<Harness shortcut={HELP_SHORTCUT} onFire={onFire} />);

    const releaseMenu = pushEscapeLayer(() => undefined, ESCAPE_PRIORITY.menu);
    fireEvent.keyDown(window, { key: "?" });
    releaseMenu();
    // The sheet is a modal that takes the keyboard outright, so nothing shifts
    // underneath — and "how do I use this" is the question of someone stuck
    // under an open layer.
    expect(onFire).toHaveBeenCalledOnce();

    const releasePopover = pushEscapeLayer(() => undefined, ESCAPE_PRIORITY.popover);
    fireEvent.keyDown(window, { key: "?" });
    releasePopover();
    expect(onFire).toHaveBeenCalledTimes(2);
  });

  it("holds `?` back while the user is typing, exemption or not", () => {
    // The exemption is from the overlay gate alone. `?` is a character someone
    // can be in the middle of typing, and no shortcut may eat it.
    const onFire = vi.fn();
    const { getByLabelText } = render(<Harness shortcut={HELP_SHORTCUT} onFire={onFire} />);

    fireEvent.keyDown(getByLabelText("a field"), { key: "?" });
    expect(onFire).not.toHaveBeenCalled();
  });
});

describe("useShortcut with a self-disabling binding", () => {
  it("keeps a held `?` claimed through auto-repeat even though the handler flips `enabled` off", () => {
    // Mirrors App.tsx: `showShortcuts` sets `shortcutSheetOpen`, which flips
    // this hook's own `enabled` to false on the very first press. Gating the
    // window listener's installation on `enabled` (the pre-fix shape) tore it
    // down at that point, so the auto-repeat event below reached this test
    // un-prevented and the assertion on `repeatResult` failed.
    const onFire = vi.fn();
    function SelfDisabling() {
      const [enabled, setEnabled] = useState(true);
      useShortcut(
        HELP_SHORTCUT,
        () => {
          onFire();
          setEnabled(false);
        },
        { enabled },
      );
      return <input aria-label="a field" />;
    }
    render(<SelfDisabling />);

    const firstResult = fireEvent.keyDown(window, { key: "?" });
    expect(onFire).toHaveBeenCalledOnce();
    // `dispatchEvent` returns false when the event was cancelable and
    // `preventDefault()` was called.
    expect(firstResult).toBe(false);

    const repeatResult = fireEvent.keyDown(window, { key: "?", repeat: true });
    // Not run twice — a repeat is still "one intent, however long it is held".
    expect(onFire).toHaveBeenCalledOnce();
    // But still claimed: the repeat must not reach the browser un-prevented,
    // or a held `?` opens Firefox's quick-find bar behind the sheet it just
    // opened.
    expect(repeatResult).toBe(false);
  });
});
