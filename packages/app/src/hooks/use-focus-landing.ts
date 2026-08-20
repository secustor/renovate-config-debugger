import { useEffect, useMemo, useRef } from "react";
import {
  armLanding,
  createLandingActivity,
  jumpDisplacedFocus,
  type LandingActivity,
  type LandingTicket,
  landingWanted,
} from "@/lib/focus-landing";

/** One deferred landing: what to wait for, what to do with it, and the gesture
 *  it answers. */
export interface LandingRequest {
  /** The gesture this landing belongs to — `arm()`ed when it was made, which
   *  for ⌘⇧⏎ is a whole run before the landing runs. */
  ticket: LandingTicket;
  /** Retried once per animation frame until it returns an element or the budget
   *  runs out. */
  find: () => HTMLElement | null;
  /** Handed what `find` produced — or `null`, which is how each caller says what
   *  "it never appeared" means instead of spinning forever. Not called at all
   *  when the user has moved on in the meantime (`landingWanted`). */
  land: (target: HTMLElement | null) => void;
  frames: number;
  /** Look on THIS frame first, so a target that already exists is landed on
   *  without a flicker. */
  thisFrame: boolean;
}

export interface FocusLanding {
  /** The ticket for a landing being armed right now. */
  arm: () => LandingTicket;
  /** Whether the jump displaced the focus this landing would be taking. */
  displaced: (ticket: LandingTicket) => boolean;
  whenReady: (request: LandingRequest) => void;
}

/**
 * `document.activeElement`, with the two ways of holding nothing collapsed into
 * one: `<body>` is where the browser leaves focus when the element that had it
 * is hidden or removed, and it is where Safari leaves it after a click on a
 * button.
 *
 * Exported since the ninth 068 review for App's `gestureWantsResultsLanding`,
 * which asks the same question of the same DOM — it had spelled the collapse
 * out a second time, and both spellings have to agree for a ticket's `from` and
 * "who is holding focus now" to be comparable at all.
 */
export function focusHolder(): Element | null {
  const active = document.activeElement;
  return active === document.body ? null : active;
}

/**
 * Where the text a pipeline run is built from is typed: the config document
 * (CodeMirror wraps its contenteditable in `.cm-editor`, and the app mounts
 * exactly one editor — `features/editor/ConfigEditor.tsx`), and the 008 layer
 * boxes on the pipeline's global/inherit stage cards (`.layer-editor`, roadmap
 * 076), whose parsed JSON App hands to the same run as `globalConfig` /
 * `inheritedConfig` (`lib/run-inputs.ts`).
 *
 * A selector rather than refs because these surfaces are other components'
 * (the editor card, the stage card) while the listener is one document-level
 * handler — and the editor is CodeMirror's own DOM in any case, which App holds
 * as a `ConfigEditorHandle`, not as an element.
 *
 * The editor's WRAPPER, deliberately, which also covers the fields
 * `@codemirror/search` renders inside it: a keystroke in the search box is not
 * an edit, so this stands a landing down that could have run. The precise
 * alternative — matching the contenteditable host — would rest on `input`
 * events being targeted at it exactly, and getting THAT wrong loses the one
 * case the counter exists for. A missed search keystroke costs one landing; a
 * missed config keystroke costs the rule.
 */
const RUN_CONFIG_TEXT_SELECTOR = ".cm-editor, .layer-editor";

/**
 * Whether this `input` event edited the config the run describes — the question
 * `landingWanted`'s first test is actually asking (`lib/focus-landing.ts`
 * states the rule). Everything else the user can type into leaves the run's
 * text alone, and is visible to the focus test besides.
 */
function editsRunConfig(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(RUN_CONFIG_TEXT_SELECTOR) !== null;
}

/**
 * Roadmap 068: the machinery behind "every cross-link, skip link and jump key
 * lands the user on what it names" — the counters that say what the page has
 * seen, and the animation-frame wait that gets a landing to an element which
 * does not exist yet.
 *
 * Polling at all, because the target is not there when the gesture happens. The
 * results half is a lazy chunk (031), so on the FIRST run its column and its tab
 * strip are a download away; a preset row is three commits away (the tab switch,
 * the ancestor expansion the new selection triggers, and the windowed list (011)
 * scrolling the row into its rendered slice).
 *
 * Every decision this makes lives in `lib/focus-landing.ts`, where it can be
 * unit-tested; what is left here is the DOM and the timing.
 */
export function useFocusLanding(): FocusLanding {
  // Not state, and deliberately: `input` fires on every keystroke, and the
  // panels' render budget while typing (032) is measured on exactly that path.
  const activityRef = useRef<LandingActivity | null>(null);
  const activity = (activityRef.current ??= createLandingActivity());

  useEffect(() => {
    function countInput(event: Event) {
      // Listened for on the document, counted only for the run's own text. The
      // listener has to be here — the keystrokes that matter are the ones typed
      // into CodeMirror, which never move the caret out of the editor, so no
      // focus- or React-state-based test can see them — but its REACH is not
      // the rule it serves: counting every field's keystrokes cancelled
      // ⌘⇧⏎'s landing for typing the run had never read (2026-08-11 review).
      if (editsRunConfig(event.target)) {
        activity.configInputSeq += 1;
      }
    }
    function countPointer() {
      activity.pointerSeq += 1;
    }
    // Both events bubble — including out of CodeMirror's contenteditable — so
    // the document sees all of them.
    document.addEventListener("input", countInput);
    document.addEventListener("pointerdown", countPointer);
    return () => {
      document.removeEventListener("input", countInput);
      document.removeEventListener("pointerdown", countPointer);
    };
  }, [activity]);

  return useMemo<FocusLanding>(
    () => ({
      arm: () => armLanding(activity, focusHolder()),
      displaced: (ticket) => jumpDisplacedFocus(ticket.from),
      whenReady: ({ ticket, find, land, frames, thisFrame }) => {
        function look(left: number) {
          const target = find();
          if (target || left <= 0) {
            // Asked once, here at the end of the wait rather than while it runs:
            // what matters is whether the user still wants to be moved NOW.
            if (landingWanted(ticket, activity, focusHolder())) {
              land(target);
            }
            return;
          }
          requestAnimationFrame(() => look(left - 1));
        }
        if (thisFrame) {
          look(frames);
          return;
        }
        requestAnimationFrame(() => look(frames));
      },
    }),
    [activity],
  );
}
