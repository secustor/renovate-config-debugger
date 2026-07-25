import { expect, test } from "@playwright/test";
import { encodeShareFragment, PACKAGE_RULES_CONFIG } from "./fixtures";
import { resultsPanel, setEditorContent } from "./helpers";

/**
 * Journey 2 — share link opened into an already-running app (the 017
 * regression). A share link opened while the app is live is a hash-only
 * navigation: nothing reloads, so the `hashchange` listener is the only thing
 * that can load and run it. This is invisible to unit tests, the golden/
 * shimmed suites and the production build alike — it only exists in a live
 * browser with navigation history.
 */

test("hash-only navigation into a running app loads and runs the shared config", async ({
  page,
}) => {
  // Fail loudly if any confirm dialog appears — with no unsaved edits, loading
  // must be silent (no clobber prompt).
  page.on("dialog", (d) => {
    throw new Error(`unexpected dialog: ${d.message()}`);
  });

  await page.goto("/");
  // App is mounted and idle at the default config (no auto-run without a token).
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await expect(resultsPanel(page)).toHaveCount(0);

  // Same-tab, hash-only navigation — exactly what pasting a share link into an
  // open tab does. Setting location.hash fires `hashchange` without a reload.
  const fragment = await encodeShareFragment({ config: PACKAGE_RULES_CONFIG });
  await page.evaluate((h) => {
    window.location.hash = h;
  }, fragment);

  // The 017 fix: the shared config loads and the pipeline runs.
  await expect(page.locator(".cm-content")).toContainText("matchPackageNames", {
    timeout: 15_000,
  });
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".version-badge")).toBeVisible({ timeout: 30_000 });
});

test("hash navigation with unsaved edits fires the clobber confirm, then loads on accept", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  // Introduce an unsaved edit so content drifts from the loaded baseline —
  // this is what makes the next navigation a potential clobber.
  await setEditorContent(page, '{\n  "rangeStrategy": "bump"\n}\n');

  // Accept the clobber confirm when it fires, recording that it did.
  let dialogMessage: string | null = null;
  page.on("dialog", (d) => {
    dialogMessage = d.message();
    void d.accept();
  });

  const fragment = await encodeShareFragment({ config: PACKAGE_RULES_CONFIG });
  await page.evaluate((h) => {
    window.location.hash = h;
  }, fragment);

  // The shared config loads after the confirm is accepted.
  await expect(page.locator(".cm-content")).toContainText("matchPackageNames", {
    timeout: 15_000,
  });
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });

  // The confirm actually fired, and warned about replacing edits.
  expect(dialogMessage).not.toBeNull();
  expect(dialogMessage!).toMatch(/edits will be replaced/i);
});
