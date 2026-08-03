/**
 * Roadmap 053: the rule-evidence card's DOM identity, in one place.
 *
 * The card is portalled to `<body>`, so its class is not only a style hook —
 * it is the ONLY way anything can ask "is the card open?" or "is this node
 * inside it?", and two behaviors depend on that answer: the card's own
 * light-dismiss (a pointer press inside the card must not close it) and the
 * Escape order (`use-thread-nav` must let an open card have the key first).
 * Spelled as a literal in three files, a CSS rename would have left the
 * queries silently matching nothing — which reads as "no card is open".
 *
 * Same shape, and the same reason, as `datalist-ids.ts`.
 */

/** The class on the card element itself (beside the shared `.option-card`). */
export const RULE_POP_CLASS = "sim-rule-pop";

/** That class as a selector, for `closest()` / `querySelector()`. */
export const RULE_POP_SELECTOR = `.${RULE_POP_CLASS}`;
