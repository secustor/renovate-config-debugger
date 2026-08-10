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
 * A stack settles it structurally instead: the layer registered LAST is on top,
 * which is the one the user opened last, which is the one they mean.
 * Element-scoped handlers (a glossary term's own `onKeyDown`, the repo-load
 * form's) stay where they are — they only fire when focus is already inside
 * them, so they cannot race anything.
 *
 * Pure: no DOM, no React. The single document listener belongs to the hook
 * (`hooks/use-escape-layer.ts`), which is also what keeps this unit-testable in
 * the node-environment `unit` project.
 */

export type EscapeHandler = () => void;

const stack: EscapeHandler[] = [];

/**
 * Registers `handler` as the topmost layer and returns its release. The release
 * is idempotent and order-independent: a layer torn down out of order removes
 * exactly its own entry, never whichever entry happens to be on top.
 */
export function pushEscapeLayer(handler: EscapeHandler): () => void {
  stack.push(handler);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const index = stack.lastIndexOf(handler);
    if (index !== -1) {
      stack.splice(index, 1);
    }
  };
}

/** Runs the topmost layer, if any. Returns whether one consumed the key. */
export function handleEscape(): boolean {
  const top = stack.at(-1);
  if (!top) {
    return false;
  }
  top();
  return true;
}

/** Test seam: how many layers are currently registered. */
export function escapeLayerCount(): number {
  return stack.length;
}
