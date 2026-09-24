import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLogDeps } from "./use-log-deps";
import { LoadOverlay } from "@/features/editor/LoadOverlay";
import type { RepoLoadFormProps } from "@/features/editor/RepoLoadForm";
import { repoDepsSourceLabel } from "@/lib/repo-deps-source";
import type { LoadedRepo } from "@/types/repo";

vi.mock("@/platform/run", () => ({ getRenovateVersion: () => Promise.resolve("44.97.5") }));

/**
 * Roadmap 095 — the load overlay's Renovate log tab wired to the hook that owns
 * its draft: parse as typed, preview, Replace, the "Load N" count, the sample,
 * dropping a file, and the "also load its config" path keeping the log source.
 */

const REPO_FORM: RepoLoadFormProps = {
  repo: "",
  onRepoChange: () => undefined,
  gitRef: "",
  onRefChange: () => undefined,
  loading: false,
  onSubmit: () => undefined,
  onClose: () => undefined,
  inheritAuto: false,
  onInheritAutoChange: () => undefined,
  inheritRepo: "",
  onInheritRepoChange: () => undefined,
  inheritFile: "",
  onInheritFileChange: () => undefined,
  picker: null,
  pickerUser: null,
};

function logText(repository?: string): string {
  return JSON.stringify({
    msg: "packageFiles with updates",
    ...(repository === undefined ? {} : { repository }),
    baseBranch: "main",
    config: {
      npm: [
        {
          packageFile: "package.json",
          deps: [
            {
              depName: "a",
              currentValue: "1.0.0",
              updates: [{ updateType: "minor", newValue: "1.1.0" }],
            },
            { depName: "b", currentValue: "2.0.0", updates: [] },
            { depName: "linked", skipReason: "file-dependency" },
          ],
        },
      ],
    },
  });
}

const REPO = (repo: string): LoadedRepo => ({ platform: "github", repo, suppressTokens: false });

function Harness({ loadRepo }: { loadRepo?: (slug: string) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [loadedRepo, setLoadedRepo] = useState<LoadedRepo | null>(null);
  const deps = useLogDeps({
    loadedRepo,
    overlayOpen: open,
    closeOverlay: () => setOpen(false),
    loadRepo: async (slug) => {
      await loadRepo?.(slug);
      setLoadedRepo(REPO(slug));
      setOpen(false);
    },
  });
  return (
    <>
      {open ? (
        <LoadOverlay
          tab={deps.tab}
          onTabChange={deps.setTab}
          repo={{ ...REPO_FORM, onClose: () => setOpen(false) }}
          log={{
            draft: deps.draft,
            onDraftChange: deps.setDraft,
            preview: deps.preview,
            alsoLoadConfig: deps.alsoLoadConfig,
            onAlsoLoadConfigChange: deps.setAlsoLoadConfig,
            loading: deps.loading,
            onLoad: () => void deps.load(),
            onClose: () => setOpen(false),
          }}
        />
      ) : null}
      <output aria-label="source">
        {deps.view === null ? "none" : repoDepsSourceLabel(deps.view)}
      </output>
      <output aria-label="rows">{deps.view?.deps.length ?? 0}</output>
      <button type="button" onClick={() => setLoadedRepo(REPO("acme/other"))}>
        plain repo load
      </button>
      <button
        type="button"
        onClick={() => {
          deps.prepare({ tab: "log", text: logText() });
          setOpen(true);
        }}
      >
        open with log
      </button>
    </>
  );
}

function openLogTab() {
  const view = render(<Harness />);
  fireEvent.click(view.getByRole("tab", { name: "Renovate log" }));
  return view;
}

describe("the load overlay's tabs", () => {
  it("switches tabs by click and arrow key, each with its hint", () => {
    const view = render(<Harness />);
    const repoTab = view.getByRole("tab", { name: "Repository" });
    expect(repoTab.getAttribute("aria-selected")).toBe("true");
    expect(view.container.textContent).toContain("full experience: config, dependencies and tests");
    expect(view.getByRole("form", { name: "Load from repository" })).toBeTruthy();

    fireEvent.keyDown(repoTab, { key: "ArrowRight" });
    const logTab = view.getByRole("tab", { name: "Renovate log" });
    expect(logTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(logTab);
    expect(view.container.textContent).toContain("dependencies for Tests and the Dependencies tab");
    expect(view.getByRole("tabpanel", { name: "Renovate log" })).toBeTruthy();

    fireEvent.click(view.getByRole("tab", { name: "Repository" }));
    expect(view.getByRole("tab", { name: "Repository" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });
});

describe("the Renovate log tab", () => {
  it("parses as the text is pasted and previews it per package file", () => {
    const view = openLogTab();
    expect(view.getByRole("button", { name: "Load dependencies" }).hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.change(view.getByLabelText("Paste a Renovate log"), { target: { value: logText() } });

    expect(view.getByText("pasted log")).toBeTruthy();
    expect(view.container.textContent).toContain("1 package file · 2 deps · 1 update · base main");
    const cells = view.getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["package.json", "npm", "2", "1"]);
    // The count is the Dependencies tab's rows: the file: link is not one.
    expect(view.getByRole("button", { name: "Load 2 dependencies" })).toBeTruthy();
  });

  it("shows the parser's error inline", () => {
    const view = openLogTab();
    fireEvent.change(view.getByLabelText("Paste a Renovate log"), {
      target: { value: "not json" },
    });
    expect(view.getByRole("alert").textContent).toBe(
      "Couldn’t read this as JSON — expected one JSON object per line (LOG_FORMAT=json).",
    );
  });

  it("Replace returns to the empty state", () => {
    const view = openLogTab();
    fireEvent.change(view.getByLabelText("Paste a Renovate log"), { target: { value: logText() } });
    fireEvent.click(view.getByRole("button", { name: "Replace" }));
    const input = view.getByLabelText("Paste a Renovate log");
    expect((input as HTMLTextAreaElement).value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("loads the sample log, which names no repository", async () => {
    const view = openLogTab();
    fireEvent.click(view.getByRole("button", { name: "use a sample log" }));
    expect(view.getByText("renovate-sample.log")).toBeTruthy();
    expect(view.queryByRole("checkbox")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Load 5 dependencies" }));

    await waitFor(() =>
      expect(view.getByLabelText("source").textContent).toBe("Renovate log (v44.97.5)"),
    );
    expect(view.getByLabelText("rows").textContent).toBe("5");
    expect(view.queryByRole("tablist")).toBeNull();
  });

  it("reads a dropped file", async () => {
    const view = openLogTab();
    const file = new File([logText()], "run.log");
    fireEvent.drop(view.getByRole("form", { name: "Load from a Renovate log" }), {
      dataTransfer: { files: [file] },
    });
    await waitFor(() => expect(view.getByText("run.log")).toBeTruthy());
  });

  it("offers loading the log's repository config only when it names one", () => {
    const view = openLogTab();
    const paste = (value: string) => {
      fireEvent.change(view.getByLabelText("Paste a Renovate log"), { target: { value } });
    };
    paste(logText());
    expect(view.queryByRole("checkbox")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Replace" }));
    paste(logText("local"));
    expect(view.queryByRole("checkbox")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Replace" }));
    paste(logText("acme/webapp"));
    expect(
      view.getByRole("checkbox", { name: "also load acme/webapp’s config into the editor" }),
    ).toBeTruthy();
  });

  it("keeps the log as the source when its checkbox loads the config", async () => {
    const loadRepo = vi.fn(() => Promise.resolve());
    const view = render(<Harness loadRepo={loadRepo} />);
    fireEvent.click(view.getByRole("tab", { name: "Renovate log" }));
    fireEvent.change(view.getByLabelText("Paste a Renovate log"), {
      target: { value: logText("acme/webapp") },
    });
    fireEvent.click(view.getByRole("checkbox", { name: /also load acme\/webapp’s config/ }));
    fireEvent.click(view.getByRole("button", { name: "Load 2 dependencies" }));

    await waitFor(() => expect(loadRepo).toHaveBeenCalledWith("acme/webapp"));
    await waitFor(() =>
      expect(view.getByLabelText("source").textContent).toBe("Renovate log of acme/webapp"),
    );
    expect(view.queryByRole("tablist")).toBeNull();

    // Any other repository load replaces the log.
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "plain repo load" }));
    });
    expect(view.getByLabelText("source").textContent).toBe("none");
  });

  it("opens prefilled on the log tab, and forgets the draft on close", () => {
    const view = render(<Harness />);
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    fireEvent.click(view.getByRole("button", { name: "open with log" }));
    expect(view.getByRole("tab", { name: "Renovate log" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(view.getByRole("button", { name: "Load 2 dependencies" })).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(view.queryByRole("tablist")).toBeNull();
  });
});
