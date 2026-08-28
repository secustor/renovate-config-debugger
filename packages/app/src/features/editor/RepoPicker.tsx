import { SessionAvatar } from "@/components/SessionAvatar";
import type { StoredUser } from "@/platform/oauth";
import type { RepoPickerRow, RepoPickerView } from "@/types/repo";

/**
 * Roadmap 085 — the "Your repositories" section of the repo-load overlay,
 * shown between the reference row and the inherited-config row while a GitHub
 * session is live. All state and behavior live in `useRepoPicker` (the app
 * shell, which composes this feature and hands the view model down); this file
 * only draws it. The model TYPES live in `src/types/repo.ts` — they used to sit
 * here, so that the shell would not have to import the shell, which inverted
 * the very dependency the layer rule protects (structure review, finding 18).
 *
 * A row is a button that WRITES the reference field, and CONFIRMING one —
 * Enter, or a double-click — writes it and loads it. Confirming is still the
 * one Load, called with the reference the row names, so the branch field and
 * the inherit row apply to a picked repo exactly as they do to a pasted one.
 * A single click (and Space, a button's other activation key) only writes, so
 * a row can be inspected before it is fetched.
 */

function ConfigBadge({ configFile }: { configFile: string | null | undefined }) {
  // Unknown (probe pending or failed) shows nothing: no badge is a shrug,
  // while "no config found" is a claim the probe actually made.
  if (configFile === undefined) {
    return null;
  }
  return configFile === null ? (
    <span className="repo-picker-badge none">no config found</span>
  ) : (
    <span className="repo-picker-badge found">{configFile}</span>
  );
}

function PickerRow({
  row,
  onPick,
  onActivate,
}: {
  row: RepoPickerRow;
  onPick: () => void;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      className={`repo-picker-row${row.selected ? " selected" : ""}`}
      aria-pressed={row.selected}
      title={`${row.name} — click to fill the reference, double-click to load`}
      onClick={onPick}
      onDoubleClick={onActivate}
      onKeyDown={(e) => {
        // A button turns Enter into a click, which would only pick. Cancelling
        // that default is what makes Enter mean "load this one" while Space
        // keeps the plain button behaviour (select, don't fetch).
        if (e.key === "Enter") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <code>{row.name}</code>
      <span className="repo-picker-note">{row.note}</span>
      <ConfigBadge configFile={row.configFile} />
    </button>
  );
}

function PickerBody({ picker }: { picker: RepoPickerView }) {
  if (picker.status === "loading") {
    return <p className="repo-picker-note">Loading your repositories…</p>;
  }
  if (picker.status === "error") {
    return (
      <p className="repo-picker-note">
        Could not list your repositories — paste a reference above instead.
      </p>
    );
  }
  if (picker.rows.length === 0) {
    return (
      <p className="repo-picker-note">No matching repositories — Load fetches what you typed.</p>
    );
  }
  return (
    <ul className="repo-picker-list">
      {picker.rows.map((row) => (
        <li key={row.name}>
          <PickerRow
            row={row}
            onPick={() => picker.onPick(row.name)}
            onActivate={() => picker.onActivate(row.name)}
          />
        </li>
      ))}
    </ul>
  );
}

export function RepoPicker({ picker, user }: { picker: RepoPickerView; user: StoredUser | null }) {
  return (
    <div className="repo-picker">
      <p className="repo-picker-label">
        <SessionAvatar url={user?.avatarUrl} size={14} fallback="person" />
        Your repositories
        {picker.status === "ready" && picker.rows.length > 0 ? (
          <span className="repo-picker-hint">Enter or double-click loads</span>
        ) : null}
      </p>
      <PickerBody picker={picker} />
      {picker.hiddenMatches > 0 ? (
        <p className="repo-picker-note">…and {picker.hiddenMatches} more — type to narrow.</p>
      ) : null}
    </div>
  );
}
