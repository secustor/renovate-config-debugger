import { useMemo } from "react";
import { useToggleSet } from "@/hooks/use-toggle-set";
import { plural } from "@/lib/format";
import { ExtractNotes, ExtractRow } from "./ExtractRows";
import {
  type ExtractManagerRow,
  fileDepNote,
  fileDepTone,
  managerNotes,
  managerRows,
} from "./extract-phase";
import type { RepoDepFile, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — the Extract phase's first card: which managers claimed which
 * files.
 *
 * Matching is the cheap path-only step, so this covers the WHOLE walk — every
 * file the tree listing offered, not just the ten discovery went on to fetch.
 * A file the cap dropped says "not read" rather than "no deps": nobody read
 * it, so nothing at all is known about what is inside.
 */

function ManagerFiles({ files }: { files: readonly RepoDepFile[] }) {
  return (
    <ul className="extract-sublist">
      {files.map((file) => (
        <li key={file.path} className="extract-subrow">
          <code className="extract-subrow-lead">{file.path}</code>
          <span className={`extract-subrow-trail ${fileDepTone(file)}`}>{fileDepNote(file)}</span>
        </li>
      ))}
    </ul>
  );
}

function ManagerRow({
  row,
  open,
  onToggle,
}: {
  row: ExtractManagerRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <ExtractRow
      lead={row.manager}
      count={plural(row.files.length, "file")}
      note={row.preview}
      open={open}
      onToggle={onToggle}
    >
      <ManagerFiles files={row.files} />
    </ExtractRow>
  );
}

export function ExtractManagersCard({ view }: { view: RepoDepsView }) {
  const open = useToggleSet();
  // Derived once per discovery, not once per row toggle (see ExtractDepsCard).
  const rows = useMemo(() => managerRows(view), [view]);
  const notes = useMemo(() => managerNotes(view), [view]);
  return (
    <>
      <ul className="extract-rows">
        {rows.map((row) => (
          <ManagerRow
            key={row.manager}
            row={row}
            open={open.set.has(row.manager)}
            onToggle={() => open.toggle(row.manager)}
          />
        ))}
      </ul>
      <ExtractNotes notes={notes} />
    </>
  );
}
