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
 * A row is a button that WRITES the reference field — the one Load button
 * stays the only thing that loads, so the branch field and the inherit row
 * apply to a picked repo exactly as they do to a pasted one.
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

function PickerRow({ row, onPick }: { row: RepoPickerRow; onPick: () => void }) {
  return (
    <button
      type="button"
      className={`repo-picker-row${row.selected ? " selected" : ""}`}
      aria-pressed={row.selected}
      onClick={onPick}
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
          <PickerRow row={row} onPick={() => picker.onPick(row.name)} />
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
      </p>
      <PickerBody picker={picker} />
      {picker.hiddenMatches > 0 ? (
        <p className="repo-picker-note">…and {picker.hiddenMatches} more — type to narrow.</p>
      ) : null}
    </div>
  );
}
