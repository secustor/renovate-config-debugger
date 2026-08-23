import { useState } from "react";
import { isValidHost, isValidToken } from "@/lib/input-schemas";

/** Roadmap 076's quick-fill chips (design 18e, verbatim): the hosts a reader
 *  most often needs a credential for, each filling BOTH blanks' types — the
 *  host and the `hostType` the engine matches rules on. */
const HOST_CHIPS: readonly { host: string; hostType: string }[] = [
  { host: "registry.npmjs.org", hostType: "npm" },
  { host: "docker.io", hostType: "docker" },
  { host: "gitlab.example.com", hostType: "gitlab" },
];

/** A chip's host carries the chip's `hostType`; anything typed by hand is a
 *  guess the app cannot make, so it gets `"any"` — and typing over a chip's
 *  host makes it a guess again, for free, because this is derived. */
function hostTypeFor(host: string): string {
  return HOST_CHIPS.find((chip) => chip.host === host)?.hostType ?? "any";
}

function AddHostChips({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (host: string) => void;
}) {
  return (
    <div className="host-add-quick">
      <span className="advanced-hint">Quick fill:</span>
      {HOST_CHIPS.map((chip) => (
        <button
          key={chip.host}
          type="button"
          className="btn-secondary host-chip"
          aria-pressed={chip.host === selected}
          onClick={() => onSelect(chip.host)}
        >
          {chip.host}
        </button>
      ))}
    </div>
  );
}

/** The sentence itself — its own component because the two blanks plus the
 *  prose around them sit one level below the form's wrapper. */
function AddHostSentence({
  host,
  token,
  onHostChange,
  onTokenChange,
}: {
  host: string;
  token: string;
  onHostChange: (value: string) => void;
  onTokenChange: (value: string) => void;
}) {
  return (
    <p className="host-add-sentence">
      Requests to{" "}
      <input
        className="blank-input"
        type="text"
        aria-label="Host to authenticate against"
        placeholder="gitea.example.com"
        autoComplete="off"
        spellCheck={false}
        value={host}
        onChange={(e) => onHostChange(e.target.value)}
      />{" "}
      authenticate with{" "}
      <input
        className="blank-input"
        type="password"
        aria-label="Token for this host"
        placeholder="token"
        value={token}
        onChange={(e) => onTokenChange(e.target.value)}
      />
    </p>
  );
}

/** The form's buttons — split out for the same depth reason as the sentence. */
function AddHostActions({
  canAdd,
  onAdd,
  onCancel,
}: {
  canAdd: boolean;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="host-add-actions">
      <button type="button" className="btn-primary" disabled={!canAdd} onClick={onAdd}>
        Add host
      </button>
      <button type="button" className="btn-secondary" onClick={onCancel}>
        Cancel
      </button>
      <span className="advanced-hint host-add-note">tokens stay in this tab</span>
    </div>
  );
}

/**
 * Roadmap 076: adding a host reads as a sentence with two blanks — "Requests to
 * ⟨host⟩ authenticate with ⟨token⟩" — rather than as a form. Which is what
 * `hostRules` entries actually are, and it keeps the collapsed list to the
 * hosts that mean something.
 *
 * The host blank is free text: any host can carry a credential, not just the
 * four this app happens to have canonical rows for. A host typed by hand gets
 * hostType `"any"` (the app cannot know what runs there); a chip names the
 * type it stands for. Naming one of the four canonical hosts writes THAT
 * host's type token instead of a rule — one row per host, never two.
 */
export function AddHostForm({
  onAdd,
}: {
  onAdd: (host: string, hostType: string, token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  // Not state: the type is a pure function of the host, so holding it
  // separately only creates a second thing to keep in sync — which is exactly
  // what the two setters that used to shadow every `setHost` were doing.
  const hostType = hostTypeFor(host);
  if (!open) {
    return (
      <button type="button" className="btn-quiet host-add-toggle" onClick={() => setOpen(true)}>
        + Add host…
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setHost("");
    setToken("");
  };
  return (
    <div className="host-add">
      <AddHostChips selected={host} onSelect={setHost} />
      <AddHostSentence host={host} token={token} onHostChange={setHost} onTokenChange={setToken} />
      {host !== "" && !isValidHost(host) ? (
        <p className="layer-editor-error">
          Not a valid host name: a bare host like <code>gitea.example.com</code> (a port is fine),
          no scheme and no path.
        </p>
      ) : null}
      {/* Roadmap 030's header-injection rule, surfaced HERE: `addRule` refuses
          such a token silently (its contract), so without this gate a pasted
          token with a stray newline would close the form and add nothing. */}
      {token !== "" && !isValidToken(token) ? (
        <p className="layer-editor-error">
          This token contains characters that can&apos;t be sent in a request header, or is too
          long.
        </p>
      ) : null}
      <AddHostActions
        canAdd={isValidHost(host) && token !== "" && isValidToken(token)}
        onAdd={() => {
          onAdd(host, hostType, token);
          close();
        }}
        onCancel={close}
      />
    </div>
  );
}
