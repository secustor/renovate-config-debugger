/**
 * Roadmap 067: one owner for Escape.
 *
 * Before this, the layers that can be open at once listened for Escape
 * independently — the rule-evidence popover, the session menu, the simulator's
 * return pill — and precedence between them was settled by the pill asking the
 * DOM whether a popover happened to be mounted
 * (`document.querySelector(RULE_POP_SELECTOR)`). That worked for two layers and
 * would have had to know about every future one.
 *
 * A ranked stack settles it structurally instead: the highest-priority layer
 * wins, and push order breaks ties inside a rank. Push order ALONE is not
 * enough — see `ESCAPE_PRIORITY`. Element-scoped handlers (a glossary term's
 * own `onKeyDown`, the repo-load form's) stay where they are, but they owe the
 * ladder one thing: a handler that acts on Escape must `stopPropagation()`, or
 * the document listener below it pops a layer in the same press. That contract
 * is enforced from the other end too, for the surfaces that cannot honor it:
 * `use-escape-layer.ts` ignores Escape raised inside a text-editing target,
 * because CodeMirror's `simplifySelection` fires on every press and cannot be
 * asked to stop propagating.
 *
 * Pure: no DOM, no React. The single document listener belongs to the hook
 * (`hooks/use-escape-layer.ts`), which is also what keeps this unit-testable in
 * the node-environment `unit` project.
 */

export type EscapeHandler = () => void;

/**
 * What is visually on top, independent of who registered first.
 *
 * Mount order is not the same as stacking order: open a rule-evidence popover
 * from a thread body, then keyboard-activate that thread's step link, and the
 * return pill registers AFTER the card that is drawn over it. Plain push order
 * would then hand Escape to the pill and leave the popover standing — the exact
 * inversion the deleted `document.querySelector(RULE_POP_SELECTOR)` check
 * existed to prevent. The rank is the 067 ladder, written down once.
 */
export const ESCAPE_PRIORITY = {
  /** Popovers and hover cards: drawn over everything, so dismissed first. */
  popover: 3,
  /** Menus anchored to a control — the session menu. */
  menu: 2,
  /** Ambient affordances the user can read past: the simulator's return pill. */
  ambient: 1,
} as const;

export type EscapePriority = (typeof ESCAPE_PRIORITY)[keyof typeof ESCAPE_PRIORITY];

interface EscapeLayer {
  handler: EscapeHandler;
  priority: EscapePriority;
}

const stack: EscapeLayer[] = [];
let suspensions = 0;

/**
 * Registers `handler` at `priority` and returns its release. The release is
 * idempotent and order-independent: a layer torn down out of order removes
 * exactly its own entry, never whichever entry happens to be on top.
 */
export function pushEscapeLayer(handler: EscapeHandler, priority: EscapePriority): () => void {
  const layer: EscapeLayer = { handler, priority };
  stack.push(layer);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const index = stack.indexOf(layer);
    if (index !== -1) {
      stack.splice(index, 1);
    }
  };
}

/**
 * Parks the whole ladder and returns its release. The `?` shortcut sheet holds
 * one while it is open: it is a native `<dialog>` shown with `showModal()`, so
 * the browser is already the topmost Escape owner and everything behind it is
 * inert. Without this, one press would dismiss a layer the user cannot see AND
 * — because the ladder claims the key with `preventDefault` — suppress the
 * dialog's own close request, leaving the sheet up. Refcounted, so a second
 * modal nested inside the first cannot un-suspend on the way out.
 */
export function suspendEscapeLayers(): () => void {
  suspensions += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    suspensions -= 1;
  };
}

/** Highest priority wins; within a rank, the most recently pushed. */
function topLayer(): EscapeLayer | undefined {
  let top: EscapeLayer | undefined;
  for (const layer of stack) {
    if (top === undefined || layer.priority >= top.priority) {
      top = layer;
    }
  }
  return top;
}

/** Runs the topmost layer, if any. Returns whether one consumed the key. */
export function handleEscape(): boolean {
  if (suspensions > 0) {
    return false;
  }
  const top = topLayer();
  if (!top) {
    return false;
  }
  top.handler();
  return true;
}

/** Test seam: how many layers are currently registered. */
export function escapeLayerCount(): number {
  return stack.length;
}
