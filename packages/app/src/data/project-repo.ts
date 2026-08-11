/**
 * The app's own repository — the UPSTREAM project, not a self-hoster's fork.
 * Shared by the session-menu links (055/066) and the welcome panel's
 * "analyze this project's config" dogfood shortcut.
 *
 * The repository's CURRENT name: GitHub renamed `renovate-config-visualizer`
 * to `renovate-config-debugger` (the app's own title since 016), and the old
 * name lives on as a redirect. Verified against
 * `gh api repos/secustor/renovate-config-debugger`. A link a user reads before
 * clicking should carry the name they will land on.
 */
export const REPO_URL = "https://github.com/secustor/renovate-config-debugger";
