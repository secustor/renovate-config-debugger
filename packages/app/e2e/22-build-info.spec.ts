import { expect, test } from "@playwright/test";

/**
 * Roadmap 088 — the "verify this build" popover.
 *
 * A build without git bakes no identity and renders no anchors (the Docker
 * image) — this skips there rather than fail on the environment.
 */
test.describe("build-info popover (088)", () => {
  test("clicks inside the panel keep it open; outside closes it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cm-content")).toContainText("config:recommended");

    const trigger = page.getByRole("button", { name: "About this build" });
    test.skip((await trigger.count()) === 0, "build carries no baked identity");

    await trigger.click();
    const panel = page.locator(".build-info-panel");
    await expect(panel).toBeVisible();

    // Non-interactive content: before the panel carried tabindex=-1, this
    // click let focus fall to the config column (a tabindex=-1 skip-link
    // target), and the hook's focus-left close fired for a click INSIDE.
    await panel.locator(".build-info-cmd").click();
    await expect(panel).toBeVisible();
    await panel.locator(".build-info-note").click();
    await expect(panel).toBeVisible();

    // The rebuild tab: the whole runnable recipe, clone to diff.
    await panel.getByRole("button", { name: "rebuild & diff" }).click();
    await expect(panel).toBeVisible();
    await expect(panel.locator(".build-info-cmd")).toContainText("git clone");
    await expect(panel.locator(".build-info-cmd")).toContainText("mise run verify-build");

    // A click outside still closes.
    await page.locator(".landing-title").click();
    await expect(panel).toHaveCount(0);
  });
});
