/**
 * The aside trails a sentence that already said the count and its noun ("see
 * which of the 734 rules would apply (…)"), so it must neither repeat the
 * count nor interrupt the clause. These cover the three shapes: one source
 * covering everything (either a preset or your own config), and a genuine mix.
 */
import type { RuleAttribution } from "@renovate-config-debugger/engine";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it } from "vitest";
import { RuleFramingAside, RuleFramingText } from "./rule-framing";

afterEach(cleanup);

function repo(index: number): RuleAttribution {
  return { index, layer: { kind: "repo" }, sourceIndex: index };
}

function preset(index: number, name: string, sourceIndex: number): RuleAttribution {
  return { index, layer: { kind: "preset", nodeId: `n:${name}`, name }, sourceIndex };
}

/** The rendered text of one framing component, whitespace-normalized. */
function text(node: ReactElement): string {
  const { container } = render(node);
  return (container.textContent ?? "").replaceAll(/\s+/g, " ").trim();
}

it("says 'all' instead of repeating the count when one preset supplies every rule", () => {
  const attribution = [0, 1, 2].map((i) => preset(i, "config:recommended", i));
  expect(text(<RuleFramingAside total={3} attribution={attribution} />)).toBe(
    "(all pulled in by config:recommended)",
  );
});

it("says 'all' instead of repeating the count when every rule is your own", () => {
  const attribution = [0, 1, 2].map(repo);
  expect(text(<RuleFramingAside total={3} attribution={attribution} />)).toBe(
    "(all from your config)",
  );
});

it("keeps the numeric breakdown when own and preset rules are mixed", () => {
  const attribution = [
    repo(0),
    preset(1, "config:recommended", 0),
    preset(2, "config:recommended", 1),
  ];
  expect(text(<RuleFramingAside total={3} attribution={attribution} />)).toBe(
    "(1 from your config and 2 pulled in by config:recommended)",
  );
});

it("renders nothing without full attribution — the sentence stands alone", () => {
  expect(text(<RuleFramingAside total={3} attribution={null} />)).toBe("");
});

it("leaves the full clause's breakdown alone", () => {
  const attribution = [0, 1, 2].map((i) => preset(i, "config:recommended", i));
  expect(text(<RuleFramingText total={3} attribution={attribution} />)).toBe(
    "3 rules — 3 pulled in by config:recommended (indexed packageRules[0]–packageRules[2], as Renovate cites them)",
  );
});
