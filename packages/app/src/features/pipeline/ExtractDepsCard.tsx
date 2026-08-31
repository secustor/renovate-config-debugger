import { useMemo } from "react";
import { useToggleSet } from "@/hooks/use-toggle-set";
import { plural } from "@/lib/format";
import { ExtractDepList, ExtractRow } from "./ExtractRows";
import { depGroups, type ExtractDepGroup } from "./extract-phase";
import type { RepoDep, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — the Extract phase's third card, and the phase's result: every
 * dependency the walk extracted, grouped by the manager that read it.
 *
 * The footer hands the reader on rather than repeating the Dependencies tab:
 * this card explains WHERE the list came from, that tab is the full searchable
 * list with the row actions. Switching tabs is the shell's act, so it arrives
 * as a callback (features never reach into the app layer).
 */

function depFile(dep: RepoDep): string {
  return dep.packageFile;
}

function DepGroupRow({
  group,
  open,
  onToggle,
}: {
  group: ExtractDepGroup;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <ExtractRow
      lead={group.manager}
      count={plural(group.deps.length, "dep")}
      open={open}
      onToggle={onToggle}
    >
      <ExtractDepList deps={group.deps} trailing={depFile} />
    </ExtractRow>
  );
}

export function ExtractDepsCard({
  view,
  onOpenDependencies,
}: {
  view: RepoDepsView;
  onOpenDependencies: () => void;
}) {
  const open = useToggleSet();
  // Derived once per discovery, not once per row toggle — the cap admits
  // hundreds of files, and expansion state lives in this same component.
  const groups = useMemo(() => depGroups(view), [view]);
  return (
    <>
      <ul className="extract-rows">
        {groups.map((group) => (
          <DepGroupRow
            key={group.manager}
            group={group}
            open={open.set.has(group.manager)}
            onToggle={() => open.toggle(group.manager)}
          />
        ))}
      </ul>
      <button type="button" className="btn-quiet extract-jump" onClick={onOpenDependencies}>
        Open the Dependencies tab
      </button>
    </>
  );
}
