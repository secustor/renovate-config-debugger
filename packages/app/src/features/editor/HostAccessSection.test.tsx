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

function section(props: { displayPlatform: string; usesLocal: boolean; reflectGlobal?: boolean }) {
  const view = render(
    <HostAccessSection
      hostSectionOpen
      onHostSectionOpenChange={vi.fn()}
      displayPlatform={props.displayPlatform}
      displayEndpoint=""
      onPlatformChange={vi.fn()}
      onEndpointChange={vi.fn()}
      reflectGlobal={props.reflectGlobal ?? false}
      globalPlatform={props.reflectGlobal ? props.displayPlatform : undefined}
      globalEndpoint={undefined}
      platformOverride={false}
      hasGlobalContext={props.reflectGlobal ?? false}
      onUseGlobalValues={vi.fn()}
      usesLocal={props.usesLocal}
    />,
  );
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
