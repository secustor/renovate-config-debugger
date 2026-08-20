import { describe, expect, it } from "vitest";
import { credentialsSummary } from "./credentials-summary";

const NONE = [
  { id: "github" as const, value: "" },
  { id: "gitlab" as const, value: "" },
  { id: "gitea" as const, value: "" },
  { id: "forgejo" as const, value: "" },
];

function withToken(id: "github" | "gitlab" | "gitea" | "forgejo", value: string) {
  return NONE.map((token) => (token.id === id ? { ...token, value } : token));
}

describe("credentialsSummary (roadmap 076)", () => {
  it("calls a fresh github session the default", () => {
    expect(
      credentialsSummary({
        tokens: NONE,
        signedIn: false,
        platform: "github",
        endpoint: "https://api.github.com",
      }),
    ).toEqual({ count: 0, isDefault: true });
  });

  it("treats an empty endpoint as the platform default too", () => {
    const summary = credentialsSummary({
      tokens: NONE,
      signedIn: false,
      platform: "github",
      endpoint: "",
    });
    expect(summary.isDefault).toBe(true);
  });

  it("is not the default once the host has been pointed elsewhere", () => {
    const summary = credentialsSummary({
      tokens: NONE,
      signedIn: false,
      platform: "github",
      endpoint: "https://ghe.example/api/v3",
    });
    expect(summary).toEqual({ count: 0, isDefault: false });
  });

  it("counts a sign-in as github.com's credential", () => {
    expect(
      credentialsSummary({
        tokens: NONE,
        signedIn: true,
        platform: "github",
        endpoint: "https://api.github.com",
      }),
    ).toEqual({ count: 1, isDefault: false });
  });

  it("does not double-count a sign-in and a GitHub PAT", () => {
    const summary = credentialsSummary({
      tokens: withToken("github", "ghp_x"),
      signedIn: true,
      platform: "github",
      endpoint: "https://api.github.com",
    });
    expect(summary.count).toBe(1);
  });

  it("counts one per non-github host that has a token", () => {
    const tokens = NONE.map((token) =>
      token.id === "gitlab" || token.id === "gitea" ? { ...token, value: "t" } : token,
    );
    expect(
      credentialsSummary({
        tokens,
        signedIn: false,
        platform: "github",
        endpoint: "https://api.github.com",
      }),
    ).toEqual({ count: 2, isDefault: false });
  });
});
