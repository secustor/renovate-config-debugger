import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { traceResult } from "@tools/test/trace-result";
import { RunViewContext, type RunView } from "@/app/run-view-context";
import { ResultsColumn } from "./ResultsColumn";

/**
 * The stale-results warning is the only signal that what is on screen no
 * longer describes the editor, and a live region announces a CHANGE — so the
 * region has to be mounted BEFORE the sentence arrives in it. Mounting the
 * banner and its region together (what this replaced) said nothing at all.
 */

vi.mock("@/components/ResultsPanel", () => ({
  ResultsPanel: ({ banner }: { banner: ReactNode }) => <div>{banner}</div>,
}));

/** Only what the column reads on its way to the banner slot: the rest is
 *  handed to the stubbed tab shell, which renders none of it. */
function runView(): RunView {
  return {
    result: traceResult(),
    validateHasErrors: false,
    authState: "unconfigured",
    onSignIn: () => {},
    onRunAgain: () => {},
    selectPresetNode: () => {},
  } as unknown as RunView;
}

function column(resultsStale: boolean) {
  return (
    <RunViewContext.Provider value={runView()}>
      <ResultsColumn
        result={traceResult()}
        resultsColRef={{ current: null }}
        focusResultsRef={{ current: false }}
        resultsStale={resultsStale}
        globalText=""
        onGlobalTextChange={() => {}}
        inheritedText=""
        onInheritedTextChange={() => {}}
        globalParse={{}}
        inheritedParse={{}}
        inheritState={null}
      />
    </RunViewContext.Provider>
  );
}

describe("the stale-results live region", () => {
  it("is mounted before the run goes stale, so the sentence is a CHANGE to it", () => {
    const { rerender } = render(column(false));
    expect(screen.getByRole("status").textContent).toBe("");

    rerender(column(true));

    expect(screen.getByRole("status").textContent).toContain("The config changed since this run");
  });

  it("holds the banner itself — the paragraph carries no role of its own", () => {
    render(column(true));

    expect(screen.getByRole("status").querySelector(".stale-banner")).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
