import { type Extension, keymap, Prec } from "@uiw/react-codemirror";
import { codeMirrorKey, RUN_SHORTCUT } from "@/lib/shortcuts";

/**
 * Roadmap 067: ⌘⏎ runs the pipeline from inside the editor too — which is not
 * a free slot. `basicSetup` installs `@codemirror/commands`' `defaultKeymap`,
 * and that binds `Mod-Enter` to `insertBlankLine`. Two things follow:
 *
 * - **`Prec.highest`**, or the default binding wins and the user gets a blank
 *   line instead of a run.
 * - **`return true`**, which makes CodeMirror call `preventDefault()` on the
 *   event. That is what stops the app's own window-level listener
 *   (`use-shortcut.ts`, which bails on `defaultPrevented`) from running the
 *   pipeline a second time for the same keypress.
 *
 * The key string is derived from the registry entry rather than written out,
 * so the editor and the page cannot end up bound to different chords.
 *
 * Deliberately unguarded against an in-flight run: the binding must consume
 * ⌘⏎ either way — declining it would hand the keypress back to
 * `insertBlankLine` exactly while the user is holding the key down — so the
 * "is a run already going?" question is answered once, inside `App.onRun`,
 * where every other entry point asks it too.
 *
 * `run` is read through a ref rather than closed over, so the extension is
 * built once for the editor's lifetime — closing over it would mean a `useMemo`
 * dependency on a callback whose identity changes every render, i.e. a
 * reconfigure per keystroke.
 */
export function runKeymap(runRef: { readonly current: (() => void) | undefined }): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: codeMirrorKey(RUN_SHORTCUT),
        run: () => {
          const onRun = runRef.current;
          if (!onRun) {
            return false;
          }
          onRun();
          return true;
        },
      },
    ]),
  );
}
