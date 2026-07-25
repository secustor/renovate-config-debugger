import { expect, test } from "@playwright/test";
import { encodeShareFragment, PACKAGE_RULES_CONFIG } from "./fixtures";
import { openTab, resultsPanel } from "./helpers";

/**
 * Journey 1 — cold share link. Opening a `#config=` URL directly must decode
 * the config into the editor, auto-run the pipeline, and show the results
 * shell + Renovate version badge. Guards the whole engine-in-browser path:
 * decode → populate → run, from a link alone.
 */
test("cold share link decodes, auto-runs, and shows the results shell + version badge", async ({
  page,
}) => {
  const fragment = await encodeShareFragment({ config: PACKAGE_RULES_CONFIG });
  await page.goto(fragment);

  // The decoded config lands in the editor.
  await expect(page.locator(".cm-content")).toContainText("matchPackageNames", {
    timeout: 15_000,
  });

  // The pipeline auto-ran: the results shell + version badge appear (a wedged
  // run fails these waits well inside the per-test timeout).
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  const badge = page.locator(".version-badge");
  await expect(badge).toBeVisible({ timeout: 30_000 });
  await expect(badge).toContainText(/Renovate v\d+\.\d+/);

  // The simulator (which only mounts on a result with a merged config)
  // confirms the run produced a real, rules-bearing result.
  await openTab(page, "simulator");
  await expect(page.getByText("Update simulator")).toBeVisible();
});
