import { Term } from "@/components/glossary";
import type { InheritLayerState } from "@/lib/inherit-probe";
import type { LayerParseResult } from "@/lib/input-schemas";

/**
 * Roadmap 076 (design turn 18d) — the two self-hosted config layers (008),
 * edited where the pipeline shows them.
 *
 * They used to be two disclosures at the bottom of the Advanced zone, three
 * clicks from the diff that reports what they did. The pipeline rail already
 * carries a `global` and an `inherit` node, and selecting one already opens a
 * stage card — so the layer's INPUT now sits in that card, immediately above
 * the diff it produces. The zone keeps the things that are not layers (the
 * repository host and the credentials) and links across.
 *
 * The trade the move makes, stated once: a layer can only be edited once a run
 * exists, because the pipeline tab does not exist before one. The zone says so
 * in the sentence that replaces the two sections.
 *
 * Everything here is the old `LayerSection` body verbatim — the notes, the
 * placeholders, the `.layer-editor` / `.layer-editor-error` / `.layer-origin`
 * classes — minus the `<details>` wrapper the stage card replaces.
 */

interface Props {
  kind: "global" | "inherit";
  value: string;
  onChange: (value: string) => void;
  parse: LayerParseResult;
  /** Roadmap 045: what the last inherited-config probe did. Only ever set for
   *  the inherited layer; null = no probe has run (or the layer has been edited
   *  since, which makes it a pasted layer). */
  inheritState?: InheritLayerState | null;
}

const PLACEHOLDERS: Record<Props["kind"], string> = {
  global: '{ "globalExtends": ["config:best-practices"], "platform": "gitlab" }',
  inherit: '{ "extends": ["github>my-org/renovate-config"], "automerge": false }',
};

/** The global layer's explanatory note — its own component since the nested
 *  `<Term><code>…</code></Term>` puts it one level past the depth ratchet. */
function GlobalConfigNote() {
  return (
    <p className="advanced-note">
      Running your own Renovate bot? Paste its <Term id="globalConfig">global config</Term> as JSON
      to model the full layer stack: it merges between Renovate&apos;s defaults and your repo
      config, after its own <code>globalExtends</code> presets. Options like <code>platform</code>,{" "}
      <code>endpoint</code> or <code>onboarding</code> become run context instead of merging. Leave
      empty to run without this layer.
    </p>
  );
}

/** The inherited layer's explanatory note — split out for the same reason. */
function InheritedConfigNote() {
  return (
    <p className="advanced-note">
      Defaults a self-hosted bot shares across repositories via{" "}
      <Term id="inheritedConfig">
        <code>inheritConfig</code>
      </Term>
      . Validated with Renovate&apos;s inherit rules, its presets resolved, bot-only options
      stripped — then merged between the global layer and the repo config. Leave empty to run
      without this layer, or let a repo load fetch it for you.
    </p>
  );
}

/**
 * Roadmap 045: what the last inherited-config probe did, in the three states
 * the approved mockup defines. Rendered between the note and the editor, above
 * the text the probe wrote — an auto-filled layer says where it came from and
 * that editing it makes it the user's own (which is literally true: any edit
 * clears this line, and the layer is a pasted one from then on).
 */
function InheritStateNote({ state }: { state: InheritLayerState }) {
  const target = (
    <>
      <code>{state.target.repo}</code> · <code>{state.target.file}</code>
    </>
  );
  if (state.kind === "auto-loaded") {
    return (
      <>
        <p className="layer-origin">
          <span className="badge auto">auto-loaded</span>
          from {target}
          {state.disabledByGlobal ? null : " — editing makes it yours, like a pasted layer."}
        </p>
        {state.disabledByGlobal ? (
          <p className="layer-hint">
            Your global config sets <code>inheritConfig: false</code> — a run under that global
            config would not apply this layer.
          </p>
        ) : null}
      </>
    );
  }
  if (state.kind === "missing") {
    // Absent file, `inheritConfigStrict` off (the default): a real run carries
    // on without the layer, so the app does too — quietly.
    return state.strict ? (
      <p className="layer-editor-error">
        Your global config sets <code>inheritConfigStrict: true</code> and{" "}
        <code>{state.target.repo}</code> has no <code>{state.target.file}</code> (404) — a real run
        would abort here instead of continuing without the layer.
      </p>
    ) : (
      <p className="advanced-note">
        No org inherited config: <code>{state.target.repo}</code> has no{" "}
        <code>{state.target.file}</code> (404). A real run tolerates this too (
        <code>inheritConfigStrict</code> is off by default).
      </p>
    );
  }
  // A refused request is not an absent file: say which it was.
  return (
    <p className={state.strict ? "layer-editor-error" : "advanced-note"}>
      Couldn&apos;t look for an inherited config in {target}: {state.detail}
      {state.strict ? (
        <>
          {" "}
          Your global config sets <code>inheritConfigStrict: true</code>, so a real run would abort
          on this.
        </>
      ) : (
        // The engine's own detail already names the cause (CORS, a missing
        // token, a rate limit), so this only says what the user can do next.
        " You can paste the layer by hand below."
      )}
    </p>
  );
}

export function StageLayerEditor({ kind, value, onChange, parse, inheritState }: Props) {
  return (
    <div className="layer-editor-block">
      {kind === "global" ? <GlobalConfigNote /> : <InheritedConfigNote />}
      {kind === "inherit" && inheritState ? <InheritStateNote state={inheritState} /> : null}
      <textarea
        className="layer-editor"
        aria-label={kind === "global" ? "Global config JSON" : "Inherited config JSON"}
        placeholder={PLACEHOLDERS[kind]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={6}
      />
      {parse.error ? (
        <p className="layer-editor-error">
          Not valid JSON: {parse.error}. The pipeline won&apos;t run until this parses or the field
          is cleared.
        </p>
      ) : null}
    </div>
  );
}
