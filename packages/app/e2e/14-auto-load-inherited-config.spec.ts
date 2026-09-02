import { expect, type Page, test } from "@playwright/test";
import {
  gotoAppAtDefaultConfig,
  loadRepo,
  openLayerStage,
  openRepoForm,
  resultsPanel,
} from "./helpers";

/**
 * Roadmap 045 — the repo-load form's inherited-config probe, end to end against
 * a stubbed GitHub API (no live network: every request to api.github.com is
 * answered here, CORS allowed, and anything not named below is a 404).
 *
 * Corrected 2026-07-26: the checkbox defaults OFF (see
 * roadmap/045-auto-load-inherited-config.md's "Correction (2026-07-26)" —
 * `inheritConfig` itself defaults to `false` and the Mend-hosted app disables
 * it too). What the tests pin: the default performs no probe at all, ticking
 * the box then loading fills the layer and labels where it came from, a
 * pasted global config's own `inheritConfig: true` auto-checks the box, a
 * missing file leaves the layer empty with the quiet note a real (non-strict)
 * run implies, an explicit `inheritConfig: false` still gets the existing
 * "would not apply" hint when the box is (manually) on, and a link copied
 * after an auto-load carries the layer as TEXT, so reopening it fetches
 * nothing.
 *
 * Roadmap 076 moved both layers out of the Advanced zone and onto their own
 * pipeline stage cards, which changes the flows here in one way: a global
 * config can no longer be pasted BEFORE the first run, because the tab holding
 * its editor does not exist yet. The two tests that used to start by pasting one
 * therefore load once first — which is also a truer reproduction of what a user
 * does, since they are now looking at the run the layer is about to change.
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

/** A fresh visit with the load form open — how every test here starts. */
async function startAtRepoForm(page: Page): Promise<void> {
  await gotoAppAtDefaultConfig(page);
  await openRepoForm(page);
}

function inheritCheckbox(page: Page) {
  return page.getByRole("checkbox", { name: /Also load the org/ });
}

/** Pastes `json` into the Global config layer — the pipeline's global stage
 *  card since 076, so this needs a run to have happened. */
async function pasteGlobalConfig(page: Page, json: string): Promise<void> {
  const editor = await openLayerStage(page, "global");
  await editor.fill(json);
}

test("the checkbox defaults off, and a load performs no probe at all", async ({ page }) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await startAtRepoForm(page);

  await expect(inheritCheckbox(page)).not.toBeChecked();
  await loadRepo(page, "renovate-org/backend-api");

  expect(seen).toContain(CONFIG_URL);
  expect(seen).not.toContain(PROBE_URL);
  const inherited = await openLayerStage(page, "inherit");
  await expect(inherited).toHaveValue("");
  await expect(page.locator(".layer-origin")).toHaveCount(0);
});

test("ticking the checkbox then loading probes, fills the layer, and labels its origin — editing makes it yours", async ({
  page,
}) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await startAtRepoForm(page);

  await expect(inheritCheckbox(page)).not.toBeChecked();
  await inheritCheckbox(page).check();

  // The target tracks the owner as it is typed.
  const targetRepo = page.getByRole("textbox", { name: "Inherited config repository" });
  const targetFile = page.getByRole("textbox", { name: "Inherited config file name" });
  await expect(targetRepo).toHaveValue("{{parentOrg}}/renovate-config");
  await page
    .getByRole("textbox", { name: "Repository", exact: true })
    .fill("renovate-org/backend-api");
  await expect(targetRepo).toHaveValue("renovate-org/renovate-config");
  await expect(targetFile).toHaveValue("org-inherited-config.json");

  await loadRepo(page);

  // The probe ran, exactly once, against exactly that file.
  expect(seen.filter((url) => url === PROBE_URL)).toHaveLength(1);

  // The layer holds the fetched text and says where it came from.
  const inherited = await openLayerStage(page, "inherit");
  await expect(inherited).toHaveValue(INHERITED_CONFIG);
  const origin = page.locator(".layer-origin");
  await expect(origin).toBeVisible();
  await expect(origin.locator(".badge.auto")).toHaveText("auto-loaded");
  await expect(origin).toContainText("renovate-org/renovate-config");
  await expect(origin).toContainText("org-inherited-config.json");
  await expect(origin).toContainText("editing makes it yours");

  // Editing it drops the origin line: from here it is an ordinary pasted layer.
  await inherited.fill('{ "automerge": true }');
  await expect(page.locator(".layer-origin")).toHaveCount(0);
});

test("a pasted global config with inheritConfig: true auto-checks the box, and a load then probes", async ({
  page,
}) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await startAtRepoForm(page);
  await expect(inheritCheckbox(page)).not.toBeChecked();

  // 076: the global layer's editor is a pipeline stage card, so there has to be
  // a run before there is anywhere to paste one. This first load probes nothing
  // (the box is still off), which is the same starting point as before.
  await loadRepo(page, "renovate-org/backend-api");
  expect(seen).not.toContain(PROBE_URL);

  // Live reactivity: pasting the global config checks the box, no reopen of the
  // load form needed for the derivation itself.
  await pasteGlobalConfig(page, JSON.stringify({ inheritConfig: true }));
  await openRepoForm(page);
  await expect(inheritCheckbox(page)).toBeChecked();

  await loadRepo(page);
  expect(seen).toContain(PROBE_URL);
  const inherited = await openLayerStage(page, "inherit");
  await expect(inherited).toHaveValue(INHERITED_CONFIG);

  // A manual override sticks even after the global config that triggered the
  // auto-check is removed — the user owns the checkbox from the moment they
  // touch it, same idiom as the probe-target fields.
  await openRepoForm(page);
  await expect(inheritCheckbox(page)).toBeChecked();
  await inheritCheckbox(page).uncheck();
  await pasteGlobalConfig(page, "");
  await expect(inheritCheckbox(page)).not.toBeChecked();
});

test("a missing inherited config leaves the layer empty with the quiet note", async ({ page }) => {
  // Only the repo config exists — the probe's target 404s, exactly like a real
  // org that never created one.
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG });
  await startAtRepoForm(page);

  await inheritCheckbox(page).check();
  await loadRepo(page, "renovate-org/backend-api");
  expect(seen).toContain(PROBE_URL);

  const inherited = await openLayerStage(page, "inherit");
  await expect(inherited).toHaveValue("");
  await expect(page.locator(".layer-origin")).toHaveCount(0);
  const note = page.locator(".advanced-note", { hasText: "No org inherited config" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("renovate-org/renovate-config");
  await expect(note).toContainText("inheritConfigStrict");
  // Not an error: a real run tolerates this too.
  await expect(page.locator(".layer-editor-error")).toHaveCount(0);
});

test("an explicit inheritConfig: false still flags a found layer, once the box is on", async ({
  page,
}) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await startAtRepoForm(page);

  // Same 076 preamble: one load, so the global layer has a card to be pasted on.
  await loadRepo(page, "renovate-org/backend-api");
  expect(seen).not.toContain(PROBE_URL);

  await pasteGlobalConfig(page, JSON.stringify({ inheritConfig: false }));
  await openRepoForm(page);
  // `inheritConfig: false` does not auto-check the box (only `true` does) — the
  // user has to opt into previewing what the layer WOULD hold.
  await expect(inheritCheckbox(page)).not.toBeChecked();
  await inheritCheckbox(page).check();

  await loadRepo(page);
  expect(seen).toContain(PROBE_URL);

  const inherited = await openLayerStage(page, "inherit");
  await expect(inherited).toHaveValue(INHERITED_CONFIG);
  const origin = page.locator(".layer-origin");
  await expect(origin).toBeVisible();
  await expect(origin).not.toContainText("editing makes it yours");
  const hint = page.locator(".layer-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("inheritConfig: false");
  await expect(hint).toContainText("would not apply this layer");
});

test("a link copied after an auto-load carries the layer as text and fetches nothing", async ({
  page,
}) => {
  const seen = await stubGithub(page, { [CONFIG_URL]: REPO_CONFIG, [PROBE_URL]: INHERITED_CONFIG });
  await startAtRepoForm(page);
  await inheritCheckbox(page).check();
  await loadRepo(page, "renovate-org/backend-api");
  await expect(await openLayerStage(page, "inherit")).toHaveValue(INHERITED_CONFIG);

  await page.locator(".app-header").getByRole("button", { name: "Share" }).click();
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("#config=");
  const url = page.url();

  await page.goto("about:blank");
  seen.length = 0;
  await page.goto(url);
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });

  // The layer arrives as content — as a PASTED layer, with no origin line and
  // without the link touching the platform API.
  await expect(await openLayerStage(page, "inherit")).toHaveValue(INHERITED_CONFIG);
  await expect(page.locator(".layer-origin")).toHaveCount(0);
  expect(seen).toEqual([]);
});
