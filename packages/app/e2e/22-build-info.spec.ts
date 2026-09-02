import { expect, test } from "@playwright/test";
import { gotoAppAtDefaultConfig } from "./helpers";

/**
 * Roadmap 088 — the "verify this build" popover.
 *
 * A build without git bakes no identity and renders no anchors (the Docker
 * image) — this skips there rather than fail on the environment.
 */
test.describe("build-info popover (088)", () => {
  test("clicks inside the panel keep it open; outside closes it", async ({ page }) => {
    await gotoAppAtDefaultConfig(page);

    const trigger = page.getByRole("button", { name: "About this build" });
    test.skip((await trigger.count()) === 0, "build carries no baked identity");

    await trigger.click();
    const panel = page.locator(".build-info-panel");
    await expect(panel).toBeVisible();

    // Non-interactive content: before the panel carried tabindex=-1, this
    // click let focus fall to the config column (a tabindex=-1 skip-link
    // target), and the hook's focus-left close fired for a click INSIDE.
    // The close it guards is asynchronous, so the re-assert is sequenced on
    // what the click itself lands — focus moving off the link the popover
    // opened onto and settling ON the panel, which is exactly what the
    // tabindex is for — rather than on a visibility that was already true
    // before the click.
    await panel.locator(".build-info-cmd").click();
    await expect(panel).toBeFocused();
    await expect(panel).toBeVisible();

    // The rebuild tab: the whole runnable recipe, clone to diff. Its content
    // swap is this click's landing, so it comes before the panel re-assert.
    await panel.getByRole("button", { name: "rebuild & diff" }).click();
    await expect(panel.locator(".build-info-cmd")).toContainText("git clone");
    await expect(panel.locator(".build-info-cmd")).toContainText("mise run verify-build");
    await expect(panel).toBeVisible();

    // The note is the panel's other non-interactive region, and it is clicked
    // HERE rather than beside the one above on purpose: the tab click just put
    // focus on that button, so this click moves focus back to the panel and
    // has a transition of its own to wait on. Straight after the cmd click,
    // focus is already on the panel and `toBeFocused()` would be true on its
    // first poll — a sync point that synchronises nothing.
    await panel.locator(".build-info-note").click();
    await expect(panel).toBeFocused();
    await expect(panel).toBeVisible();

    // A click outside still closes.
    await page.locator(".landing-title").click();
    await expect(panel).toHaveCount(0);
  });
});
