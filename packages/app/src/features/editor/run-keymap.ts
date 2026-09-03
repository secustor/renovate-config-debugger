import { EditorView, type Extension, Prec } from "@uiw/react-codemirror";
import { matchShortcut, RUN_SHORTCUT } from "@/lib/shortcuts";

/**
 * Roadmap 068: ⌘⏎ runs the pipeline from inside the editor too — which is not
 * a free slot. `basicSetup` installs `@codemirror/commands`' `defaultKeymap`,
 * and that binds `Mod-Enter` to `insertBlankLine`. Two things follow:
 *
 * - **`Prec.highest`**, or the default binding wins and the user gets a blank
 *   line instead of a run. A DOM handler at `highest` outranks every keymap:
 *   `keymap`'s own listener is installed at `Prec.default`, and CodeMirror
 *   stops at the first handler that returns true.
 * - **`return true`**, which makes CodeMirror call `preventDefault()` on the
 *   event. That is what stops the app's own window-level listener
 *   (`use-shortcut.ts`, which bails on `defaultPrevented`) from running the
 *   pipeline a second time for the same keypress — but only while the event is
 *   still being dispatched, which is why the handler below checks that it is.
 *   `InputState.handleEvent` runs the DOM handlers in a MICROTASK whenever the
 *   view is mid-update. For a keypress the browser dispatched that is still in
 *   time: a microtask checkpoint runs between two listeners of the same event,
 *   so the claim is in place before the window sees it. For a keydown some
 *   other JS dispatched synchronously there is no such checkpoint, and the
 *   deferred pass runs after the whole dispatch — window listener included.
 *
 * A DOM handler rather than a `keymap` entry, for the one thing a keymap
 * command is not given: **the event**. `KeyboardEvent.repeat` is how OS key
 * auto-repeat announces itself, and a HELD ⌘⏎ is one intent, not thirty — the
 * chord is still claimed on a repeat (declining it would hand the keypress
 * straight back to `insertBlankLine`, mid-hold, which is the blank-line bug in
 * its worst form), it just does not start a run. Matching through
 * `matchShortcut` instead of a `Mod-Enter` key string is the other half of the
 * trade: the editor and the page now agree about what ⌘⏎ IS, down to accepting
 * either modifier, rather than deriving two spellings from one registry entry
 * and hoping CodeMirror reads `Mod` the way `matchShortcut` does.
 *
 * A deliberate second press while a run is going is NOT declined — not here and
 * not by `App.onRun`, which queues it. This is the binding that makes that
 * matter: press ⌘⏎, fix the typo the first run is about to report, press ⌘⏎
 * again, and a decline would be invisible, because the handler claims the chord
 * either way. `event.repeat` is the whole of the distinction — one HELD key,
 * one run; two presses, two runs.
 *
 * `run` is read through a ref rather than closed over, so the extension is
 * built once for the editor's lifetime — closing over it would mean a `useMemo`
 * dependency on a callback whose identity changes every render, i.e. a
 * reconfigure per keystroke.
 */
export function runKeymap(runRef: { readonly current: () => void }): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown: (event) => {
        if (!matchShortcut(event, RUN_SHORTCUT)) {
          return false;
        }
        // Two ways the chord is claimed without starting a run, and claiming is
        // the part neither may skip — handing the keypress back would hand it
        // to `insertBlankLine`.
        //
        // `event.repeat` is OS auto-repeat: one held key is one intent.
        //
        // `eventPhase` back at `NONE` means the dispatch is already OVER, i.e.
        // this is CodeMirror's deferred pass (see above) after a synchronously
        // dispatched keydown. The window listener has then already had the
        // event un-prevented and started the run for it, so running here would
        // be the second one for a single keypress.
        if (event.repeat || event.eventPhase === Event.NONE) {
          return true;
        }
        runRef.current();
        return true;
      },
    }),
  );
}
