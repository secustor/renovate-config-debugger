import { describe, expect, it } from "vitest";
import {
  hasDepsSource,
  isLogSource,
  logSourceNotes,
  repoDepsSourceLabel,
} from "./repo-deps-source";
import type { RepoDepsSource, RepoDepsView } from "@/types/repo";

type LogSource = Extract<RepoDepsSource, { kind: "log" }>;

function view(source: RepoDepsSource, repo: string): RepoDepsView {
  return {
    status: "ready",
    source,
    repo,
    deps: [],
    files: [],
    managersConsidered: 0,
    customManagersConsidered: 0,
    truncated: false,
    error: null,
  };
}

function log(over: Partial<LogSource> = {}): RepoDepsView {
  const source: LogSource = {
    kind: "log",
    slug: null,
    renovateVersion: "44.97.5",
    pinnedVersion: "44.97.5",
    baseBranch: null,
    otherBaseBranches: [],
    ...over,
  };
  return view(source, source.slug ?? "");
}

describe("repoDepsSourceLabel", () => {
  it("is the repository for a walk", () => {
    expect(repoDepsSourceLabel(view({ kind: "repo" }, "acme/webapp"))).toBe("acme/webapp");
  });

  it("names the log, its slug and its version", () => {
    expect(repoDepsSourceLabel(log({ slug: "acme/webapp" }))).toBe(
      "Renovate log of acme/webapp (v44.97.5)",
    );
    expect(repoDepsSourceLabel(log())).toBe("Renovate log (v44.97.5)");
    expect(repoDepsSourceLabel(log({ renovateVersion: null }))).toBe("Renovate log");
  });

  it("never prints platform=local's 'local' as a repository", () => {
    const label = repoDepsSourceLabel(log({ slug: "local" }));
    expect(label).toBe("Renovate log (v44.97.5)");
    expect(label).not.toContain("local");
  });
});

describe("hasDepsSource", () => {
  it("counts a slugless log as a source, and an empty repo as none", () => {
    expect(hasDepsSource(log())).toBe(true);
    expect(isLogSource(log())).toBe(true);
    expect(hasDepsSource(view({ kind: "repo" }, ""))).toBe(false);
    expect(hasDepsSource(view({ kind: "repo" }, "acme/webapp"))).toBe(true);
  });
});

describe("logSourceNotes", () => {
  it("is silent for a repository and for a log written by the pinned version", () => {
    expect(logSourceNotes(view({ kind: "repo" }, "acme/webapp"))).toEqual([]);
    expect(logSourceNotes(log())).toEqual([]);
  });

  it("notes a version mismatch", () => {
    expect(logSourceNotes(log({ renovateVersion: "43.0.0" }))).toEqual([
      "the log was written by Renovate v43.0.0; this debugger runs v44.97.5",
    ]);
  });

  it("notes the base branches it did not load", () => {
    expect(logSourceNotes(log({ baseBranch: "main", otherBaseBranches: ["release"] }))).toEqual([
      "only main is shown — the log also covers release",
    ]);
  });
});
