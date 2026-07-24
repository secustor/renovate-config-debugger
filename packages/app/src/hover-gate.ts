import { useRef } from "react";

/**
 * Roadmap 025: hover cards opened on plain `mouseenter` also open when
 * scrolled content merely slides an anchor under an already-stationary
 * cursor — the browser fires `mouseenter` for the element that ends up
 * under the pointer regardless of whether the pointer itself moved. That
 * synthesized hover then sits there occluding whatever the user actually
 * scrolled to see, since nothing moves it away again.
 *
 * `mousemove` only fires on genuine input-device motion, so gating the
 * "show" call behind the first `mousemove` after `mouseenter` — rather than
 * `mouseenter` itself — treats a pure-scroll hover as (correctly) not a
 * hover. A real hover still opens instantly for any user: the pointer
 * essentially always wobbles by a pixel the moment it lands.
 */
export function useMoveGatedHover<T extends Element = Element>(
  onShow: (el: T) => void,
): {
  onMouseEnter: () => void;
  onMouseMove: (e: React.MouseEvent<T>) => void;
  onMouseLeave: () => void;
} {
  const moved = useRef(false);

  return {
    onMouseEnter: () => {
      moved.current = false;
    },
    onMouseMove: (e) => {
      if (moved.current) {
        return;
      }
      moved.current = true;
      onShow(e.currentTarget);
    },
    onMouseLeave: () => {
      moved.current = false;
    },
  };
}
