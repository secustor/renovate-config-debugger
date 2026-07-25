import { expect, type Page, test } from "@playwright/test";
import {
  configChecksum,
  encodeRawShareToken,
  encodeShareFragment,
  encodeShareToken,
  garbleShareToken,
  PACKAGE_RULES_CONFIG,
  RENOVATE_VERSION,
  truncateShareToken,
} from "./fixtures";
import { resultsPanel, runButton } from "./helpers";

/**
 * Roadmap 027 — share-link failure diagnostics. A `#config=` token that can't
 * be decoded must surface a prominent, unmissable banner (not the small
 * dismissable notice), tailored to the failure mode, and must never leave the
 * app silently sitting on the default config as if nothing was opened.
 */

const banner = ".share-error-banner";
const DEFAULT_CONFIG_MARKER = "config:recommended";

test("a truncated token surfaces the cut-off banner", async ({ page }) => {
  const token = await encodeShareToken({ config: PACKAGE_RULES_CONFIG });
  await page.goto(`#config=${truncateShareToken(token)}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/cut off/i);
  await expect(page.locator(banner)).toContainText(/whole URL was copied/i);
});

test("a garbled token surfaces the damaged-link banner", async ({ page }) => {
  const token = await encodeShareToken({ config: PACKAGE_RULES_CONFIG });
  await page.goto(`#config=${garbleShareToken(token)}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/damaged/i);
});

test("a valid pre-027 token without the integrity field still loads and runs", async ({ page }) => {
  const fragment = await encodeShareFragment(
    { config: PACKAGE_RULES_CONFIG },
    { integrity: false },
  );
  await page.goto(fragment);

  // Decodes, auto-runs, and shows no error banner — backward compat holds.
  await expect(page.locator(".cm-content")).toContainText("matchPackageNames", {
    timeout: 15_000,
  });
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(banner)).toHaveCount(0);
});

test("a broken token never leaves the app silently on the default config", async ({ page }) => {
  const token = await encodeShareToken({ config: PACKAGE_RULES_CONFIG });
  await page.goto(`#config=${truncateShareToken(token)}`);

  // The banner is shown (the failure is announced, not silent) ...
  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  // ... while the app falls back to the default config without auto-running a
  // pipeline off a config the sender never actually shared.
  await expect(page.locator(".cm-content")).toContainText(DEFAULT_CONFIG_MARKER);
  await expect(resultsPanel(page)).toHaveCount(0);
});

/**
 * Roadmap 030 — a payload that decodes cleanly (valid base64/deflate/JSON,
 * a known version, a string `config`) but fails the new field-level schema
 * maps onto the SAME "damaged" reason as a garbled token: the version is
 * already known-good at that point, so a schema failure is transit/tamper
 * damage, not a future-version payload. Built with `encodeRawShareToken`
 * since these fields (a `__proto__` own key, a `javascript:` endpoint) are
 * not expressible through the normal fixture builder — see its doc comment.
 */
test("a payload with a prototype-polluted globalConfig shows the damaged banner", async ({
  page,
}) => {
  const config = PACKAGE_RULES_CONFIG;
  const json =
    `{"v":2,"renovate":${JSON.stringify(RENOVATE_VERSION)},"config":${JSON.stringify(config)},` +
    `"fileName":"renovate.json","c":${JSON.stringify(configChecksum(config))},` +
    `"globalConfig":{"__proto__":{"pwned":true},"platform":"gitlab"}}`;
  const token = await encodeRawShareToken(json);
  await page.goto(`#config=${token}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/damaged/i);
  await expect(page.locator(".cm-content")).toContainText(DEFAULT_CONFIG_MARKER);
  await expect(resultsPanel(page)).toHaveCount(0);
});

test("a link with a javascript: endpoint is refused (damaged banner)", async ({ page }) => {
  const config = PACKAGE_RULES_CONFIG;
  const json =
    `{"v":2,"renovate":${JSON.stringify(RENOVATE_VERSION)},"config":${JSON.stringify(config)},` +
    `"fileName":"renovate.json","c":${JSON.stringify(configChecksum(config))},` +
    `"endpoint":"javascript:alert(1)"}`;
  const token = await encodeRawShareToken(json);
  await page.goto(`#config=${token}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/damaged/i);
  // Refused outright — never auto-runs a pipeline carrying the bad endpoint.
  await expect(resultsPanel(page)).toHaveCount(0);
});

/**
 * Security 2026-07-25 — a share link is attacker-controlled data that auto-runs
 * on open, and the endpoint it carries selects the host every `local>` preset
 * fetch (with the user's token attached) is sent to. A link naming anything
 * other than the shipped public hosts must: still load (transparency), run with
 * every credential withheld, say so in an unmissable banner, and NOT rewrite
 * the persistent platform settings. A trusted link keeps behaving as before.
 *
 * All outgoing requests are intercepted — no external host is ever contacted.
 */

const warningBanner = ".share-warning-banner";
const reminderChip = ".untrusted-endpoint-chip";
const UNTRUSTED_ENDPOINT = "https://untrusted.example/";
const LEAK_CANARY = "pat-must-not-leak";
/** Resolves `local>` against whatever endpoint is in force — the shape that
 *  actually reaches out, so an interception can observe the headers. */
const LOCAL_PRESET_CONFIG = '{"extends": ["local>acme/renovate-config"]}';

/** A payload with an arbitrary top-level endpoint. `encodeShareToken` cannot
 *  express one (it drops anything equal to the default and has no globalConfig
 *  support), so the JSON is built by hand — same reason as the fixtures above. */
function rawPayloadJson(config: string, extra: Record<string, unknown>): string {
  return JSON.stringify({
    v: 2,
    renovate: RENOVATE_VERSION,
    config,
    fileName: "renovate.json",
    c: configChecksum(config),
    ...extra,
  });
}

/** Seeds a GitHub PAT into sessionStorage exactly where run.ts reads it. */
async function seedToken(page: Page): Promise<void> {
  await page.addInitScript((canary) => {
    sessionStorage.setItem("rcv.githubToken", canary);
  }, LEAK_CANARY);
}

/** Intercepts every request to `origin`, recording the authorization header,
 *  and answers 404 with CORS allowed so the run finishes deterministically
 *  (a missing preset is a contained preset error — the pipeline still runs). */
async function interceptOrigin(
  page: Page,
  glob: string,
): Promise<{ url: string; authorization?: string }[]> {
  const seen: { url: string; authorization?: string }[] = [];
  await page.route(glob, async (route) => {
    const headers = route.request().headers();
    seen.push({ url: route.request().url(), authorization: headers["authorization"] });
    await route.fulfill({
      status: 404,
      headers: { "access-control-allow-origin": "*" },
      body: "not found",
    });
  });
  return seen;
}

test("an untrusted endpoint warns, keeps the config, and is not persisted", async ({ page }) => {
  const json = rawPayloadJson(PACKAGE_RULES_CONFIG, { endpoint: UNTRUSTED_ENDPOINT });
  await page.goto(`#config=${await encodeRawShareToken(json)}`);

  // Announced, naming the host and what was withheld …
  await expect(page.locator(warningBanner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(warningBanner)).toContainText("untrusted.example");
  await expect(page.locator(warningBanner)).toContainText(/without your github sign-in/i);
  // … not the "damaged" banner (the link is readable, just not trusted) …
  await expect(page.locator(banner).filter({ hasText: /damaged|cut off/i })).toHaveCount(0);
  // … the config is still loaded and the run still completes …
  await expect(page.locator(".cm-content")).toContainText("matchPackageNames");
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  // … and nothing about the link outlives the tab.
  const stored = await page.evaluate(() => ({
    platform: localStorage.getItem("rcv.platform"),
    endpoint: localStorage.getItem("rcv.endpoint"),
  }));
  expect(stored.endpoint).toBeNull();
  expect(stored.platform).toBeNull();
});

test("'Continue without tokens' collapses the banner but keeps the reminder", async ({ page }) => {
  const json = rawPayloadJson(PACKAGE_RULES_CONFIG, { endpoint: UNTRUSTED_ENDPOINT });
  await page.goto(`#config=${await encodeRawShareToken(json)}`);
  await expect(page.locator(warningBanner)).toBeVisible({ timeout: 15_000 });

  await page.locator(".share-warning-ack").click();

  // The banner goes, the protection does not: a standing reminder naming the
  // host stays beside Run, and it still offers the opt-in.
  await expect(page.locator(warningBanner)).toHaveCount(0);
  await expect(page.locator(reminderChip)).toBeVisible();
  await expect(page.locator(reminderChip)).toContainText("untrusted.example");
  await expect(page.locator(reminderChip)).toContainText(/without tokens/i);
  await expect(page.locator(".untrusted-endpoint-allow")).toBeVisible();
});

test("hand-editing the endpoint ends the guard", async ({ page }) => {
  const json = rawPayloadJson(PACKAGE_RULES_CONFIG, { endpoint: UNTRUSTED_ENDPOINT });
  await page.goto(`#config=${await encodeRawShareToken(json)}`);
  await expect(page.locator(warningBanner)).toBeVisible({ timeout: 15_000 });

  // The link forced Advanced options open, so the field is right there.
  await page.getByLabel("Endpoint").fill("https://api.github.com");

  await expect(page.locator(warningBanner)).toHaveCount(0);
  await expect(page.locator(reminderChip)).toHaveCount(0);
});

test("a link's globalConfig endpoint is caught too (it wins over the top-level one)", async ({
  page,
}) => {
  const json = rawPayloadJson(PACKAGE_RULES_CONFIG, {
    endpoint: "https://api.github.com",
    globalConfig: { endpoint: UNTRUSTED_ENDPOINT },
  });
  await page.goto(`#config=${await encodeRawShareToken(json)}`);

  await expect(page.locator(warningBanner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(warningBanner)).toContainText("untrusted.example");
  // The endpoint is visible for review rather than hidden — Advanced options
  // is opened by the link, showing the global layer that carries it.
  await expect(page.locator("details.advanced-zone")).toHaveAttribute("open", "");
  const storedEndpoint = await page.evaluate(() => localStorage.getItem("rcv.endpoint"));
  expect(storedEndpoint).toBeNull();
});

test("no token reaches an untrusted endpoint — not on the auto-run, not on a manual Run", async ({
  page,
}) => {
  await seedToken(page);
  const seen = await interceptOrigin(page, "https://untrusted.example/**");
  const json = rawPayloadJson(LOCAL_PRESET_CONFIG, { endpoint: UNTRUSTED_ENDPOINT });
  await page.goto(`#config=${await encodeRawShareToken(json)}`);

  await expect(page.locator(warningBanner)).toBeVisible({ timeout: 15_000 });
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  // The host WAS contacted (so the assertion is not vacuous) ...
  expect(seen.length).toBeGreaterThan(0);
  const afterAutoRun = seen.length;

  // ... and the protection is not one click deep: acknowledging the banner and
  // pressing Run — the phishing path — still sends nothing.
  await page.locator(".share-warning-ack").click();
  await runButton(page).click();
  await expect.poll(() => seen.length, { timeout: 30_000 }).toBeGreaterThan(afterAutoRun);
  await expect(runButton(page)).toHaveText("Run");

  for (const request of seen) {
    expect(request.authorization).toBeUndefined();
  }
});

test("'Use my tokens with <host>' opts in explicitly: header sent, settings persisted", async ({
  page,
}) => {
  await seedToken(page);
  const seen = await interceptOrigin(page, "https://untrusted.example/**");
  const json = rawPayloadJson(LOCAL_PRESET_CONFIG, { endpoint: UNTRUSTED_ENDPOINT });
  await page.goto(`#config=${await encodeRawShareToken(json)}`);

  await expect(page.locator(warningBanner)).toBeVisible({ timeout: 15_000 });
  // Wait out the link's own (suppressed) auto-run first, so what is counted
  // below is only what the opt-in produced.
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  // The opt-in names the host, so the choice is informed.
  const optIn = page.locator(".share-warning-trust");
  await expect(optIn).toContainText(UNTRUSTED_ENDPOINT);
  const beforeOptIn = seen.length;
  await optIn.click();

  // Banner and reminder both go — the guard is over.
  await expect(page.locator(warningBanner)).toHaveCount(0);
  await expect(page.locator(reminderChip)).toHaveCount(0);

  await runButton(page).click();
  await expect.poll(() => seen.length, { timeout: 30_000 }).toBeGreaterThan(beforeOptIn);
  await expect(runButton(page)).toHaveText("Run");
  for (const request of seen.slice(beforeOptIn)) {
    expect(request.authorization).toBe(`Bearer ${LEAK_CANARY}`);
  }
  // Treated like a hand-typed endpoint from here on, storage included.
  const stored = await page.evaluate(() => localStorage.getItem("rcv.endpoint"));
  expect(stored).toBe(UNTRUSTED_ENDPOINT);
});

test("a trusted endpoint keeps today's behavior: tokens sent, settings persisted", async ({
  page,
}) => {
  await seedToken(page);
  const seen = await interceptOrigin(page, "https://api.github.com/**");
  await page.goto(await encodeShareFragment({ config: LOCAL_PRESET_CONFIG, platform: "github" }));

  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(warningBanner)).toHaveCount(0);
  expect(seen.length).toBeGreaterThan(0);
  // The control for the test above: the PAT really is wired up, so "no
  // authorization header" there is suppression, not a broken fixture.
  expect(seen[0]?.authorization).toBe(`Bearer ${LEAK_CANARY}`);
  const stored = await page.evaluate(() => localStorage.getItem("rcv.endpoint"));
  expect(stored).toBe("https://api.github.com");
});

test("a trusted non-default host (gitea) still persists and does not warn", async ({ page }) => {
  await page.goto(
    await encodeShareFragment({
      config: PACKAGE_RULES_CONFIG,
      platform: "gitea",
      endpoint: "https://gitea.com",
    }),
  );

  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(warningBanner)).toHaveCount(0);
  const stored = await page.evaluate(() => ({
    platform: localStorage.getItem("rcv.platform"),
    endpoint: localStorage.getItem("rcv.endpoint"),
  }));
  expect(stored).toEqual({ platform: "gitea", endpoint: "https://gitea.com" });
});
