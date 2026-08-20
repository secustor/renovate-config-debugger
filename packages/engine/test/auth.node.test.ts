/**
 * Roadmap 076 — `hostRules`-shaped credentials. `auth.ts` is a pure module (no
 * renovate imports), so the golden project runs it unshimmed: what is under
 * test is the matching rule the fetchers delegate to, not a transport.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveAuthToken, setPresetAuth } from "../src/auth";

afterEach(() => {
  setPresetAuth({});
});

describe("resolveAuthToken", () => {
  it("falls back to the per-type token when no host rules are set", () => {
    setPresetAuth({ githubToken: "gh", gitlabToken: "gl" });
    expect(resolveAuthToken("github", "https://api.github.com/repos/o/r")).toBe("gh");
    expect(resolveAuthToken("gitlab", "https://gitlab.com/api/v4/projects/1")).toBe("gl");
    expect(resolveAuthToken("gitea", "https://gitea.com/api/v1/repos/o/r")).toBeUndefined();
  });

  it("matches a host exactly", () => {
    setPresetAuth({ hostRules: [{ matchHost: "git.example.com", token: "t1" }] });
    expect(resolveAuthToken("gitea", "https://git.example.com/api/v1/repos/o/r")).toBe("t1");
    expect(resolveAuthToken("gitea", "https://other.example.com/api/v1/repos/o/r")).toBeUndefined();
  });

  it("matches a subdomain but never a same-suffix impostor", () => {
    setPresetAuth({ hostRules: [{ matchHost: "gitlab.example.com", token: "t1" }] });
    expect(resolveAuthToken("gitlab", "https://sub.gitlab.example.com/api/v4/x")).toBe("t1");
    expect(resolveAuthToken("gitlab", "https://evilgitlab.example.com/api/v4/x")).toBeUndefined();
  });

  it('treats an omitted or "any" hostType as matching every fetcher', () => {
    setPresetAuth({
      hostRules: [
        { matchHost: "a.example.com", token: "bare" },
        { matchHost: "b.example.com", hostType: "any", token: "any" },
      ],
    });
    expect(resolveAuthToken("github", "https://a.example.com/x")).toBe("bare");
    expect(resolveAuthToken("forgejo", "https://a.example.com/x")).toBe("bare");
    expect(resolveAuthToken("gitea", "https://b.example.com/x")).toBe("any");
  });

  it("ignores a rule whose hostType names a different fetcher", () => {
    setPresetAuth({ hostRules: [{ matchHost: "a.example.com", hostType: "npm", token: "npm" }] });
    expect(resolveAuthToken("github", "https://a.example.com/x")).toBeUndefined();
  });

  it("lets the longest matchHost win", () => {
    setPresetAuth({
      hostRules: [
        { matchHost: "example.com", token: "wide" },
        { matchHost: "git.example.com", token: "narrow" },
      ],
    });
    expect(resolveAuthToken("gitea", "https://git.example.com/x")).toBe("narrow");
    expect(resolveAuthToken("gitea", "https://other.example.com/x")).toBe("wide");
  });

  it("lets a typed rule beat an equally specific untyped one", () => {
    setPresetAuth({
      hostRules: [
        { matchHost: "git.example.com", token: "untyped" },
        { matchHost: "git.example.com", hostType: "gitea", token: "typed" },
      ],
    });
    expect(resolveAuthToken("gitea", "https://git.example.com/x")).toBe("typed");
    expect(resolveAuthToken("github", "https://git.example.com/x")).toBe("untyped");
  });

  it("keeps the port in the matched host", () => {
    setPresetAuth({ hostRules: [{ matchHost: "localhost:3000", token: "t1" }] });
    expect(resolveAuthToken("gitea", "http://localhost:3000/api/v1/x")).toBe("t1");
    expect(resolveAuthToken("gitea", "http://localhost:3001/api/v1/x")).toBeUndefined();
  });

  it("falls back to the per-type token for a URL that will not parse", () => {
    setPresetAuth({
      githubToken: "gh",
      hostRules: [{ matchHost: "git.example.com", token: "t1" }],
    });
    expect(resolveAuthToken("github", "not a url")).toBe("gh");
  });

  it("falls back to the per-type token when no rule matches", () => {
    setPresetAuth({
      giteaToken: "gt",
      hostRules: [{ matchHost: "git.example.com", token: "t1" }],
    });
    expect(resolveAuthToken("gitea", "https://gitea.com/api/v1/x")).toBe("gt");
  });

  it("skips an empty-token rule rather than authenticating with nothing", () => {
    setPresetAuth({
      githubToken: "gh",
      hostRules: [{ matchHost: "api.github.com", token: "" }],
    });
    expect(resolveAuthToken("github", "https://api.github.com/repos/o/r")).toBe("gh");
  });
});
