import { useToggleSet } from "@/hooks/use-toggle-set";
import { ExtractDepList, ExtractRow } from "./ExtractRows";
import { type ExtractFileRow, fileDepNote, fileRows } from "./extract-phase";
import type { RepoDep, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — the Extract phase's second card: the files discovery actually
 * READ, and what each of them yielded.
 *
 * The managers card above lists every matched file; this one lists the scanned
 * ones, which is the honest difference the fetch cap makes. A file with no
 * dependencies still gets a row — a package file Renovate reads and finds
 * nothing in is a result, not an absence.
 */

function depManager(dep: RepoDep): string {
  return dep.manager;
}

function FileRow({
  row,
  open,
  onToggle,
}: {
  row: ExtractFileRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <ExtractRow
      lead={row.file.path}
      count={fileDepNote(row.file)}
      note={row.file.managers.join(", ")}
      open={open}
      onToggle={onToggle}
    >
      <ExtractDepList deps={row.deps} trailing={depManager} />
    </ExtractRow>
  );
}

export function ExtractFilesCard({ view }: { view: RepoDepsView }) {
  const open = useToggleSet();
  const rows = fileRows(view);
  return (
    <ul className="extract-rows">
      {rows.map((row) => (
        <FileRow
          key={row.file.path}
          row={row}
          open={open.set.has(row.file.path)}
          onToggle={() => open.toggle(row.file.path)}
        />
      ))}
    </ul>
  );
}
