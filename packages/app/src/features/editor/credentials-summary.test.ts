import { describe, expect, it } from "vitest";
import { credentialsLine } from "./credentials-summary";

const NONE = [
  { id: "github" as const, host: "github.com", value: "" },
  { id: "gitlab" as const, host: "gitlab.com", value: "" },
  { id: "gitea" as const, host: "gitea.com", value: "" },
  { id: "forgejo" as const, host: "codeberg.org", value: "" },
];

function withToken(id: "github" | "gitlab" | "gitea" | "forgejo", value: string) {
  return NONE.map((token) => (token.id === id ? { ...token, value } : token));
}

describe("credentialsLine (roadmap 076/077, Proposal F)", () => {
  it("states a fresh github session positively", () => {
    expect(
      credentialsLine({
        tokens: NONE,
        signedIn: false,
        platform: "github",
        endpoint: "https://api.github.com",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("github.com anonymous");
  });

  it("treats an empty endpoint as the platform default too", () => {
    expect(
      credentialsLine({
        tokens: NONE,
        signedIn: false,
        platform: "github",
        endpoint: "",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("github.com anonymous");
  });

  it("names the override's host once the endpoint is pointed elsewhere", () => {
    expect(
      credentialsLine({
        tokens: NONE,
        signedIn: false,
        platform: "github",
        endpoint: "https://ghe.example/api/v3",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("ghe.example anonymous");
  });

  it("marks github.com authenticated on a sign-in", () => {
    expect(
      credentialsLine({
        tokens: NONE,
        signedIn: true,
        platform: "github",
        endpoint: "https://api.github.com",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("github.com ✓");
  });

  it("does not double-count a sign-in and a GitHub PAT", () => {
    expect(
      credentialsLine({
        tokens: withToken("github", "ghp_x"),
        signedIn: true,
        platform: "github",
        endpoint: "https://api.github.com",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("github.com ✓");
  });

  it("counts other credentialed hosts as +N", () => {
    const tokens = NONE.map((token) =>
      token.id === "gitlab" || token.id === "gitea" ? { ...token, value: "t" } : token,
    );
    expect(
      credentialsLine({
        tokens,
        signedIn: false,
        platform: "github",
        endpoint: "https://api.github.com",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("github.com anonymous · +2");
  });

  it("makes the platform's own host the subject on a non-github platform", () => {
    expect(
      credentialsLine({
        tokens: withToken("gitlab", "glpat-x"),
        signedIn: true,
        platform: "gitlab",
        endpoint: "",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("gitlab.com ✓ · +1");
  });

  it("ignores tokens the app would refuse to save", () => {
    // Same rule as HostRows: a value with a control character (or over the
    // length cap) is not a credential, so it neither marks ✓ nor counts as +N.
    const tokens = NONE.map((token) => {
      if (token.id === "github") {
        return { ...token, value: "ghp_\u0007bad" };
      }
      return token.id === "gitlab" ? { ...token, value: "g".repeat(4097) } : token;
    });
    expect(
      credentialsLine({
        tokens,
        signedIn: false,
        platform: "github",
        endpoint: "https://api.github.com",
        customHostCount: 0,
        suppressTokens: false,
      }),
    ).toBe("github.com anonymous");
  });

  it("withholds the tick while the untrusted-endpoint guard suppresses tokens", () => {
    // The guard runs every request without a token, so a signed-in session
    // pointed at the untrusted host authenticates against nothing.
    expect(
      credentialsLine({
        tokens: withToken("github", "ghp_x"),
        signedIn: true,
        platform: "github",
        endpoint: "https://ghe.example/api/v3",
        customHostCount: 0,
        suppressTokens: true,
      }),
    ).toBe("ghe.example anonymous");
  });

  it("keeps the +N tail under suppression — those hosts still hold tokens", () => {
    const tokens = NONE.map((token) =>
      token.id === "gitlab" || token.id === "gitea" ? { ...token, value: "t" } : token,
    );
    expect(
      credentialsLine({
        tokens,
        signedIn: true,
        platform: "github",
        endpoint: "https://ghe.example/api/v3",
        customHostCount: 1,
        suppressTokens: true,
      }),
    ).toBe("ghe.example anonymous · +3");
  });

  it("counts custom host rules toward the +N tail", () => {
    expect(
      credentialsLine({
        tokens: NONE,
        signedIn: false,
        platform: "github",
        endpoint: "https://api.github.com",
        customHostCount: 1,
        suppressTokens: false,
      }),
    ).toBe("github.com anonymous · +1");
  });
});
