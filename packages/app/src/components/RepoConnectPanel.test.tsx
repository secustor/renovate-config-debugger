import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepoConnectPanel } from "./RepoConnectPanel";
import { CONNECT_OFFER as CONNECT } from "@tools/test/repo-deps";

/**
 * Roadmap 087 — the offer while NO repository is loaded, in its two shapes: a
 * share link that named the repo its config came from (one click reloads it),
 * and no suggestion at all (the editor's load overlay is the only door).
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

describe("RepoConnectPanel", () => {
  it("offers only the load overlay when nothing suggests a repository", () => {
    const onOpenLoad = vi.fn();
    const view = render(<RepoConnectPanel offer={{ ...CONNECT, onOpenLoad }} />);

    expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
    expect(view.queryByRole("button", { name: /^Reload / })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "load a repository…" }));
    expect(onOpenLoad).toHaveBeenCalledOnce();
  });

  it("leads with the suggested repository when a share link named one", () => {
    const onConnect = vi.fn();
    const view = render(
      <RepoConnectPanel offer={{ ...CONNECT, suggestion: "acme/webapp", onConnect }} />,
    );

    expect(view.container.textContent).toContain("opened from a shared link");
    fireEvent.click(view.getByRole("button", { name: "Reload acme/webapp" }));
    expect(onConnect).toHaveBeenCalledOnce();
    // The overlay is still one link away — for any OTHER repository.
    expect(view.getByRole("button", { name: "load a different repository…" })).toBeTruthy();
  });

  it("hands its own button back so a dismissal returns focus here", () => {
    const onOpenLoad = vi.fn();
    const view = render(<RepoConnectPanel offer={{ ...CONNECT, onOpenLoad }} />);

    const button = view.getByRole("button", { name: "load a repository…" });
    fireEvent.click(button);
    expect(onOpenLoad).toHaveBeenCalledExactlyOnceWith(button);
  });
});
