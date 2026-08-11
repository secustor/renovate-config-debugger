/**
 * Roadmap 068: the policy behind "a programmatic jump the user asked for moves
 * focus to its target" — the part that decides, with no DOM and no React in it.
 * `hooks/use-focus-landing.ts` is the other half: the counters, the
 * `document.activeElement` reads and the animation-frame polling that feed
 * these decisions.
 *
 * Split out because the decisions are where the bugs were: five review rounds
 * found one each (a landing that fired against the wrong commit, one that stole
 * a caret, one that overruled a deliberate click, one cancelled by its own
 * successor), and every one of them was invisible to the unit suites while this
 * lived inline in a 1800-line component.
 */

/**
 * What a deferred landing remembers about the gesture that asked for it: where
 * focus was, and how much typing, clicking and jumping the page had seen by
 * then.
 */
export interface LandingTicket {
  /** Who held focus as the gesture was made. `<body>` and "nobody" are the same
   *  answer here and both arrive as null — see `focusHolder` in the hook. */
  readonly from: Element | null;
  readonly configInputSeq: number;
  readonly pointerSeq: number;
  readonly armSeq: number;
}

/**
 * Everything a landing measures itself against, as one mutable record: the
 * edits to the config being run, the `pointerdown`s the page has seen, and the
 * landings armed. Counters rather than flags, so a landing compares against the
 * moment ITS gesture was made instead of against a shared "has anything
 * happened" bit.
 *
 * Mutable on purpose. The hook keeps exactly one of these in a ref and bumps it
 * from document listeners: `input` fires on every keystroke, and the panels'
 * render budget while typing (032) is measured on exactly that path, so none of
 * this may be React state.
 */
export interface LandingActivity {
  /** `input` events from the text the run is built from, and only those — the
   *  hook's listener is what decides which those are. */
  configInputSeq: number;
  pointerSeq: number;
  armSeq: number;
}

export function createLandingActivity(): LandingActivity {
  return { configInputSeq: 0, pointerSeq: 0, armSeq: 0 };
}

/** Takes the ticket for a landing being armed right now, and records it as the
 *  newest one — which is what lets it outrank the landings already waiting. */
export function armLanding(activity: LandingActivity, from: Element | null): LandingTicket {
  activity.armSeq += 1;
  return {
    from,
    configInputSeq: activity.configInputSeq,
    pointerSeq: activity.pointerSeq,
    armSeq: activity.armSeq,
  };
}

/**
 * Roadmap 068: whether a landing deferred by a few animation frames — or, for
 * ⌘⇧⏎, by a whole run — may still move the user. A landing that waits has to
 * assume they kept working, and pulling them out of what they moved to is worse
 * than not landing at all.
 *
 * Four questions, all against the ticket taken when the gesture was made, and
 * `focused` is who holds focus now (null for `<body>` or nobody):
 *
 * - **Has the CONFIG BEING RUN been edited since?** Then the results describe
 *   older text, and the landing would take the user to an answer about a
 *   config that no longer exists. The case it is really for is the one no focus
 *   comparison can see: ⌘⇧⏎ is pressed FROM the editor and the caret is still
 *   there when the run commits seconds later, so nothing about WHERE focus is
 *   changes while the user types their next character. An `input` event is a
 *   USER edit — an applied fix rewrites the document through React state and
 *   CodeMirror, which dispatches none — so this reads keystrokes rather than
 *   text changes, and an apply-fix landing does not cancel itself.
 *
 *   Scoped to that config (2026-08-11 review), because that is the whole
 *   content of the rule above. Every OTHER field in the app is focus-visible:
 *   typing into the simulator's `packageName`, the repo-load form's repo box or
 *   a host field means focus is in it, so the third question below has already
 *   stood the landing down — while an undifferentiated `input` counter also
 *   cancelled on text that no run ever read, which is how ⌘⇧⏎ silently
 *   degraded to a plain ⌘⏎ for anyone who filled in a dep while waiting. The
 *   one gesture this no longer sees is a ⌘⇧⏎ pressed FROM such a field and
 *   typed into without leaving, and there the landing is exactly what the
 *   gesture asked for: nothing typed in those fields is text the run resolved.
 * - **Has a NEWER landing been armed since?** Then this one is the stale half
 *   of one gesture chain and the newer one is what the user last asked for.
 *   Without this, two digit jumps in one animation frame ended with the strip
 *   selecting one tab and focus sitting on the other: the first landing focused
 *   its tab, and the second read that focus move — its own predecessor's — as
 *   the user moving on, and stood down (068 review).
 * - **Is focus somewhere real the gesture did not leave it?** Then the user put
 *   it there since, and this landing is no longer the newest thing they asked
 *   for.
 * - **If focus is nowhere: did the user put it there?** Nowhere is the NORMAL
 *   state for these gestures — switching results tabs marks the panel holding
 *   the activator `hidden` in the same commit and the browser drops focus — so
 *   that alone cannot mean "moved on". A `pointerdown` since the gesture
 *   separates the two: clicking a paragraph of prose to read it blurs to body
 *   just the same, and that one IS a choice (068 review).
 *
 * SCROLLING is deliberately not a fifth question (2026-08-11 review), even
 * though a wheel during the wait does mean the reader is looking elsewhere and
 * the landing will scroll the page out from under them. Editing the config and
 * clicking REPLACE what the gesture asked for — the results now describe older
 * text, or the user has chosen another target. Scrolling only looks around, and the
 * gesture most exposed to it is the one that waits longest and is most explicit
 * about wanting to be moved: ⌘⇧⏎ means "run and take me there", the run can
 * take seconds, and reviewing the config on the way is exactly what a reader
 * does while waiting. Cancelling on that would make the chord's whole
 * difference from ⌘⏎ evaporate for anyone with a trackpad — a silent no-op,
 * which is the failure this feature keeps finding in itself.
 */
export function landingWanted(
  ticket: LandingTicket,
  activity: LandingActivity,
  focused: Element | null,
): boolean {
  if (activity.configInputSeq !== ticket.configInputSeq || activity.armSeq !== ticket.armSeq) {
    return false;
  }
  if (focused !== null) {
    return focused === ticket.from;
  }
  return activity.pointerSeq === ticket.pointerSeq;
}

/**
 * Roadmap 068 review: whether the jump itself is the reason focus is no longer
 * on the activator — so that taking focus costs the user nothing they still
 * hold. Two ways that happens here: the activator sits inside a subtree the
 * jump marked `hidden` (how `ResultsPanel` switches tabs), or it left the
 * document altogether.
 *
 * The case this exists for is the editor's preset hover card, whose jump button
 * `preventDefault`s `mousedown` precisely so the caret STAYS in `.cm-content`.
 * The editor is in the config column, so no tab switch touches it: focus is
 * still exactly where the user left it, a landing that took it would cost them
 * their caret, and their next keystrokes would drive the bare-key layer instead
 * of the document.
 *
 * Holding nothing counts as displaced: there is no caret to cost anyone, and
 * Safari leaves activeElement on the body after a click on a button anyway.
 */
export function jumpDisplacedFocus(from: Element | null): boolean {
  if (from === null) {
    return true;
  }
  return !from.isConnected || from.closest("[hidden]") !== null;
}
