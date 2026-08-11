/**
 * Roadmap 066 — one row of the header's session menu: icon, label, an optional
 * caption, and the out-of-app glyph when the row leaves the app.
 *
 * A row is an anchor when it has an `href` and a button otherwise; both wear
 * the same class, because to the reader they are the same thing — a line in a
 * menu — and the distinction is only about what the browser does with it.
 *
 * The caption is not decoration. It is the only place the app ever states, in
 * the open, what "sign out" does that "revoke" does not (before 066 that lived
 * in a `title` attribute nobody hovers).
 */

/** Octicon 16px: `link-external`. */
const EXTERNAL =
  "M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z";

interface Props {
  /** An Octicon 16px path — the `d`, not an element. */
  icon: string;
  label: string;
  /** One line under the label, for a row whose consequence isn't obvious. */
  note?: string;
  tone?: "accent" | "danger";
  /** Present ⇒ the row is an external anchor and gains the external glyph. */
  href?: string;
  title?: string;
  /**
   * Roadmap 068: the key that does the same thing, printed at the end of the
   * row the way a native menu prints it — already spelled for this platform by
   * `formatShortcut`. `aria-hidden`, because the accessible name should stay
   * the label; the row's `note` is where the key is stated in words.
   */
  shortcut?: string;
  /** Runs on activation. Every row closes the menu, so this always dismisses. */
  onSelect: () => void;
}

interface BodyProps {
  icon: string;
  label: string;
  note: string | undefined;
  external: boolean;
  shortcut: string | undefined;
}

function ItemBody({ icon, label, note, external, shortcut }: BodyProps) {
  return (
    <>
      <svg
        className="session-menu-item-icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path d={icon} />
      </svg>
      <span className="session-menu-item-body">
        {label}
        {note === undefined ? null : <span className="session-menu-item-note">{note}</span>}
      </span>
      {shortcut === undefined ? null : (
        <kbd className="session-menu-item-kbd" aria-hidden="true">
          {shortcut}
        </kbd>
      )}
      {external ? (
        <svg
          className="session-menu-item-ext"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d={EXTERNAL} />
        </svg>
      ) : null}
    </>
  );
}

export function SessionMenuItem({
  icon,
  label,
  note,
  tone,
  href,
  title,
  shortcut,
  onSelect,
}: Props) {
  const className = tone === undefined ? "session-menu-item" : `session-menu-item ${tone}`;
  const body = (
    <ItemBody
      icon={icon}
      label={label}
      note={note}
      external={href !== undefined}
      shortcut={shortcut}
    />
  );

  return href === undefined ? (
    <button type="button" className={className} title={title} onClick={onSelect}>
      {body}
    </button>
  ) : (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      onClick={onSelect}
    >
      {body}
    </a>
  );
}
