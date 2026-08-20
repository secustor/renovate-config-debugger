import { createContext, useCallback, useContext, useRef } from "react";
import type { OptionIndex } from "@renovate-config-debugger/engine";

/**
 * The option-docs context and the hooks that read it, plus the caret
 * hit-testing the diff views need. A separate FILE from `option-docs.tsx`,
 * colocated with it: that module renders components, and a component module
 * that also exports hooks breaks Fast Refresh
 * (react/only-export-components). The constraint is about the module, so the
 * pair stays side by side rather than being filed apart by kind.
 */

export interface OptionDocsValue {
  index: OptionIndex | null;
  show: (name: string, rect: DOMRect) => void;
  hide: () => void;
  cancelHide: () => void;
}

export const OptionDocsContext = createContext<OptionDocsValue>({
  index: null,
  show: () => {},
  hide: () => {},
  cancelHide: () => {},
});

export function useOptionDocs(): OptionDocsValue {
  return useContext(OptionDocsContext);
}

// Leading `$` admitted for `$schema` (roadmap 026) — the only renovate.json
// key that starts with one.
const KEY_TOKEN_RE = /"(\$?[A-Za-z][\w-]*)"(?=\s*:)/g;

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  // Deprecated, and deliberately so: it is the only caret hit-test WebKit
  // shipped before `caretPositionFromPoint`, reached only when that one is
  // absent (the branch above). Dropping it would silently disable option
  // hovers in the diff views on those browsers.
  // oxlint-disable-next-line typescript/no-deprecated -- see above
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function findOptionTokenAt(x: number, y: number): { name: string; rect: DOMRect } | null {
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const text = caret.node.textContent ?? "";
  for (const match of text.matchAll(KEY_TOKEN_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (caret.offset >= start && caret.offset <= end) {
      const range = document.createRange();
      range.setStart(caret.node, start);
      range.setEnd(caret.node, end);
      const rect = range.getBoundingClientRect();
      // caretPositionFromPoint snaps to the nearest character, so verify the
      // pointer is actually over the token before showing a card
      if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) {
        return { name: match[1] ?? "", rect };
      }
      return null;
    }
  }
  return null;
}

/**
 * Delegated hover handlers for text renderings that are not built from React
 * elements (the diff views): locates the `"key":` token under the pointer via
 * caret hit-testing and shows the same hover card.
 */
export function useDiffOptionHover(): {
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
} {
  const { index, show, hide } = useOptionDocs();
  const last = useRef({ x: -100, y: -100 });

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!index) {
        return;
      }
      if (Math.abs(e.clientX - last.current.x) < 6 && Math.abs(e.clientY - last.current.y) < 6) {
        return;
      }
      last.current = { x: e.clientX, y: e.clientY };
      const hit = findOptionTokenAt(e.clientX, e.clientY);
      if (hit) {
        show(hit.name, hit.rect);
      } else {
        hide();
      }
    },
    [index, show, hide],
  );

  const onMouseLeave = useCallback(() => hide(), [hide]);

  return { onMouseMove, onMouseLeave };
}
