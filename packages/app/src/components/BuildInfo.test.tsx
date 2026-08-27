import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as BuildInfoModule from "@/lib/build-info";
import { AboutBuildButton, BuildStamp, BuildVerifyLine } from "./BuildInfo";

/**
 * Roadmap 088 — the "verify this build" popover. Vitest applies no vite
 * `define`, so the real module exports `BUILD_INFO: null` (and every anchor
 * renders nothing — the Docker-build behavior); the fixture below is what a
 * CI-built bundle carries.
 */

const IDENTITY = vi.hoisted(() => ({
  repo: "secustor/renovate-config-debugger",
  commit: "d58538fab3a0000000000000000000000000000f",
  version: "0.2.0",
  commitTime: "2026-08-25T14:02:33+02:00",
}));

vi.mock("@/lib/build-info", async (importOriginal) => {
  const original = await importOriginal<typeof BuildInfoModule>();
  return { ...original, BUILD_INFO: IDENTITY };
});

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function openPanel(trigger: HTMLElement): HTMLElement {
  fireEvent.click(trigger);
  const panel = document.querySelector<HTMLElement>(".build-info-panel");
  if (!panel) {
    throw new Error("panel did not open");
  }
  return panel;
}

describe("BuildStamp", () => {
  it("stamps the version and short sha, and opens the panel", () => {
    render(<BuildStamp />);
    const trigger = screen.getByRole("button", { name: /v0\.2\.0 d58538f/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    const panel = openPanel(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // The identity line links the full commit.
    const link = screen.getByRole("link", { name: "d58538f" });
    expect(link.getAttribute("href")).toBe(
      `https://github.com/${IDENTITY.repo}/commit/${IDENTITY.commit}`,
    );
    expect(panel.textContent).toContain("2026-08-25 12:02 UTC");
  });

  it("defaults to the attestation command and switches to rebuild & diff", () => {
    render(<BuildStamp />);
    const panel = openPanel(screen.getByRole("button", { name: /d58538f/ }));
    expect(panel.textContent).toContain("gh attestation verify build-manifest.json");

    fireEvent.click(screen.getByRole("button", { name: "rebuild & diff" }));
    expect(panel.textContent).toContain(
      `mise install && mise run verify-build ${window.location.origin}`,
    );
    expect(panel.textContent).not.toContain("gh attestation verify");
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    render(<BuildStamp />);
    const trigger = screen.getByRole("button", { name: /d58538f/ });
    openPanel(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".build-info-panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("the landing anchors", () => {
  it("the subtitle ⓘ is named for assistive tech and opens the same panel", () => {
    render(<AboutBuildButton />);
    const trigger = screen.getByRole("button", { name: "About this build" });
    openPanel(trigger);
    expect(screen.getByRole("button", { name: "gh attestation" })).toBeTruthy();
  });

  it("the build line says what this deployment is and offers the way in", () => {
    const { container } = render(<BuildVerifyLine />);
    expect(container.textContent).toContain("built 2026-08-25");
    const panel = openPanel(screen.getByRole("button", { name: "verify this build" }));
    expect(panel.textContent).toContain("gh attestation verify");
  });
});
