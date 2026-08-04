/**
 * Roadmap 055 — the two links out of the app and into its repository: the
 * source, and the place to report what went wrong. They live in the header's
 * "about this session" corner (037) beside the theme switch and the version
 * badge, because that corner already answers "what am I looking at?".
 *
 * Icon-only by design: the corner is the app's most crowded row, and the
 * accessible name lives on the anchor (`aria-label` + `title`), not in a
 * label the layout cannot afford. Both targets are the UPSTREAM project — a
 * self-hoster's fork is not where a bug report about this app belongs.
 */

// The repository was renamed to `renovate-config-debugger`; the old name still
// redirects, but a link the user can read should carry the current one.
const REPO_URL = "https://github.com/secustor/renovate-config-debugger";
const ISSUES_URL = `${REPO_URL}/issues`;

/** Octicons 16px: `mark-github`, `issue-opened`. */
const ICONS = {
  repo: "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z",
  issues:
    "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
} as const;

const LINKS: readonly { key: keyof typeof ICONS; href: string; label: string; title: string }[] = [
  {
    key: "repo",
    href: REPO_URL,
    label: "Source on GitHub",
    title: "Source on GitHub",
  },
  {
    key: "issues",
    href: ISSUES_URL,
    label: "Report an issue",
    title: "Report an issue on GitHub",
  },
];

export function ProjectLinks() {
  return (
    <span className="project-links">
      {LINKS.map(({ key, href, label, title }) => (
        <a
          key={key}
          className="btn quiet"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          title={title}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d={ICONS[key]} />
          </svg>
        </a>
      ))}
    </span>
  );
}
