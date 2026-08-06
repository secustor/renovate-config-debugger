import { SessionMenuItem } from "@/components/SessionMenuItem";

/**
 * Roadmap 055 — the two links out of the app and into its repository: the
 * source, and the place to report what went wrong. Both targets are the
 * UPSTREAM project — a self-hoster's fork is not where a bug report about this
 * app belongs.
 *
 * Roadmap 066 moved them out of the header row and into the session menu, and
 * that RETIRES 055's icon-only rule: the links were unlabelled because the
 * header corner was the app's most crowded row and could not afford the words.
 * A menu row can, so they now say what they are instead of relying on a
 * `title` the reader has to hover to discover.
 */

// The repository's CURRENT name: GitHub renamed `renovate-config-visualizer`
// to `renovate-config-debugger` (the app's own title since 016), and the old
// name lives on as a redirect. Verified against
// `gh api repos/secustor/renovate-config-debugger`. A link a user reads before
// clicking should carry the name they will land on.
const REPO_URL = "https://github.com/secustor/renovate-config-debugger";
const ISSUES_URL = `${REPO_URL}/issues`;

/** Octicons 16px: `mark-github`, `issue-opened`. */
const ICONS = {
  repo: "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z",
  issues:
    "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
} as const;

/** `title` only where the hover text says more than the visible label. */
const LINKS: readonly { key: keyof typeof ICONS; href: string; label: string; title?: string }[] = [
  {
    key: "repo",
    href: REPO_URL,
    label: "Source on GitHub",
  },
  {
    key: "issues",
    href: ISSUES_URL,
    label: "Report an issue",
    title: "Report an issue on GitHub",
  },
];

export function ProjectLinks({ onSelect }: { onSelect: () => void }) {
  return (
    <>
      {LINKS.map(({ key, href, label, title }) => (
        <SessionMenuItem
          key={key}
          icon={ICONS[key]}
          label={label}
          title={title}
          href={href}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
