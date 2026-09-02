import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { type CustomManagerBlocks, type RepoDeps, useRepoDeps } from "./use-repo-deps";
import { EMPTY_REPO_DEPS } from "./repo-deps";
import type { LoadedRepo } from "@/types/repo";

/**
 * The invalidation half of discovery: `ensure`'s IDENTITY is what re-fires the
 * shell's effect (its other deps are only which tab is open), so a callback
 * that outlived the discovery key left an already-open Dependencies tab or
 * Extract phase stranded on "Reading …'s package files…" forever.
 */

const { loadEngine, loadRepoTree, loadRepoFile } = vi.hoisted(() => ({
  loadEngine: vi.fn(),
  loadRepoTree: vi.fn(),
  loadRepoFile: vi.fn(),
}));
vi.mock("@/platform/engine-chunk", () => ({ loadEngine }));
vi.mock("@/platform/run", () => ({ loadRepoTree, loadRepoFile }));

const REPO: LoadedRepo = { platform: "github", repo: "acme/app", suppressTokens: false };

/** The hook's latest return, published from an effect rather than from render
 *  (`react(globals)`) — which is also when the assertions read it. */
const seen: RepoDeps = { ensure: () => undefined, view: EMPTY_REPO_DEPS };

function Harness({ customManagers }: { customManagers: CustomManagerBlocks }) {
  const deps = useRepoDeps(REPO, customManagers);
  useEffect(() => {
    seen.ensure = deps.ensure;
    seen.view = deps.view;
  });
  return null;
}

beforeEach(() => {
  seen.ensure = () => undefined;
  seen.view = EMPTY_REPO_DEPS;
  loadRepoTree.mockReset();
  loadRepoTree.mockResolvedValue({ paths: [], truncated: false });
  loadEngine.mockReset();
  loadEngine.mockResolvedValue({
    matchExtractableManagers: () => ({
      files: [],
      managersConsidered: 3,
      customManagersConsidered: 0,
    }),
  });
});

it("re-fires discovery when the custom-manager key changes under an open tab", async () => {
  const view = render(<Harness customManagers={[]} />);
  const first = seen.ensure;
  await act(async () => {
    first();
  });
  expect(seen.view.status).toBe("ready");
  expect(loadRepoTree).toHaveBeenCalledTimes(1);

  // A run whose blocks differ walks a different repository: the report on
  // screen stops being the displayed view…
  view.rerender(<Harness customManagers={[{ customType: "regex" }]} />);
  await act(async () => undefined);
  expect(seen.view.status).toBe("idle");
  // …and the callback the shell's effect depends on moved with it, which is
  // the only thing that asks for the new walk.
  expect(seen.ensure).not.toBe(first);
  await act(async () => {
    seen.ensure();
  });
  expect(loadRepoTree).toHaveBeenCalledTimes(2);
  expect(seen.view.status).toBe("ready");
});

it("keeps ensure stable while the key does not move, so the doors never discover twice", async () => {
  const view = render(<Harness customManagers={[]} />);
  const first = seen.ensure;
  await act(async () => {
    first();
  });
  view.rerender(<Harness customManagers={[]} />);
  await act(async () => undefined);
  expect(seen.ensure).toBe(first);
  await act(async () => {
    seen.ensure();
  });
  expect(loadRepoTree).toHaveBeenCalledTimes(1);
});
