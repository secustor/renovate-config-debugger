/**
 * Roadmap 094: the cards over Renovate's OWN matcher — the two traps the
 * design was drawn around, said in the card's own words: a `**quay.io/**`
 * glob that never matches a registry URL (with the rewrite upstream accepts),
 * and a negative entry blocking a positive hit.
 */
import { render, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { EMPTY_REPO_DEPS } from "./repo-deps";
import { PatternTests } from "./PatternTests";

const RESULT = { finalConfig: {} } as unknown as TraceResult;

it("explains a miss and a block in upstream's terms", async () => {
  const view = render(
    <PatternTests
      tests={[
        {
          id: "pattern-1",
          option: "matchRegistryUrls",
          patterns: ["**quay.io/**"],
          inputs: [
            { value: "https://quay.io", expect: true },
            { value: "https://index.docker.io", expect: false },
          ],
        },
      ]}
      seedSources={{ pins: [], repoDeps: EMPTY_REPO_DEPS, result: RESULT }}
      onAdd={() => null}
      onUpdate={() => undefined}
      onRemove={() => undefined}
    />,
  );
  // The engine chunk's first load under the shimmed graph takes seconds.
  await waitFor(
    () => expect(view.container.querySelector(".pin-summary")?.textContent).toBe("1 of 2 expected"),
    { timeout: 120_000 },
  );
  view.getByRole("button", { name: /Expand the pattern test/ }).click();
  await waitFor(() => expect(view.getByText("no match — try **/quay.io{/,}**")).toBeDefined());
  expect(view.container.querySelector(".pattern-row-dead")).not.toBeNull();
  expect(
    [...view.container.querySelectorAll(".pattern-chips .pill")].map((el) => el.textContent),
  ).toEqual(["glob", "Aa ignored"]);
});
