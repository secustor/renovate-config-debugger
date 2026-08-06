import { expect, test } from "@playwright/test";
import { openSessionMenu, themeSwitch } from "./helpers";

/**
 * Roadmap 066 — the header's session menu.
 *
 * These assert the DISCLOSURE CONTRACT, not the account rows: whether the
 * Account group renders at all depends on whether the build had OAuth
 * configured (043 — a self-hosted deployment legitimately has none, and CI
 * supplies the client id from a repo variable that may be empty), so an
 * assertion about "Sign in with GitHub" would pass or fail on the environment
 * rather than on the code. What is environment-independent is the trigger, the
 * panel it opens, the two things every deployment puts in it, and the way it
 * closes.
 */
test.describe("session menu (066)", () => {
  test("opens from the header corner, holds the theme switch and the project links", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".cm-content")).toContainText("config:recommended");

    // The corner is one control. Before 066 it was three, and the GitHub
    // session was not in the header at all.
    const trigger = page.locator(".app-header-tools .session-menu-trigger");
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".session-menu-panel")).toHaveCount(0);

    const panel = await openSessionMenu(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(themeSwitch(page).getByRole("radio")).toHaveCount(3);
    // Roadmap 055's links, which 066 finally lets say what they are: they were
    // icon-only because the header row could not afford the words.
    await expect(panel.getByRole("link", { name: "Source on GitHub" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Report an issue" })).toBeVisible();
  });

  test("Escape closes it and hands focus back to the trigger", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cm-content")).toContainText("config:recommended");

    const trigger = page.locator(".app-header-tools .session-menu-trigger");
    await openSessionMenu(page);
    // Opening moves focus INTO the panel, so the first action is already under
    // the keyboard rather than three Tabs away.
    await expect(page.locator(".session-menu-panel :focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(page.locator(".session-menu-panel")).toHaveCount(0);
    // The panel the user was in is gone, so focus has to land somewhere
    // deliberate — the same contract 023/039 gave the repo-load form.
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("a click outside closes it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cm-content")).toContainText("config:recommended");

    await openSessionMenu(page);
    await page.locator(".subtitle").click();
    await expect(page.locator(".session-menu-panel")).toHaveCount(0);
  });
});
