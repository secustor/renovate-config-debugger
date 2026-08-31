import { SessionMenuItem } from "./SessionMenuItem";
import { MARK_GITHUB } from "@/data/octicons";
import { REPO_URL } from "@/data/project-repo";

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

const ISSUES_URL = `${REPO_URL}/issues`;

/** Octicons 16px: `mark-github`, `issue-opened`. */
const ICONS = {
  repo: MARK_GITHUB,
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
