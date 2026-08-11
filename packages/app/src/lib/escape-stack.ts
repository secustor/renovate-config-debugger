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
 * enough — see `ESCAPE_PRIORITY`. Element-scoped handlers (a glossary anchor's
 * own `onKeyDown`, the repo-load form's) stay where they are, but they owe the
 * ladder one thing: a handler that acts on Escape must claim the key, or the
 * document listener below it pops a layer in the same press.
 *
 * WHICH claim depends on what else may want that press, and the two spellings
 * are not interchangeable:
 *
 * - `stopPropagation()` takes the press from everything above the handler — the
 *   ladder AND every ancestor element handler. That is right for a surface that
 *   owns what is inside it, which is the repo-load form: nothing outside the
 *   panel has any business acting on an Escape aimed at the panel.
 * - `preventDefault()` takes it from the ladder alone, because the ladder is
 *   what reads the flag. That is what a surface nested INSIDE another one owes:
 *   a glossary card can be a child of the repo-load form, and stopping
 *   propagation there cost the user a second Escape to cancel a panel they had
 *   asked to cancel once.
 *
 * The one surface that cannot be asked to stop propagating — the CodeMirror
 * editor — already keeps the second spelling on its own, preventing the default
 * of exactly the Escapes it acts on, and `use-escape-layer.ts` bails on
 * `defaultPrevented` (the mechanics, and where they were verified, are written
 * down there). So every control — the editor, a form field, a `<select>` — lets
 * a press it did nothing with through, and an open layer stays dismissible from
 * wherever the user happens to be standing.
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
let modalClaims = 0;

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
 * Declares that a modal surface owns the keyboard, and returns its release. The
 * `?` shortcut sheet holds one while it is open: it is a native `<dialog>`
 * shown with `showModal()`, so the browser is already the topmost key owner and
 * everything behind it is inert — but `inert` does not reach a document- or
 * window-level listener, so the page's own key layers have to be told. Two read
 * this, and both were bugs before they did:
 *
 * - the ladder below, which would otherwise dismiss a layer the user cannot see
 *   AND — because it claims the key with `preventDefault` — suppress the
 *   dialog's own close request, leaving the sheet up;
 * - `useHomeEndPageScroll` (016), which would otherwise scroll the inert page
 *   behind the dialog on End, leaving the sheet's own overflowing rows
 *   unreachable by a key the sheet itself advertises.
 *
 * Refcounted, so a second modal nested inside the first cannot hand the
 * keyboard back to the page on its way out.
 */
export function claimModalKeyboard(): () => void {
  modalClaims += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    modalClaims -= 1;
  };
}

/**
 * Whether a modal surface currently owns the keyboard. The query for page-level
 * key handlers that are NOT the ladder — they must stand aside for the same
 * reason it does, and asking here keeps one answer to "is a modal up?" instead
 * of a second listener-side copy of it.
 */
export function modalKeyboardOwned(): boolean {
  return modalClaims > 0;
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

/**
 * Whether a layer drawn OVER the page currently holds the user's attention —
 * `popover` or `menu`, never `ambient` alone.
 *
 * The 067 bare-key layer (`e`, `r`, `1`–`7`) asks this before it acts, for the
 * same reason it asks `isTextEditingTarget`: a bare key must not rearrange a
 * page the user is not looking at. The rule-evidence card is portalled to
 * `<body>` with `role="dialog"` and takes focus, so nothing in the "is the user
 * typing" predicate can see it — and pressing `2` while it was open switched
 * tabs underneath, leaving the card floating over a panel that no longer
 * contains the rule it explains.
 *
 * `ambient` is excluded, which is the whole reason this reads the rank instead
 * of `escapeLayerCount() > 0`. A popover and a menu cover the page and hold
 * focus; the simulator's return pill does neither — it is furniture the reader
 * is meant to read past, it stays up for a whole thread-navigation detour, and
 * disabling the jump layer for that entire stretch would cost the user more
 * than the confusion it prevents.
 *
 * Modal surfaces are NOT counted here: they are `modalKeyboardOwned()`, and the
 * bare keys are already switched off while the `?` sheet is up (App's
 * `keysLive`, which is what the sheet's own `enabled` flags read).
 */
export function overlayKeyboardOwned(): boolean {
  const top = topLayer();
  return top !== undefined && top.priority >= ESCAPE_PRIORITY.menu;
}

/** Runs the topmost layer, if any. Returns whether one consumed the key. */
export function handleEscape(): boolean {
  if (modalKeyboardOwned()) {
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
