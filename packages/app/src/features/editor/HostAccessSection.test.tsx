import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostAccessSection } from "./HostAccessSection";

/**
 * Roadmap 010 — the "not fetched in the browser" note.
 *
 * The note is about the platform the RUN resolves against, which is
 * `displayPlatform` (008/010: a pasted global config's platform displaces the
 * stored one). It used to read the stored local platform, so a global
 * `bitbucket` over a stored `github` suppressed the note entirely — the case
 * this file pins, alongside the two it must stay quiet for.
 */

function renderSection(props: {
  displayPlatform: string;
  usesLocal: boolean;
  reflectGlobal?: boolean;
  displayEndpoint?: string;
}) {
  return render(
    <HostAccessSection
      hostSectionOpen
      onHostSectionOpenChange={vi.fn()}
      displayPlatform={props.displayPlatform}
      displayEndpoint={props.displayEndpoint ?? ""}
      onPlatformChange={vi.fn()}
      onEndpointChange={vi.fn()}
      reflectGlobal={props.reflectGlobal ?? false}
      globalPlatform={props.reflectGlobal ? props.displayPlatform : undefined}
      globalEndpoint={props.reflectGlobal ? props.displayEndpoint : undefined}
      platformOverride={false}
      hasGlobalContext={props.reflectGlobal ?? false}
      onUseGlobalValues={vi.fn()}
      usesLocal={props.usesLocal}
    />,
  );
}

function section(props: { displayPlatform: string; usesLocal: boolean; reflectGlobal?: boolean }) {
  const view = renderSection(props);
  return [...view.container.querySelectorAll(".advanced-note")].find((el) =>
    el.textContent?.includes("not fetched in the browser"),
  );
}

describe("HostAccessSection's host-reachability note", () => {
  it("names the global config's platform when that is what the run uses", () => {
    // Stored local platform is github; the pasted global config says bitbucket.
    const note = section({ displayPlatform: "bitbucket", usesLocal: true, reflectGlobal: true });
    expect(note?.querySelector("code")?.textContent).toBe("bitbucket");
  });

  it("stays quiet for a platform this app does fetch from", () => {
    expect(section({ displayPlatform: "gitlab", usesLocal: true })).toBeUndefined();
  });

  it("stays quiet on github, which is not a local-fetch platform at all", () => {
    expect(section({ displayPlatform: "github", usesLocal: false })).toBeUndefined();
  });

  it("names an unknown platform, which has no endpoint to fetch from", () => {
    const note = section({ displayPlatform: "made-up-forge", usesLocal: true });
    expect(note?.querySelector("code")?.textContent).toBe("made-up-forge");
  });
});

/**
 * The Run gate (`App.blockedByLayerErrors`) tests the TYPED endpoint only, so a
 * malformed endpoint reflected from the pasted global config really does run.
 * The note used to promise the opposite in exactly that state.
 */
describe("HostAccessSection's endpoint error", () => {
  const BAD = "gitlab.example.com";

  it("promises a blocked run only for the endpoint the reader typed", () => {
    const view = renderSection({
      displayPlatform: "gitlab",
      usesLocal: true,
      displayEndpoint: BAD,
    });
    const error = view.container.querySelector(".layer-editor-error");
    expect(error?.textContent).toContain("Not a valid endpoint");
    expect(error?.textContent).toContain("The pipeline won’t run");
  });

  it("says a reflected global endpoint is used anyway, not blocked", () => {
    const view = renderSection({
      displayPlatform: "gitlab",
      usesLocal: true,
      displayEndpoint: BAD,
      reflectGlobal: true,
    });
    const error = view.container.querySelector(".layer-editor-error");
    expect(error?.textContent).toContain("comes from the pasted global config");
    expect(error?.textContent).not.toContain("won’t run");
  });
});
