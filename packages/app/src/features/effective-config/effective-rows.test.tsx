import type {
  KeyProvenance,
  ProvenanceLayer,
  RuleAttribution,
} from "@renovate-config-debugger/engine";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { DataTableRow } from "@/components/data-table";
import { DECIDED_BY, type EffectiveRowContext, effectiveTableRows } from "./effective-rows";
import type { DeciderGroup, DeciderId } from "./decider-groups";
import {
  buildDescriptionLedger,
  DESCRIPTION_KEY,
  type DescriptionLedger,
} from "./description-ledger";
import { isOverridden } from "@/lib/effective-tally";
import { descriptionEntries, descriptionProvenance } from "@tools/test/description-provenance";
import { presetLayer, provEntry, provStep } from "@tools/test/key-provenance";

/**
 * Roadmap 092: the mapping from decided-by groups to the standard table's rows.
 * Every decision it makes — the value text, the note, the quick-filter flag, the
 * group head, and the two keys that are special-cased (`packageRules`,
 * `description`) — is exercised here over hand-built groups, where a chain shape
 * is a line of the test rather than something a real run has to be coaxed into
 * producing. `EffectiveConfig.shimmed.test.tsx` pays for a pipeline run and
 * covers what only a run can prove.
 */

const DEFAULTS: ProvenanceLayer = { kind: "defaults" };
const REPO: ProvenanceLayer = { kind: "repo" };
const RECOMMENDED: ProvenanceLayer = presetLayer("p1", "config:recommended");

const CONTEXT: EffectiveRowContext = { ruleAttribution: null, ledger: null, presetName: null };

/** The one row the mapping makes of one entry, decided by `id`. */
function rowFor(
  entry: KeyProvenance,
  id: DeciderId = "repo",
  context: Partial<EffectiveRowContext> = {},
): DataTableRow {
  const [row] = effectiveTableRows([{ id, entries: [entry] }], { ...CONTEXT, ...context });
  if (!row) {
    throw new Error(`no row for ${entry.key}`);
  }
  return row;
}

/** What a prepared node actually DRAWS — the only reason this suite renders. */
function textOf(node: ReactNode): string {
  return render(<div>{node}</div>).container.textContent ?? "";
}

describe("the value cell", () => {
  it("prints a scalar in full and a container as its size", () => {
    expect(rowFor(provEntry("automerge", [provStep(REPO, true)])).cells.value).toBe("true");
    expect(rowFor(provEntry("rangeStrategy", [provStep(REPO, "bump")])).cells.value).toBe('"bump"');
    expect(rowFor(provEntry("labels", [provStep(REPO, ["a", "b"])])).cells.value).toBe(
      "[ 2 items ]",
    );
    expect(rowFor(provEntry("hostRules", [provStep(REPO, { token: "x" })])).cells.value).toBe(
      "{ 1 key }",
    );
    // …and nothing richer than that text: only the two special rows draw a node.
    expect(rowFor(provEntry("automerge", [provStep(REPO, true)])).cellNodes?.value).toBeNull();
  });
});

describe("the packageRules row", () => {
  const RULES = [{ matchManagers: ["npm"] }, { matchManagers: ["docker"] }];
  const ATTRIBUTION: RuleAttribution[] = [
    { index: 0, layer: REPO, sourceIndex: 0 },
    { index: 1, layer: RECOMMENDED, sourceIndex: 0 },
  ];

  it("counts the rules and frames where they came from", () => {
    const row = rowFor(provEntry("packageRules", [provStep(REPO, RULES)]), "repo", {
      ruleAttribution: ATTRIBUTION,
    });

    // The string is the count — it is what the table's filter searches.
    expect(row.cells.value).toBe("2 rules");
    const framed = textOf(row.cellNodes?.value);
    expect(framed).toContain("1 from your config");
    expect(framed).toContain("1 pulled in by");
    expect(framed).toContain("config:recommended");
  });

  it("keeps the attribution off every other key", () => {
    // `entry.key` is what selects the branch: a `labels` row handed the same
    // context is an ordinary row, not one framed with somebody's rule counts.
    const row = rowFor(provEntry("labels", [provStep(REPO, ["a"])]), "repo", {
      ruleAttribution: ATTRIBUTION,
    });

    expect(row.cells.value).toBe("[ 1 item ]");
    expect(row.cellNodes?.value).toBeNull();
  });
});

describe("the description row", () => {
  function ledgerOf(value: string): DescriptionLedger {
    const ledger = buildDescriptionLedger(
      descriptionProvenance({
        entries: descriptionEntries([
          { value, via: RECOMMENDED, node: "p1", nodeName: "config:recommended" },
        ]),
      }),
    );
    if (!ledger) {
      throw new Error("expected a ledger, got null");
    }
    return ledger;
  }

  it("takes its value and its note from the ledger", () => {
    const row = rowFor(
      provEntry(DESCRIPTION_KEY, [provStep(RECOMMENDED, ["Hello."], { action: "concat" })]),
      "preset",
      { ledger: ledgerOf("Hello.") },
    );

    expect(row.cells.value).toBe('1 string — "Hello."');
    expect(row.cells.note).toBe("1 preset wrote these");
  });

  it("is the only key the ledger reaches", () => {
    const row = rowFor(provEntry("labels", [provStep(RECOMMENDED, ["Hello."])]), "preset", {
      ledger: ledgerOf("Hello."),
    });

    expect(row.cells.value).toBe("[ 1 item ]");
    expect(row.cells.note).toBe("");
  });
});

describe("the note cell", () => {
  it("says nothing about a key one layer simply set", () => {
    const row = rowFor(provEntry("labels", [provStep(REPO, ["a"])]));

    expect(row.cells.note).toBe("");
    expect(row.cellNodes?.note).toBeNull();
  });

  it("draws the note the row-notes rule wrote, warn tone included", () => {
    const repeated = provEntry("dependencyDashboard", [
      provStep(RECOMMENDED, true),
      provStep(REPO, true, { action: "overwrite", before: true }),
    ]);
    const row = rowFor(repeated);

    expect(row.cells.note).toBe("also set by config:recommended — same value");
    const view = render(<div>{row.cellNodes?.note}</div>);
    expect(view.container.querySelector(".prov-row-note")?.className).toContain("warn");
  });
});

describe("the quick filter flag", () => {
  it("is exactly the row's overridden-ness", () => {
    const overridden = provEntry("labels", [
      provStep(RECOMMENDED, ["a"]),
      provStep(REPO, ["b"], { action: "overwrite", before: ["a"] }),
    ]);
    expect(isOverridden(overridden)).toBe(true);
    expect(rowFor(overridden).qf).toBe(true);

    const once = provEntry("labels", [provStep(REPO, ["a"])]);
    expect(rowFor(once).qf).toBe(false);
    // A defaults row is the one the filter exists to drop.
    expect(rowFor(provEntry("rangeStrategy", [provStep(DEFAULTS, "auto")]), "defaults").qf).toBe(
      false,
    );
  });
});

describe("the group head", () => {
  it("heads a row with its layer's prose title and its one toned pill", () => {
    expect(rowFor(provEntry("labels", [provStep(REPO, ["a"])])).groups[DECIDED_BY]).toEqual({
      title: "Your repo config",
      // Prose, not a path: the title wants the UI font (082/092).
      plainTitle: true,
      pills: [{ label: "repo config", tone: "accent" }],
    });
  });

  it("names the presets group after the run's own extends, and no other group", () => {
    const entry = provEntry("dependencyDashboard", [provStep(RECOMMENDED, true)]);
    const named = { presetName: "config:recommended" };

    expect(rowFor(entry, "preset", named).groups[DECIDED_BY]?.title).toBe("config:recommended");
    expect(rowFor(entry, "preset").groups[DECIDED_BY]?.title).toBe("Presets");
    expect(rowFor(entry, "defaults", named).groups[DECIDED_BY]?.title).toBe("Renovate defaults");
  });
});

describe("the decided-by cell", () => {
  it("names the SPECIFIC layer that won, where the group header names the level", () => {
    const preset = provEntry("dependencyDashboard", [
      provStep(DEFAULTS, false),
      provStep(RECOMMENDED, true),
    ]);
    expect(rowFor(preset, "preset").cells.decider).toBe("config:recommended");
    expect(rowFor(provEntry("labels", [provStep(REPO, ["a"])])).cells.decider).toBe("repo config");
    expect(
      rowFor(provEntry("rangeStrategy", [provStep(DEFAULTS, "auto")]), "defaults").cells.decider,
    ).toBe("default");
    // No chain at all still answers, rather than rendering an empty cell.
    expect(rowFor(provEntry("labels", [])).cells.decider).toBe("default");
  });
});

describe("the row itself", () => {
  it("is keyed and led by the option name, with the body deferred to the detail block", () => {
    const row = rowFor(provEntry("labels", [provStep(REPO, ["a"])]));

    // The key is the option name — stable across runs, unlike the per-run node
    // ids in the chain, so an open row survives the next keystroke's rebuild.
    expect(row.key).toBe("labels");
    expect(row.lead).toBe("labels");
    expect(textOf(row.leadNode)).toBe("labels");
    // The cascade is the detail block; the definition list stays empty.
    expect(row.fields).toEqual([]);
    expect(row.detail).toBeDefined();
  });

  it("emits every group's rows in the order the grouping produced them", () => {
    const groups: DeciderGroup[] = [
      {
        id: "repo",
        entries: [
          provEntry("labels", [provStep(REPO, ["a"])]),
          provEntry("automerge", [provStep(REPO, true)]),
        ],
      },
      { id: "defaults", entries: [provEntry("rangeStrategy", [provStep(DEFAULTS, "auto")])] },
    ];

    const rows = effectiveTableRows(groups, CONTEXT);
    expect(rows.map((row) => row.key)).toEqual(["labels", "automerge", "rangeStrategy"]);
    expect(rows.map((row) => row.groups[DECIDED_BY]?.title)).toEqual([
      "Your repo config",
      "Your repo config",
      "Renovate defaults",
    ]);
  });
});
