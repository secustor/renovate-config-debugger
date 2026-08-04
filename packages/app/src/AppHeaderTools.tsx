import { ProjectLinks } from "@/components/ProjectLinks";
import { ThemeSwitch } from "@/components/ThemeSwitch";

/** Roadmap 037: the theme override sits beside the version badge — the
 *  header's existing "about this session" corner. Roadmap 055 puts the two
 *  links out of the app — source, issues — in the same corner. */
export function AppHeaderTools({ renovateVersion }: { renovateVersion: string | undefined }) {
  return (
    <span className="app-header-tools">
      <ProjectLinks />
      <ThemeSwitch />
      {renovateVersion !== undefined ? (
        <span className="version-badge">Renovate v{renovateVersion}</span>
      ) : null}
    </span>
  );
}
