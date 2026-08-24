import { useCallback, useEffect, useRef, useState } from "react";
import { OVERSCAN, ROW_HEIGHT } from "./tree-shared";

/**
 * Windowing state for a scroll container: which slice of rows to mount. The
 * container is captured through a callback ref held in state, so the scroll
 * listener re-attaches whenever the element (re)mounts, not just on first run.
 */
export function useWindow(count: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  // The same element, in the mutable half of the pair: `scrollRowIntoView`
  // below WRITES to the container, and a state value is the one thing that may
  // not be written to (`react/immutability`). The state stays what it always
  // was — the render-visible "which element is mounted", which re-attaches the
  // listeners below and tells the caller's effect to try its scroll again.
  const elRef = useRef<HTMLDivElement | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    elRef.current = node;
    setEl(node);
  }, []);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);

  useEffect(() => {
    if (!el) {
      return;
    }
    const update = () => {
      setScrollTop(el.scrollTop);
      // Roadmap 028: this container now mounts inside a hidden tab panel,
      // where it measures 0 and would window down to almost no rows until the
      // ResizeObserver fires on reveal (a frame later). Keeping the last known
      // (or default) viewport until a REAL measurement arrives means the tree
      // is already populated the instant its tab is opened.
      const height = el.clientHeight;
      if (height > 0) {
        setViewport(height);
      }
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [el]);

  /**
   * Scroll the row at `index` just far enough to be inside the viewport — the
   * minimum move, so a row already visible is left exactly where it is.
   *
   * Lives here rather than at the call site because the container element is
   * this hook's: adjusting the scroll position of a value a hook handed back is
   * what `react/immutability` forbids, and the hook that constructed it is
   * where the modification belongs. A no-op before the container mounts, which
   * is the early return the caller used to make.
   */
  const scrollRowIntoView = useCallback((index: number) => {
    const box = elRef.current;
    if (!box) {
      return;
    }
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < box.scrollTop) {
      box.scrollTop = top;
    } else if (bottom > box.scrollTop + box.clientHeight) {
      box.scrollTop = bottom - box.clientHeight;
    }
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  return {
    ref: attach,
    el,
    scrollRowIntoView,
    start,
    end,
    padTop: start * ROW_HEIGHT,
    padBottom: Math.max(0, (count - end) * ROW_HEIGHT),
  };
}
