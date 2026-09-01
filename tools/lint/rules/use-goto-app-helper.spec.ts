import { ruleTester } from "../rule-tester.ts";
import rule from "./use-goto-app-helper.ts";

/** Every case is a spec-file body: the preamble only exists inside a test. */
function inTest(body: string): string {
  return `test("t", async ({ page }) => {\n${body}\n});`;
}

ruleTester.run("use-goto-app-helper", rule, {
  valid: [
    // already using the helper
    inTest("  await gotoAppAtDefaultConfig(page);"),
    // ---- each of these is a real site in packages/app/e2e ----
    // a share-fragment landing: the app does not come up at the default config,
    // so the helper cannot serve it (01, 04, 10, 17, 21).
    inTest(
      '  await page.goto("#config=abc");\n' +
        '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
    ),
    // an `about:blank` round-trip (11, 14)
    inTest(
      '  await page.goto("about:blank");\n' +
        '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
    ),
    // the same assertion as a REVERT check — no goto anywhere near it (12:213)
    inTest(
      "  await revert.click();\n" +
        "  await expect(revert).toHaveCount(0);\n" +
        '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
    ),
    // a resolved-config document assertion deep inside a test (15:59)
    inTest(
      "  await expect(doc).toContainText('\"extends\"');\n" +
        '  await expect(doc).toContainText("config:recommended");',
    ),
    // re-navigation, not navigation: `reload()` + the same wait (13:61-62).
    // Correct, since the helper navigates and cannot serve a reload.
    inTest(
      "  await page.reload();\n" +
        '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
    ),
    // a different marker: goto("/") then `$schema` (09:15-18)
    inTest(
      '  await page.goto("/");\n' +
        '  await expect(page.locator(".cm-content")).toContainText("$schema");',
    ),
    // the ~60 bare landings that drive a run instead — they wait through
    // `runAndAwaitResult`, which the helper's docstring names as the case that
    // does NOT need this wait.
    inTest('  await page.goto("/");\n  await runAndAwaitResult(page);'),
    // stated false negative: the marker hidden behind a constant (10:22).
    inTest(
      '  await page.goto("/");\n' +
        '  await expect(page.locator(".cm-content")).toContainText(DEFAULT_CONFIG_MARKER);',
    ),
    // beyond the window: four statements later is no longer a preamble
    inTest(
      '  await page.goto("/");\n' +
        "  await a();\n" +
        "  await b();\n" +
        "  await c();\n" +
        '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
    ),
    // a computed callee is not the `page.goto` shape
    inTest(
      '  await page["goto"]("/");\n' +
        '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
    ),
    // options make it a different navigation than the helper's
    inTest(
      '  await page.goto("/", { waitUntil: "commit" });\n' +
        '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
    ),
  ],
  invalid: [
    // 02-share-running.spec.ts:23-25 — adjacent, in a file that already imports
    // the helper.
    {
      code: inTest(
        '  await page.goto("/");\n' +
          '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
      ),
      errors: [{ messageId: "useGotoAppHelper" }],
    },
    // 12-layout-regressions.spec.ts:227-229 — a named locator sits between the
    // two, and the assertion is on the variable.
    {
      code: inTest(
        '  await page.goto("/");\n' +
          '  const editor = page.locator(".cm-content");\n' +
          '  await expect(editor).toContainText("config:recommended");',
      ),
      errors: [{ messageId: "useGotoAppHelper" }],
    },
    // the full three-statement window
    {
      code: inTest(
        '  await page.goto("/");\n' +
          "  const editor = page.locator('.cm-content');\n" +
          "  page.on('dialog', reject);\n" +
          '  await expect(editor).toContainText("config:recommended");',
      ),
      errors: [{ messageId: "useGotoAppHelper" }],
    },
    // unawaited spelling of either half
    {
      code: inTest(
        '  page.goto("/");\n' +
          '  expect(page.locator(".cm-content")).toContainText("config:recommended");',
      ),
      errors: [{ messageId: "useGotoAppHelper" }],
    },
    // a second landing closes the first one's window: only the goto the wait
    // actually belongs to is reported.
    {
      code: inTest(
        '  await page.goto("/");\n' +
          "  await setEditorContent(page, CONFIG);\n" +
          '  await page.goto("/");\n' +
          '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
      ),
      errors: [{ messageId: "useGotoAppHelper" }],
    },
    // two copies in one test body are two reports
    {
      code: inTest(
        '  await page.goto("/");\n' +
          '  await expect(page.locator(".cm-content")).toContainText("config:recommended");\n' +
          "  await openSessionMenu(page);\n" +
          '  await page.goto("/");\n' +
          '  await expect(page.locator(".cm-content")).toContainText("config:recommended");',
      ),
      errors: [{ messageId: "useGotoAppHelper" }, { messageId: "useGotoAppHelper" }],
    },
  ],
});
