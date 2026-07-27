import { useEffect, useState } from "react";
import { OVERSCAN, ROW_HEIGHT } from "./tree-shared";

/**
 * Windowing state for a scroll container: which slice of rows to mount. The
 * container is captured through a callback ref held in state, so the scroll
 * listener re-attaches whenever the element (re)mounts, not just on first run.
 */
export function useWindow(count: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
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

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  return {
    ref: setEl,
    el,
    start,
    end,
    padTop: start * ROW_HEIGHT,
    padBottom: Math.max(0, (count - end) * ROW_HEIGHT),
  };
}
