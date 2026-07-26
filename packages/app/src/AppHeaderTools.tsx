import { ThemeSwitch } from "@/components/ThemeSwitch";

/** Roadmap 037: the theme override sits beside the version badge — the
 *  header's existing "about this session" corner. */
export function AppHeaderTools({ renovateVersion }: { renovateVersion: string | undefined }) {
  return (
    <span className="app-header-tools">
      <ThemeSwitch />
      {renovateVersion !== undefined ? (
        <span className="version-badge">Renovate v{renovateVersion}</span>
      ) : null}
    </span>
  );
}
