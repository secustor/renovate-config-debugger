import { expect, type Page, test } from "@playwright/test";
import { resultsPanel } from "./helpers";

/**
 * Roadmap 045 — the repo-load form's inherited-config probe, end to end against
 * a stubbed GitHub API (no live network: every request to api.github.com is
 * answered here, CORS allowed, and anything not named below is a 404).
 *
 * What the tests pin: the checkbox defaults ON, the target fields track the
 * typed owner, a load fills the inherited layer and labels where it came from,
 * unticking the box performs NO probe, a missing file leaves the layer empty
 * with the quiet note a real (non-strict) run implies — and a link copied after
 * an auto-load carries the layer as TEXT, so reopening it fetches nothing.
 */

const REPO_CONFIG = JSON.stringify({ labels: ["dependencies"], prHourlyLimit: 2 });
const INHERITED_CONFIG = JSON.stringify({ automerge: false, prHourlyLimit: 4 }, null, 2);

const CONFIG_URL = "https://api.github.com/repos/renovate-org/backend-api/contents/renovate.json";
const PROBE_URL =
  "https://api.github.com/repos/renovate-org/renovate-config/contents/org-inherited-config.json";

/**
 * Answers `files` (exact URL → body) with 200 and everything else on
 * api.github.com with 404, recording every URL asked for. A 404 is the honest
 * default: it is what both the config probe and the inherited-config probe read
 * as "not there".
 */
async function stubGithub(page: Page, files: Record<string, string>): Promise<string[]> {
  const seen: string[] = [];
  await page.route(/^https:\/\/api\.github\.com\//, async (route) => {
    const url = route.request().url();
    seen.push(url);
    const body = files[url];
    await route.fulfill({
      status: body === undefined ? 404 : 200,
      headers: { "access-control-allow-origin": "*", "content-type": "text/plain" },
      body: body ?? "not found",
    });
  });
  return seen;
}

/** The repo-load form, opened from the editor card's title bar. */
async function openRepoForm(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await page.getByRole("button", { name: "Load from repo…" }).click();
  await expect(page.locator(".repo-panel")).toBeVisible();
}

function inheritCheckbox(page: Page) {
  return page.getByRole("checkbox", { name: /Also load the org/ });
}

function inheritedLayerEditor(page: Page) {
  return page.locator(".advanced-settings", { hasText: "Inherited config" }).locator("textarea");
}

/** Opens the Advanced zone and its inherited-config section by hand — what a
 *  user does when the probe found nothing and stayed quiet about it. */
async function openInheritedSection(page: Page): Promise<void> {
  await page.locator("details.advanced-zone > summary").click();
  await page
    .locator("details.advanced-settings", { hasText: "Inherited config" })
    .locator("> summary")
    .click();
}

test("a load fills the inherited layer, labels its origin, and editing makes it yours", async ({
  page,
}) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await openRepoForm(page);

  // Default ON, and the target tracks the owner as it is typed.
  await expect(inheritCheckbox(page)).toBeChecked();
  const targetRepo = page.getByRole("textbox", { name: "Inherited config repository" });
  const targetFile = page.getByRole("textbox", { name: "Inherited config file name" });
  await expect(targetRepo).toHaveValue("{{parentOrg}}/renovate-config");
  await page
    .getByRole("textbox", { name: "Repository", exact: true })
    .fill("renovate-org/backend-api");
  await expect(targetRepo).toHaveValue("renovate-org/renovate-config");
  await expect(targetFile).toHaveValue("org-inherited-config.json");

  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });

  // The probe ran, exactly once, against exactly that file.
  expect(seen.filter((url) => url === PROBE_URL)).toHaveLength(1);

  // The layer holds the fetched text and says where it came from.
  await expect(inheritedLayerEditor(page)).toHaveValue(INHERITED_CONFIG);
  const origin = page.locator(".layer-origin");
  await expect(origin).toBeVisible();
  await expect(origin.locator(".badge.auto")).toHaveText("auto-loaded");
  await expect(origin).toContainText("renovate-org/renovate-config");
  await expect(origin).toContainText("org-inherited-config.json");
  await expect(origin).toContainText("editing makes it yours");

  // Editing it drops the origin line: from here it is an ordinary pasted layer.
  await inheritedLayerEditor(page).fill('{ "automerge": true }');
  await expect(page.locator(".layer-origin")).toHaveCount(0);
});

test("unticking the checkbox performs no probe at all", async ({ page }) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await openRepoForm(page);

  await inheritCheckbox(page).uncheck();
  await page
    .getByRole("textbox", { name: "Repository", exact: true })
    .fill("renovate-org/backend-api");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });

  expect(seen).toContain(CONFIG_URL);
  expect(seen).not.toContain(PROBE_URL);
  await openInheritedSection(page);
  await expect(inheritedLayerEditor(page)).toHaveValue("");
  await expect(page.locator(".layer-origin")).toHaveCount(0);
});

test("a missing inherited config leaves the layer empty with the quiet note", async ({ page }) => {
  // Only the repo config exists — the probe's target 404s, exactly like a real
  // org that never created one.
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG });
  await openRepoForm(page);

  await page
    .getByRole("textbox", { name: "Repository", exact: true })
    .fill("renovate-org/backend-api");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  expect(seen).toContain(PROBE_URL);

  await openInheritedSection(page);
  await expect(inheritedLayerEditor(page)).toHaveValue("");
  await expect(page.locator(".layer-origin")).toHaveCount(0);
  const note = page.locator(".advanced-note", { hasText: "No org inherited config" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("renovate-org/renovate-config");
  await expect(note).toContainText("inheritConfigStrict");
  // Not an error: a real run tolerates this too.
  await expect(page.locator(".layer-editor-error")).toHaveCount(0);
});

test("a link copied after an auto-load carries the layer as text and fetches nothing", async ({
  page,
}) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await openRepoForm(page);
  await page
    .getByRole("textbox", { name: "Repository", exact: true })
    .fill("renovate-org/backend-api");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(inheritedLayerEditor(page)).toHaveValue(INHERITED_CONFIG);

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("#config=");
  const url = page.url();

  await page.goto("about:blank");
  seen.length = 0;
  await page.goto(url);
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });

  // The layer arrives as content — as a PASTED layer, with no origin line and
  // without the link touching the platform API.
  await expect(inheritedLayerEditor(page)).toHaveValue(INHERITED_CONFIG);
  await expect(page.locator(".layer-origin")).toHaveCount(0);
  expect(seen).toEqual([]);
});
