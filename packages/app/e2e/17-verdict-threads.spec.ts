import { expect, type Locator, type Page, test } from "@playwright/test";
import { CONTESTED_KEY_CONFIG, encodeShareFragment } from "./fixtures";
import { drawer, openTab, simulateFromLink } from "./helpers";

/** The `npm dependency` quick-fill's own fields — what a share link has to
 *  carry to reproduce a run this suite otherwise starts by clicking. */
const NPM_QUICK_FILL: Record<string, string> = {
  manager: "npm",
  datasource: "npm",
  packageFile: "package.json",
  packageName: "lodash",
  depType: "dependencies",
  currentValue: "4.17.20",
  newValue: "4.17.21",
  updateType: "patch",
};

/** Opens the contested config, runs the lodash quick-fill, and waits for the
 *  verdict card the threads live on. Named because four tests start here; the
 *  steps themselves are the shared preamble. */
async function runContestedSimulation(page: Page): Promise<void> {
  await simulateFromLink(page, CONTESTED_KEY_CONFIG);
}

/** A thread's head button — addressed by the id the app gives it (`use-thread-nav`
 *  builds the same id for a deep link's scroll target), so no thread can be
 *  confused with another whose value happens to mention its key. */
function threadHead(page: Page, key: string): Locator {
  return page.locator(`#sim-thread-${key}`);
}

/** The thread row for one changed setting, by its key. */
function thread(page: Page, key: string): Locator {
  return page.locator(".sim-thread", { has: threadHead(page, key) });
}

/** Expands a thread and hands back its body. */
async function expandThread(page: Page, key: string): Promise<Locator> {
  const head = threadHead(page, key);
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  return thread(page, key).locator(".sim-thread-body");
}

/**
 * Roadmap 054 — the thread answers "who set this, and what did they beat?" in
 * one place. Collapsed, the row still says two rules wrote the key; expanded,
 * the winner writes first with its clause evidence in aligned columns, and the
 * value it overrode is struck through under the rule that wrote it.
 */
test("expanding a contested thread names its winner, its clause evidence and the value it struck out", async ({
  page,
}) => {
  await runContestedSimulation(page);

  // Collapsed, the contested row already says the key had more than one writer
  // — the 046 ledger's blind spot, and the reason to open this row first.
  const row = thread(page, "groupName");
  await expect(row.locator(".sim-thread-writers")).toHaveText("2 writers");
  await expect(row.locator(".sim-thread-final")).toHaveText('"lodash updates"');

  const body = await expandThread(page, "groupName");

  // The winner line: the verb carries the merge semantics, and the reference is
  // the LAST rule to write the key.
  const writer = body.locator(".sim-thread-line").first();
  await expect(writer).toContainText("set by");
  await expect(writer).toContainText("packageRules[2]");

  // Its clause evidence, as the aligned grid — one row per matcher, each
  // stating what it checks and what this update actually is.
  const clauses = body.locator(".sim-clause-grid .sim-clause-row");
  await expect(clauses).toHaveCount(2);
  await expect(clauses.filter({ hasText: "matchPackageNames" })).toContainText("lodash");
  await expect(clauses.filter({ hasText: "matchUpdateTypes" })).toContainText("patch");

  // The cascade: the beaten value, struck through, under the rule that wrote
  // it. Layer 7: a beaten value is a write like any other, so it is the shared
  // `.sim-write-row` — `⊘ key  <struck value> · written by …`.
  const lostLine = body.locator(".sim-write-row", { hasText: "written by" });
  await expect(lostLine).toContainText("packageRules[0]");
  await expect(lostLine.locator(".sim-write-mark")).toHaveText("⊘");
  const overridden = lostLine.locator(".sim-merged-before");
  await expect(overridden).toHaveText('"all npm dependencies"');
  await expect(overridden).toHaveCSS("text-decoration-line", "line-through");

  // …and it terminates in the value the key held before any rule ran — here
  // Renovate's own `groupName: null`.
  await expect(body.locator(".sim-write-row", { hasText: "before any rule" })).toContainText(
    "null",
  );

  // An UNCONTESTED key's thread has no lost writer at all — same disclosure,
  // same terminating base line, no manufactured override.
  const automerge = await expandThread(page, "automerge");
  await expect(automerge.locator(".sim-thread-line").first()).toContainText("packageRules[2]");
  await expect(automerge.locator(".sim-write-row", { hasText: "written by" })).toHaveCount(0);
  await expect(automerge.locator(".sim-write-row", { hasText: "before any rule" })).toContainText(
    "false",
  );
});

/**
 * Roadmap 054 layer 3 — the second (and last) disclosure level. A thread names
 * the rule whose value it beat; that reference opens the losing rule's own
 * card, which answers the only question the thread leaves open about it: what
 * ELSE did it do? The card is navigation-free, so it light-dismisses and hands
 * focus straight back to the reference that opened it.
 */
test("the losing writer's reference opens its evidence card, and Escape gives focus back", async ({
  page,
}) => {
  await runContestedSimulation(page);
  const body = await expandThread(page, "groupName");

  const anchor = body.getByRole("button", { name: "packageRules[0]" });
  await expect(anchor).toHaveAttribute("aria-expanded", "false");
  await anchor.click();

  const card = page.getByRole("dialog", { name: "packageRules[0] — rule evidence" });
  await expect(card).toBeVisible();

  // The losing rule's own clause evidence, in the same aligned grid the thread
  // uses — one grammar for evidence, wherever it is read.
  await expect(card.locator(".sim-clause-grid .sim-clause-row")).toHaveCount(1);
  await expect(card.locator(".sim-clause-row")).toContainText("matchManagers");

  // The digest: this rule wrote two keys, one of which survived.
  await expect(card.locator(".sim-rule-pop-line")).toContainText("merged in step 1 of 2");
  await expect(card.locator(".sim-rule-pop-line")).toContainText("2 writes, 1 survived");

  // The write the thread came from, struck through and naming the stop that
  // took it; and the write that survived, plain.
  const lost = card.locator(".sim-write-row", { hasText: "groupName" });
  await expect(lost.locator(".sim-merged-after")).toHaveClass(/overridden/);
  await expect(lost).toContainText("overridden in step 2 of 2");
  const survived = card.locator(".sim-write-row", { hasText: "addLabels" });
  await expect(survived.locator(".sim-merged-after")).not.toHaveClass(/overridden/);
  await expect(survived).toContainText("from-managers-rule");

  // Layer 7: the evidence surfaces export like the drawer they demoted — the
  // digest is copyable as markdown, and its keys carry the option-docs hook.
  await expect(card.getByRole("button", { name: "Copy as markdown" })).toBeVisible();
  await expect(card.locator(".sim-write-key .opt-key").first()).toBeVisible();

  // Light dismiss: Escape closes, and focus is back on the reference — the card
  // took it on open, so the reader is where they left off, not at the top.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(anchor).toBeFocused();
  await expect(anchor).toHaveAttribute("aria-expanded", "false");
});

/**
 * Roadmap 054 layer 3 — the card's one link out. "open in matched rules →" is
 * navigation, not a third fold: it opens the (demoted) rules drawer and lands
 * on that rule's row through the 013 focus wiring, closing the card behind it.
 */
test("the evidence card's matched-rules link opens the drawer on that rule's row", async ({
  page,
}) => {
  await runContestedSimulation(page);
  const body = await expandThread(page, "groupName");

  const rulesDrawer = drawer(page, "Matched rules");
  await expect(rulesDrawer).toHaveJSProperty("open", false);

  await body.getByRole("button", { name: "packageRules[0]" }).click();
  const card = page.getByRole("dialog", { name: "packageRules[0] — rule evidence" });
  await card.getByRole("button", { name: "open in matched rules →" }).click();

  // The card is gone, the drawer it targeted is open, and the row is there.
  await expect(card).toHaveCount(0);
  await expect(rulesDrawer).toHaveJSProperty("open", true);
  // Spelled out on purpose: `ruleRowId` produces this, and an e2e that imported
  // it would agree with a rename instead of catching one.
  const row = page.locator("#sim-rule-0");
  await expect(row).toBeVisible();
  await expect(row).toContainText("matchManagers");
});

/**
 * Roadmap 054 layer 4 — the way back. A thread's own jumps land the reader
 * somewhere the thread is off-screen, so both leave a pill naming it. The pill
 * re-expands that thread, flashes it, and then has nothing left to say.
 */
test("a thread's step jump leaves a return pill that re-expands and flashes the thread", async ({
  page,
}) => {
  await runContestedSimulation(page);
  const body = await expandThread(page, "groupName");

  const mergeDrawer = drawer(page, "How the final config was built");
  await expect(mergeDrawer).toHaveJSProperty("open", false);
  await expect(page.locator(".sim-return-pill")).toHaveCount(0);

  // The winner merged at the second rule stop, so that is where the replay opens.
  const stepLink = body.locator(".sim-step-link");
  await expect(stepLink).toContainText("step 2 of 2");
  await stepLink.click();
  await expect(mergeDrawer).toHaveJSProperty("open", true);
  await expect(page.locator(".sim-merge-stop", { hasText: "Step 2 of 2" })).toBeInViewport();

  // The pill names the thread the reader left, by key.
  const pill = page.locator(".sim-return-pill");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("groupName");

  // Collapsing the thread from down here proves the return does more than
  // scroll: it puts the reader back INSIDE the story they walked away from.
  const head = threadHead(page, "groupName");
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");

  await pill.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await expect(head).toHaveClass(/rcd-flash/);
  // Ephemeral: it answered the jump it was created for.
  await expect(pill).toHaveCount(0);
  // And the jump it undid stays undone — the drawer the reader opened is still
  // open, with the stop they were sent to inside it.
  await expect(mergeDrawer).toHaveJSProperty("open", true);
});

/**
 * Roadmap 054 layer 4 — a link says where to look. `simThread` (the expanded
 * key) rides the sim descriptor beside `autoSimulate`, and opening the link
 * reproduces the run with the thread already open — no clicking, no scrolling
 * to find what the sender meant.
 *
 * Roadmap 094: the link here still carries a `simStep`, deliberately. It is the
 * decode-and-ignore half of the contract — an old link must load, restore its
 * thread, and leave the replay drawer exactly as a link without one would.
 */
test("a share link carrying a thread restores it, and an old simStep is ignored", async ({
  page,
}) => {
  const fragment = await encodeShareFragment({
    config: CONTESTED_KEY_CONFIG,
    view: { tab: "tests", simStep: 2 },
    sim: { form: NPM_QUICK_FILL, autoSimulate: true, simThread: "groupName" },
  });
  await page.goto(fragment);

  await openTab(page, "tests");
  const verdict = page.locator(".sim-verdict-block");
  await expect(verdict).toBeVisible({ timeout: 30_000 });

  // The link's thread arrives EXPANDED, with its cascade already on screen —
  // the run's own reset can neither fold it nor race it.
  const row = thread(page, "groupName");
  await expect(threadHead(page, "groupName")).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator(".sim-write-row", { hasText: "written by" })).toContainText(
    '"all npm dependencies"',
  );

  // Every other thread is collapsed: the link carries one question, not a state
  // dump of the sender's screen.
  await expect(verdict.locator(".sim-thread.open")).toHaveCount(1);

  // The `simStep` the link carries restores nothing: the drawer it used to
  // open for is closed, and the whole stop list is behind it, one click away.
  const mergeDrawer = drawer(page, "How the final config was built");
  await expect(mergeDrawer).toHaveJSProperty("open", false);
  await mergeDrawer.getByText("How the final config was built").click();
  await expect(page.locator(".sim-merge-stop", { hasText: "Step 2 of 2" })).toContainText(
    "packageRules[2]",
  );

  // The pill is not link state: nobody jumped anywhere.
  await expect(page.locator(".sim-return-pill")).toHaveCount(0);
});
