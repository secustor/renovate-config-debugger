import { expect, test } from "@playwright/test";
import { encodeShareFragment, INVALID_AUTOMERGE_CONFIG, PACKAGE_RULES_CONFIG } from "./fixtures";
import { runAndAwaitResult, setEditorContent } from "./helpers";

/**
 * Roadmap 023 — honest error states. A config with a validate-stage error is
 * still processed and its post-Validate results shown, but a real Renovate run
 * would refuse it — a banner must say so on those results.
 */
test("a validation error adds a hypothetical-run banner to post-Validate results", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  await setEditorContent(page, INVALID_AUTOMERGE_CONFIG);
  await runAndAwaitResult(page);

  // The validate stage errored (a red dot, an Errors & warnings entry)…
  await expect(page.locator(".stage-timeline .dot.error").first()).toBeVisible();
  await expect(page.locator(".messages li.error").first()).toBeVisible();

  // …and the honesty banner is present on the post-Validate results.
  const banner = page.locator(".hypothetical-banner");
  await expect(banner.first()).toBeVisible();
  await expect(banner.first()).toContainText(/would refuse this config/i);
});

/**
 * Roadmap 023 — the "my rules only" filter. The most common wish across the
 * persona sessions: find your own rule fast. One click filters the simulator
 * results to the repo config's own packageRules, with clause evidence expanded.
 */
test("the simulator 'my rules only' filter shows repo rules with clause evidence expanded", async ({
  page,
}) => {
  const fragment = await encodeShareFragment({ config: PACKAGE_RULES_CONFIG });
  await page.goto(fragment);

  await expect(page.locator(".stage-timeline")).toBeVisible({ timeout: 30_000 });
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await expect(simulator).toBeVisible();

  // A run has to exist before the filter appears (it needs a simulation).
  await simulator.getByRole("button", { name: "npm dependency" }).click();
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 15_000 });

  const myRules = simulator.getByRole("button", { name: "my rules only" });
  await expect(myRules).toBeVisible();
  await myRules.click();

  // The repo rule row is shown, pre-expanded, with its clause evidence visible.
  const expandedRow = simulator.locator(".sim-rule.expanded").first();
  await expect(expandedRow).toBeVisible();
  await expect(expandedRow.locator(".sim-clause").first()).toBeVisible();
});
