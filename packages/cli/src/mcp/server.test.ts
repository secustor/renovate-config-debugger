import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getPresetAuth, setPresetAuth } from "@renovate-config-debugger/engine";
import pkg from "../../package.json";
import { createMcpServer } from "./server";
import { RESULT_BUDGET_BYTES } from "./result";
import { DEFAULT_RUN_LIMIT, RunStore } from "./run-store";
import { recordingIo } from "../test-harness";

/**
 * Roadmap 060: the tool surface, driven through a real MCP client over the
 * SDK's in-memory transport pair — so the schemas, the handlers and the
 * result shapes are exercised exactly as a client would.
 *
 * Under SDK v2 the server side is the PRODUCTION entry point — `serveStdio`
 * over that in-memory pair rather than over a process's stdio — because the
 * entry, not the server, owns the era decision. So the suite drives the exact
 * wiring `rcd mcp` does, including the choice between the 2026-07-28 protocol
 * and the legacy 2025-era handshake. The v2 client negotiates `legacy` unless
 * told otherwise, so every test below is a legacy-era run; "the tool surface"
 * adds one that pins 2026-07-28, and `test/bin.test.ts` proves the legacy era
 * over a real pipe.
 *
 * Thin, like the CLI's own tests: the answers themselves come from the shared
 * projection modules the subcommands use, and the engine's golden↔shimmed
 * suite owns the semantics underneath. What is NOT thin is the property tests
 * below — size budget, strictness, the credential guard — because those are
 * this transport's own failure modes.
 */

const CONFIG = '{"extends":[":dependencyDashboard"],"labels":["deps"]}';
const GROUPED =
  '{"labels":["deps"],"packageRules":[{"matchPackageNames":["react"],"groupName":"react"}]}';
/** One AUTHORED update-type block (roadmap 048): a minor update flattens it
 *  up, a major one drops it without applying — the two readings an empty
 *  `flattened.merged` could not tell apart. */
const AUTOMERGE_MINOR = JSON.stringify({
  labels: ["deps"],
  minor: { automerge: true },
  packageRules: [{ matchPackageNames: ["react"], groupName: "react monorepo" }],
});
/** The big one — every size assertion in this file is measured against it. */
const RECOMMENDED = '{"extends":["config:recommended"],"labels":["deps"]}';
/** The same at scale, plus ONE rule of the caller's own — the shape the
 *  packageRules provenance answer is about: 713 preset rules, then yours. */
const RECOMMENDED_PLUS_RULE = JSON.stringify({
  extends: ["config:recommended"],
  packageRules: [{ matchPackageNames: ["react"], groupName: "react" }],
});
/**
 * A rule-scoped validator ERROR, with a preset ahead of it so the two index
 * schemes differ: `:disablePeerDependencies` contributes merged rule 0, so the
 * `packageRules[1]` the validator names is merged rule 2.
 */
const BAD_SECOND_RULE = JSON.stringify({
  extends: [":disablePeerDependencies"],
  packageRules: [
    { matchPackageNames: ["react"], groupName: "react" },
    { matchPackageNames: ["*", "lodash"], groupName: "everything" },
  ],
});
/** One rule of each kind against `react`: a preset rule that fails on an unset
 *  depType, a matching one, one that fails on an unset sourceUrl, and a genuine
 *  mismatch — the CLI's `mixed-rules.json` fixture, inline. */
const MIXED_RULES = JSON.stringify({
  extends: [":disablePeerDependencies"],
  packageRules: [
    { matchPackageNames: ["react"], groupName: "react monorepo" },
    { matchSourceUrls: ["https://github.com/facebook/react"], labels: ["upstream"] },
    { matchPackageNames: ["lodash"], labels: ["utils"] },
  ],
});

/** The revision the modern era negotiates. */
const MODERN_PROTOCOL_VERSION = "2026-07-28";

let client: Client;
let close: () => Promise<void>;

interface ConnectOptions {
  env?: Record<string, string | undefined>;
  /** Omitted: the client's default, the 2025-era `initialize` handshake. */
  era?: "modern";
  /** A store the test can read back — what the server HELD, not what it answered. */
  store?: RunStore;
}

async function connect(options?: ConnectOptions): Promise<void> {
  const io = recordingIo(options?.env ? { env: options.env } : undefined);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // One factory, both eras — the entry pins ONE instance per connection.
  const handle: StdioServerHandle = serveStdio(
    () => createMcpServer(io, options?.store ? { store: options.store } : undefined),
    { transport: serverTransport },
  );
  client = new Client(
    { name: "test", version: "0" },
    options?.era === "modern"
      ? { versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } } }
      : {},
  );
  await client.connect(clientTransport);
  close = async () => {
    await client.close();
    await handle.close();
  };
}

interface ToolText {
  isError?: boolean;
  content: { type: string; text: string }[];
}

/** The raw text a tool answered with — what the model's context actually pays for. */
async function callText(name: string, args: Record<string, unknown>): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as ToolText;
  const text = result.content[0]?.text ?? "";
  if (result.isError) {
    throw new Error(text);
  }
  return text;
}

/** The one JSON document every tool answers with. */
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  return JSON.parse(await callText(name, args)) as unknown;
}

async function runConfig(content: string): Promise<string> {
  const summary = (await call("run_config", { fileName: "renovate.json", content })) as {
    runId: string;
  };
  return summary.runId;
}

beforeEach(() => connect());
afterEach(async () => {
  vi.unstubAllGlobals();
  await close();
});

describe("tool surface", () => {
  test("advertises every tool the roadmap names, with its domain hints", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual([
      "compare_simulations",
      "explain_message",
      "get_final_config",
      "get_option_docs",
      "get_preset_node",
      "get_preset_tree",
      "get_provenance",
      "get_resolved_config",
      "run_config",
      "simulate",
    ]);
    const node = tools.find((t) => t.name === "get_preset_node");
    expect(node?.description).toContain("one node at a time");
  });

  test("the workflow is in `instructions`, and the server names its own version", () => {
    const info = client.getServerVersion();
    expect(info?.name).toBe("renovate-config-debugger");
    // The SERVER's version, by convention — Renovate's lives in the title.
    expect(info?.version).toBe(pkg.version);
    expect(info?.title).toMatch(/^Renovate Config Debugger \(Renovate \d+\./);
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("run_config FIRST");
    expect(instructions).toContain("compare_simulations");
    // A paragraph, not a manual.
    expect(instructions.length).toBeLessThan(1_200);
  });

  test("every tool declares itself read-only; only run_config reaches the network", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(tool.name === "run_config");
      expect(tool.annotations?.idempotentHint, tool.name).toBe(tool.name !== "run_config");
    }
  });

  /**
   * Every other test here drives the 2025-era `initialize` handshake (the v2
   * client's default), which is what today's hosts speak; this one pins
   * 2026-07-28, so ONE process provably answers both. The entry decides per
   * connection off the same factory and the same registrations, so what is
   * worth asserting is that the surface and the answers do not move with it.
   */
  test("the same server answers the 2026-07-28 era, not just the legacy handshake", async () => {
    await close();
    await connect({ era: "modern" });
    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getNegotiatedProtocolVersion()).toBe(MODERN_PROTOCOL_VERSION);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual([
      "compare_simulations",
      "explain_message",
      "get_final_config",
      "get_option_docs",
      "get_preset_node",
      "get_preset_tree",
      "get_provenance",
      "get_resolved_config",
      "run_config",
      "simulate",
    ]);

    // A whole drill-down, not just a handshake: the held run survives the era.
    const runId = await runConfig(CONFIG);
    const entry = (await call("get_provenance", { runId, key: "labels" })) as { winner: string };
    expect(entry.winner).toBe("repo");
    // The strictness the tool descriptions promise is schema-level, so it has
    // to hold on both wires.
    await expect(call("get_preset_tree", { runId, dept: 3 })).rejects.toThrow(/dept/);
  });
});

describe("run_config", () => {
  test("returns a handle and a summary, not the trace", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: CONFIG,
    })) as Record<string, unknown>;
    expect(summary.runId).toBe("run-1");
    expect(summary.accepted).toBe(true);
    expect(summary.digest).toContain("Renovate accepted this config");
    expect(summary.treeSummary).toMatchObject({ resolved: 1 });
    expect(summary).not.toHaveProperty("events");
    expect(summary).not.toHaveProperty("finalConfig");
  });

  test("a config Renovate would refuse says so instead of failing", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: '{"labels":5}',
    })) as { accepted: boolean; errors: { message: string }[] };
    expect(summary.accepted).toBe(false);
    expect(summary.errors[0]?.message).toContain("labels");
  });

  test("the withheld-credentials note names THIS transport's opt-ins, not the CLI flags", async () => {
    await close();
    await connect({ env: { GITHUB_TOKEN: "gh-token" } });
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: "{}",
      globalConfig: { endpoint: "https://not-mine.example/api/v3/" },
    })) as { notes?: string[] };
    const note = summary.notes?.join(" ") ?? "";
    expect(note).toContain("credentials withheld");
    expect(note).toContain("trustEndpoints: true");
    expect(note).toContain("platformOverride: true");
    expect(note).not.toContain("--trust-endpoints");
  });
});

describe("credential isolation", () => {
  /**
   * The race the endpoint guard used to lose. Handlers run CONCURRENTLY, so a
   * trusted run installing tokens while an untrusted run is still fetching
   * presets would put those tokens on the untrusted run's remaining requests —
   * to the endpoint that config chose. The credentials now travel on the
   * pipeline input, so no run can observe another's.
   */
  test("two interleaved runs: no request carries the other run's token", async () => {
    await close();
    await connect({ env: { GITHUB_TOKEN: "gh-token" } });
    const before = getPresetAuth();
    const requests: { url: string; authorization: string | null }[] = [];
    vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    const [untrusted, trusted] = await Promise.all([
      call("run_config", {
        fileName: "renovate.json",
        content: '{"extends":["github>attacker/untrusted"]}',
        globalConfig: { endpoint: "https://not-mine.example/api/v3/" },
      }),
      call("run_config", {
        fileName: "renovate.json",
        content: '{"extends":["github>mine/trusted"]}',
        trustEndpoints: true,
      }),
    ]);
    expect((untrusted as { notes?: string[] }).notes?.join(" ")).toContain("credentials withheld");
    expect(trusted).not.toHaveProperty("notes");

    const forUntrusted = requests.filter((r) => r.url.includes("attacker"));
    const forTrusted = requests.filter((r) => r.url.includes("mine"));
    expect(forUntrusted.length).toBeGreaterThan(0);
    expect(forTrusted.length).toBeGreaterThan(0);
    // The whole point: the run whose config chose the endpoint never sent a
    // token, no matter what the concurrent trusted run installed.
    expect(forUntrusted.map((r) => r.authorization)).toEqual(forUntrusted.map(() => null));
    expect(forTrusted.map((r) => r.authorization)).toEqual(forTrusted.map(() => "Bearer gh-token"));
    // Module state is exactly what it was: a run owns its auth for the length
    // of its own queued task and hands it back.
    expect(getPresetAuth()).toEqual(before);
  });

  /**
   * M3 (roadmap 068). The guard used to inspect the GLOBAL CONFIG only — but
   * `endpoint` is also a parameter of this tool, and over MCP the model fills
   * it in, plausibly from text in the repository it was asked to inspect.
   * `run_config({content: '{"extends":["local>me/presets"]}', endpoint:
   * "https://ghe.attacker.example/api/v3/"})` sent RCD_GITHUB_TOKEN there with
   * no opt-in at all. The CLI is unaffected: a person typed the flag.
   */
  test("an endpoint the CALLER chose withholds tokens until it is vouched for", async () => {
    await close();
    await connect({ env: { GITHUB_TOKEN: "gh-token" } });
    const requests: { url: string; authorization: string | null }[] = [];
    vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    const args = {
      fileName: "renovate.json",
      content: '{"extends":["github>elsewhere/presets"]}',
      endpoint: "https://ghe.attacker.example/api/v3/",
    };

    const guarded = (await call("run_config", args)) as { notes?: string[] };
    expect(guarded.notes?.join(" ")).toContain("credentials withheld");
    // `platformOverride` is NOT the opt-in here: it only decides whose
    // endpoint wins, and both candidates are values this caller supplied.
    const overridden = (await call("run_config", { ...args, platformOverride: true })) as {
      notes?: string[];
    };
    expect(overridden.notes?.join(" ")).toContain("credentials withheld");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.map((r) => r.authorization)).toEqual(requests.map(() => null));

    requests.length = 0;
    const vouched = (await call("run_config", { ...args, trustEndpoints: true })) as {
      notes?: string[];
    };
    expect(vouched).not.toHaveProperty("notes");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.authorization === "Bearer gh-token")).toBe(true);
  });

  test("a run never installs its credentials outside the engine's queue", async () => {
    await close();
    await connect({ env: { GITHUB_TOKEN: "gh-token" } });
    setPresetAuth({});
    await runConfig(CONFIG);
    expect(getPresetAuth()).toEqual({});
  });
});

describe("drill-down", () => {
  test("the tree comes without bodies; a body is one node at a time", async () => {
    const runId = await runConfig(CONFIG);
    const tree = (await call("get_preset_tree", { runId })) as {
      root: { children: { name: string }[] };
    };
    expect(tree.root.children[0]?.name).toBe(":dependencyDashboard");
    expect(JSON.stringify(tree)).not.toContain("dependencyDashboardTitle");

    const node = (await call("get_preset_node", {
      runId,
      node: ":dependencyDashboard",
      body: "input",
    })) as { input: { dependencyDashboard: boolean } };
    expect(node.input.dependencyDashboard).toBe(true);
  });

  test("a node's own children are one level, not zero — depth is relative to the query", async () => {
    // Regression: get_preset_node used to pass viewOf an ABSOLUTE depth limit
    // of 1, but config:recommended already sits at depth 1 (root is depth 0),
    // so every real preset was cut before its children ever showed.
    const runId = await runConfig(RECOMMENDED);
    const node = (await call("get_preset_node", {
      runId,
      node: "config:recommended",
    })) as {
      node: {
        children?: { name: string; children?: unknown; childrenOmitted?: number }[];
        childrenOmitted?: number;
      };
    };
    expect(node.node.childrenOmitted).toBeUndefined();
    expect(node.node.children).toBeDefined();
    const children = node.node.children ?? [];
    expect(children.length).toBeGreaterThan(0);
    expect(children.map((c) => c.name)).toContain(":dependencyDashboard");
    // One level only: a grandchild-bearing child summarizes its own children
    // as childrenOmitted rather than recursing into them.
    const grandparent = children.find((c) => c.name === "group:monorepos");
    expect(grandparent?.children).toBeUndefined();
    expect(grandparent?.childrenOmitted).toBeGreaterThan(0);
  });

  test("provenance answers who set a key", async () => {
    const runId = await runConfig(CONFIG);
    const entry = (await call("get_provenance", { runId, key: "labels" })) as {
      winner: string;
      chain: { layer: string }[];
    };
    expect(entry.winner).toBe("repo");
    expect(entry.chain.length).toBeGreaterThan(0);
  });

  /**
   * Roadmap 068 (2 persona sessions + the review): provenance answers "which
   * LAYER set this", and both personas read a static winner as "the value
   * Renovate will use" for an update a packageRule actually overrides.
   */
  test("a key packageRules can also set says so, and points at the simulator", async () => {
    const runId = await runConfig(GROUPED);
    const grouped = (await call("get_provenance", { runId, key: "groupName" })) as {
      note?: string;
    };
    expect(grouped.note).toContain("1 packageRule can set `groupName` per-dependency");
    expect(grouped.note).toContain("Simulate a dependency");
    // A key no rule touches carries no such caveat.
    const labels = (await call("get_provenance", { runId, key: "labels" })) as { note?: string };
    expect(labels.note).toBeUndefined();
  });

  /**
   * Roadmap 071: the two narrowings the ranges point at. The ranges answer
   * "which layer", `rule` answers "what does rule N say" without shipping 714
   * bodies, and `source` answers "just mine".
   */
  test("`rule` returns one merged rule's body, its layer and its index there", async () => {
    const runId = await runConfig(RECOMMENDED_PLUS_RULE);
    const mid = (await call("get_provenance", { runId, key: "packageRules", rule: 300 })) as {
      index: number;
      layer: string;
      sourceIndex: number;
      citation: string;
      rule: Record<string, unknown>;
    };
    expect(mid.index).toBe(300);
    expect(mid.layer).toContain("preset config:recommended");
    expect(mid.sourceIndex).toBe(300);
    expect(mid.rule).toBeTypeOf("object");

    // The caller's own rule, cited in the index scheme they wrote it in.
    const total = (
      (await call("get_provenance", { runId, key: "packageRules" })) as { total: number }
    ).total;
    const own = (await call("get_provenance", {
      runId,
      key: "packageRules",
      rule: total - 1,
    })) as { layer: string; sourceIndex: number; citation: string; rule: unknown };
    expect(own).toMatchObject({ layer: "repo", sourceIndex: 0 });
    expect(own.citation).toContain("packageRules[0]");
    expect(own.rule).toEqual({ matchPackageNames: ["react"], groupName: "react" });
  });

  test("`rule` on a key that is not the rule array names the parameter", async () => {
    const runId = await runConfig(GROUPED);
    await expect(call("get_provenance", { runId, key: "labels", rule: 0 })).rejects.toThrow(
      /`rule`/,
    );
    await expect(call("get_provenance", { runId, key: "labels", source: "repo" })).rejects.toThrow(
      /`source`/,
    );
  });

  test("`source` scopes the ranges to one class of layer, indexes unchanged", async () => {
    const runId = await runConfig(RECOMMENDED_PLUS_RULE);
    const scoped = (await call("get_provenance", {
      runId,
      key: "packageRules",
      source: "repo",
    })) as {
      total: number;
      source: string;
      contributions: { layer: string; from: number; rules?: string[] }[];
    };
    expect(scoped.source).toBe("repo");
    expect(scoped.contributions).toHaveLength(1);
    expect(scoped.contributions[0]?.layer).toBe("repo");
    // The merged index is still the merged index — scoping the view never
    // renumbers the array.
    expect(scoped.contributions[0]?.from).toBe(scoped.total - 1);
    expect(scoped.contributions[0]?.rules?.[0]).toContain(`${scoped.total - 1} matchPackageNames`);
  });

  test("the resolved document keeps internal presets by default", async () => {
    const runId = await runConfig(CONFIG);
    const output = (await call("get_resolved_config", { runId })) as {
      config: { extends: string[] };
    };
    expect(output.config.extends).toEqual([":dependencyDashboard"]);
  });

  /**
   * Roadmap 070: the same two parameters on every config-shaped answer, with
   * a DIFFERENT default per tool — because the documents are different.
   * `get_final_config` is the run's whole effective config, the surface
   * someone debugs a self-hosted globalConfig layer on, so the globalOnly
   * options are the answer there and stay by default. `simulate`'s
   * per-dependency config prunes them (asserted in "simulate and compare").
   */
  test("the effective config keeps the globalOnly options — they are its answer", async () => {
    const runId = await runConfig('{"labels":["deps"]}');
    const payload = (await call("get_final_config", { runId })) as {
      finalConfig: Record<string, unknown>;
      configView: { scope: string; keys: number; droppedGlobalOnly?: number };
    };
    expect(payload.configView.scope).toBe("full");
    expect(payload.configView.droppedGlobalOnly).toBeUndefined();
    expect(payload.finalConfig).toHaveProperty("onboardingConfig");

    // A globalOnly key IS returnable here — the per-tool asymmetry, pinned.
    const keyed = (await call("get_final_config", {
      runId,
      keys: ["labels", "onboardingConfig"],
    })) as { finalConfig: Record<string, unknown>; configView: { keys: number } };
    expect(Object.keys(keyed.finalConfig).toSorted()).toEqual(["labels", "onboardingConfig"]);
    expect(keyed.configView.keys).toBe(2);

    // …and asking for this document at the other scope drops the class.
    const scoped = (await call("get_final_config", {
      runId,
      configScope: "package-rules",
    })) as { finalConfig: Record<string, unknown>; configView: { droppedGlobalOnly?: number } };
    expect(scoped.configView.droppedGlobalOnly).toBe(107);
    expect(scoped.finalConfig).not.toHaveProperty("onboardingConfig");
  });

  test("an expired or invented runId says which runs are held", async () => {
    await expect(call("get_final_config", { runId: "run-404" })).rejects.toThrow(
      /no run "run-404"/,
    );
  });
});

describe("honest empties", () => {
  test("a run that never merged says so instead of answering `{}`", async () => {
    // A parse failure stops the pipeline long before the merge stage.
    const runId = await runConfig("{ not json");
    await expect(call("get_final_config", { runId })).rejects.toThrow(
      /produced no effective config/,
    );
    await expect(call("simulate", { runId, dep: { depName: "react" } })).rejects.toThrow(
      /produced no effective config/,
    );
  });

  test("a body the run never recorded is an explicit null with a note", async () => {
    // An unknown INTERNAL preset: it fails without a network round-trip, so
    // the fixture cannot flake on a rate limit.
    const runId = await runConfig('{"extends":[":nope"]}');
    const node = (await call("get_preset_node", {
      runId,
      node: ":nope",
      body: "resolved",
    })) as { body: string; resolved: unknown; note?: string };
    expect(node.body).toBe("resolved");
    expect(node.resolved).toBeNull();
    expect(node.note).toContain("no `resolved` body");
  });
});

describe("size budget", () => {
  test("a big answer is compact, a small one is readable", async () => {
    const runId = await runConfig(CONFIG);
    expect(await callText("get_provenance", { runId, key: "labels" })).toContain("\n  ");
    const tree = await callText("get_preset_tree", { runId: await runConfig(RECOMMENDED) });
    expect(tree.length).toBeGreaterThan(4_000);
    expect(tree).not.toContain("\n");
  });

  test("keyless provenance is an index, not every chain", async () => {
    const runId = await runConfig(RECOMMENDED);
    const text = await callText("get_provenance", { runId });
    // Was ~634 kB: every non-noop chain step of every key, before and after.
    expect(text.length).toBeLessThan(10_000);
    const payload = JSON.parse(text) as {
      note: string;
      keys: { key: string; winner: string; preview: string }[];
    };
    expect(payload.note).toContain("pass `key`");
    const labels = payload.keys.find((k) => k.key === "labels");
    expect(labels).toMatchObject({ winner: "repo", preview: '["deps"]' });
    expect(labels).not.toHaveProperty("chain");
  });

  test("depth is capped, and the cap explains itself", async () => {
    const runId = await runConfig(RECOMMENDED);
    await expect(call("get_preset_tree", { runId, depth: 99 })).rejects.toThrow(
      /depth|less than or equal to 6|<=6/i,
    );
    const { tools } = await client.listTools();
    const tree = tools.find((t) => t.name === "get_preset_tree");
    expect(JSON.stringify(tree?.inputSchema)).toContain("max 6");
  });

  /**
   * Roadmap 071. This assertion used to be `truncated: true` plus the hint —
   * which passed on an answer holding 2 of 714 rules, because a chain over a
   * CONCATENATED key restates the whole merged array once per layer (733 kB)
   * and the elider could only collapse it to first-and-last.
   *
   * The projection now measures itself and degrades semantically instead, so
   * what is worth pinning is that the answer is COMPLETE: contiguous ranges
   * covering every merged index, and a mid-array rule that is findable by
   * reading rather than by counting.
   */
  test("provenance answers the packageRules question, whole", async () => {
    const runId = await runConfig(RECOMMENDED_PLUS_RULE);
    const text = await callText("get_provenance", { runId, key: "packageRules" });
    expect(text.length).toBeLessThanOrEqual(RESULT_BUDGET_BYTES);
    const payload = JSON.parse(text) as {
      truncated?: boolean;
      total: number;
      mergeSemantics: string;
      note: string;
      contributions: { layer: string; from: number; to: number; count: number; rules?: string[] }[];
    };
    // Not elided at all: the answer fits because of its shape, not its luck.
    expect(payload.truncated).toBeUndefined();
    expect(payload.mergeSemantics).toBe("concat");
    expect(payload.total).toBeGreaterThan(700);

    // Contiguous, from 0, and every merged rule accounted for.
    let next = 0;
    for (const contribution of payload.contributions) {
      expect(contribution.from).toBe(next);
      expect(contribution.count).toBe(contribution.to - contribution.from + 1);
      next = contribution.to + 1;
    }
    expect(next).toBe(payload.total);
    expect(payload.contributions.reduce((sum, c) => sum + c.count, 0)).toBe(payload.total);

    // The rule the caller WROTE is the last one, and it is named as theirs.
    const last = payload.contributions.at(-1);
    expect(last?.layer).toBe("repo");
    expect(last?.from).toBe(payload.total - 1);

    // A mid-array rule is findable by its merged index — no positional
    // counting, which is what the old `{index, layer}` list demanded.
    const lines = payload.contributions.flatMap((c) => c.rules ?? []);
    expect(lines.some((line) => line.startsWith("300 "))).toBe(true);
    expect(lines).toHaveLength(payload.total);

    // The bodies are omitted, and the note names both ways back to them.
    expect(text).not.toContain("semanticCommitType:");
    expect(payload.note).toContain("rule:");
    expect(payload.note).toContain("get_final_config");
  });

  /**
   * The other half of roadmap 071's guard. A key whose FINAL VALUE alone blows
   * the budget is not a `packageRules` case — there is no attribution to
   * compress — but losing the CHAIN to `dropLargestKeys` would drop this
   * tool's actual answer. So the value is previewed and named, and the chain
   * survives.
   */
  test("a key with an enormous value keeps its chain and previews the value", async () => {
    const runId = await runConfig(
      JSON.stringify({ labels: Array.from({ length: 8_000 }, (_, i) => `label-${i}`) }),
    );
    const payload = (await call("get_provenance", { runId, key: "labels" })) as {
      finalValue: string;
      finalValueNote?: string;
      chain?: unknown[];
    };
    expect(typeof payload.finalValue).toBe("string");
    expect(payload.finalValue).toContain("chars)");
    expect(payload.finalValueNote).toContain("get_final_config");
    expect(payload.chain).toBeDefined();
  });

  test("the elision marks what it dropped, in place", async () => {
    const runId = await runConfig(RECOMMENDED);
    const payload = (await call("get_final_config", { runId })) as {
      truncated: boolean;
      finalConfig: { packageRules: { truncated: boolean; shown: number; omitted: number } };
    };
    expect(payload.truncated).toBe(true);
    const rules = payload.finalConfig.packageRules;
    expect(rules.truncated).toBe(true);
    expect(rules.omitted).toBeGreaterThan(0);
    expect(rules.shown).toBeGreaterThan(0);
  });

  /**
   * Roadmap 070: the elision is a transport safety net, not a filter — it
   * shrinks arrays and, at the last resort, deletes whole keys by name. The
   * reduction that answers the question has to happen at CONSTRUCTION, which
   * is what `keys` does: the same run, the same tool, asked precisely, comes
   * back whole.
   */
  test("a keys-projected answer comes back un-elided", async () => {
    const runId = await runConfig(RECOMMENDED);
    const text = await callText("get_final_config", {
      runId,
      keys: ["labels", "dependencyDashboard", "minimumReleaseAge"],
    });
    const payload = JSON.parse(text) as {
      truncated?: boolean;
      omittedKeys?: string[];
      finalConfig: { labels: string[] };
      configView: { withheld?: { key: string }[] };
    };
    // The test above asked the SAME run for the same document unprojected and
    // got it truncated, with `packageRules` cut in place.
    expect(payload.truncated).toBeUndefined();
    expect(payload.omittedKeys).toBeUndefined();
    expect(payload.finalConfig.labels).toEqual(["deps"]);
    expect(text.length).toBeLessThan(1_000);
  });
});

describe("strict input schemas", () => {
  test("a typo'd dependency field is named, not silently dropped", async () => {
    const runId = await runConfig(GROUPED);
    await expect(
      call("simulate", { runId, dep: { depname: "react", currentValue: "17.0.0" } }),
    ).rejects.toThrow(/depname/);
  });

  test("a typo'd tool parameter is named too", async () => {
    const runId = await runConfig(CONFIG);
    await expect(call("get_preset_tree", { runId, dept: 3 })).rejects.toThrow(/dept/);
  });

  test("the advertised schemas forbid unknown keys", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });

  /**
   * The dependency schema is the single biggest thing in `tools/list`, and
   * `compare_simulations` used to carry two verbatim copies of it. One shared
   * zod instance carrying `.meta({ id })` makes the SDK's conversion emit one
   * `$defs` entry and two `$ref`s — a size win only as long as the def itself
   * stays strict, which is what the last assertion is for.
   */
  test("the repeated dependency schema is one $defs entry, still strict", async () => {
    const { tools } = await client.listTools();
    const schema = tools.find((t) => t.name === "compare_simulations")?.inputSchema as
      | {
          properties?: Record<string, { $ref?: string }>;
          $defs?: Record<string, { additionalProperties?: boolean }>;
        }
      | undefined;
    const ref = schema?.properties?.dep?.$ref;
    expect(ref).toBe("#/$defs/dependency");
    expect(schema?.properties?.depB?.$ref).toBe(ref);
    expect(schema?.$defs?.dependency?.additionalProperties).toBe(false);
  });

  /**
   * Roadmap 068, from the persona study: two sessions burned actions on an
   * "Invalid input, Invalid input" rejection that named no field. This pins
   * what the SDK actually reports for the shapes those sessions produced —
   * the zod issue PATH, joined and prefixed — so a schema change that loses
   * the field name is a failing test rather than a lost session. The commonest
   * mistake by far is the first one: `content` is the file's TEXT.
   *
   * This pins the SCHEMA side only: in-process, zod's English locale is
   * installed by its own module-level side effect, so these messages are free
   * here and stay green even when the shipped artifact says `Invalid input`
   * and nothing else. The LOCALE side — that the published bundle still has
   * one — is `test/bundle/mcp-messages.test.ts`, and only that regime can
   * fail for it. Do not read a green run here as proof users see these
   * strings.
   */
  test("a rejected argument names the field, and its type", async () => {
    const errorFor = async (name: string, args: Record<string, unknown>): Promise<string> => {
      const result = (await client.callTool({ name, arguments: args })) as ToolText;
      expect(result.isError, JSON.stringify(args)).toBe(true);
      return result.content[0]?.text ?? "";
    };
    expect(
      await errorFor("run_config", { content: { extends: ["config:recommended"] } }),
    ).toContain("content: Invalid input: expected string, received object");
    expect(await errorFor("run_config", { fileName: "renovate.json" })).toContain(
      "content: Invalid input: expected string, received undefined",
    );
    expect(await errorFor("simulate", { runId: "run-1", dep: { depName: 5 } })).toContain(
      "dep.depName: Invalid input: expected string, received number",
    );
    expect(await errorFor("simulate", { runId: "run-1", dep: {}, verdict: "sometimes" })).toContain(
      'verdict: Invalid option: expected one of "notable"',
    );
    expect(await errorFor("simulate", { runId: "run-1", dep: {}, source: "bogus" })).toContain(
      'source: Invalid option: expected one of "all"',
    );
  });

  test("the content parameter says it wants the file's text", async () => {
    const { tools } = await client.listTools();
    const runConfigTool = tools.find((t) => t.name === "run_config");
    const content = (
      runConfigTool?.inputSchema.properties as { content?: { description?: string } } | undefined
    )?.content;
    expect(content?.description).toContain("JSON *string*");
    expect(content?.description).toContain("not the parsed object");
  });
});

describe("simulate and compare", () => {
  test("updateType is derived, and the verdict carries clause evidence", async () => {
    const runId = await runConfig(GROUPED);
    const sim = (await call("simulate", {
      runId,
      dep: {
        depName: "react",
        packageName: "react",
        currentValue: "17.0.0",
        newValue: "18.0.0",
      },
    })) as {
      dep: { updateType: string };
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
    };
    expect(sim.dep.updateType).toBe("major");
    expect(sim.rules[0]?.verdict).toBe("matched");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({ key: "matchPackageNames" });
  });

  /**
   * H1 (roadmap 068, 6 of 9 persona sessions). The whole `SimulationResult`
   * for `config:recommended` + a react update is 1.36 MB, of which
   * `mergeSteps` is 797 kB and `rawFinalConfig` 199 kB — and the elision spent
   * the budget on them, answering with 2 of 713 rules and no merge trace
   * anyway. The default answer is now the question that was asked.
   */
  test("the merge trace is opt-in, so the verdict is what comes back", async () => {
    const runId = await runConfig(RECOMMENDED);
    const dep = { depName: "react", packageName: "react", currentValue: "17", newValue: "18" };
    const text = await callText("simulate", { runId, dep });
    const parsed = JSON.parse(text) as {
      truncated?: boolean;
      omittedKeys?: string[];
      detailNote: string;
      finalDependencyConfig: Record<string, unknown>;
      configView: { scope: string; keys: number; droppedGlobalOnly?: number };
      flattened: unknown;
      missingInputs: { rules: number; groups: unknown[] };
      rules: { truncated: boolean; shown: number; omitted: number } | unknown[];
    };
    expect(parsed).not.toHaveProperty("mergeSteps");
    expect(parsed).not.toHaveProperty("rawFinalConfig");
    // The omission is stated, with the parameter that undoes it.
    expect(parsed.detailNote).toContain('detail: "full"');
    // The answer itself survives WHOLE — no key was dropped to make room.
    expect(parsed.omittedKeys).toBeUndefined();
    expect(parsed.flattened).toBeDefined();
    expect(Object.keys(parsed.finalDependencyConfig).length).toBeGreaterThan(10);
    /**
     * Roadmap 070: this document is "what applyPackageRules produced for ONE
     * dependency", so the globalOnly class — 107 options a matcher cannot
     * read and a rule cannot write — is provably inert in it and goes by
     * default. The answer states which view produced it.
     */
    expect(parsed.configView).toMatchObject({
      scope: "package-rules",
      droppedGlobalOnly: 107,
    });
    expect(parsed.finalDependencyConfig).not.toHaveProperty("onboardingConfig");
    expect(parsed.finalDependencyConfig).not.toHaveProperty("dryRun");
    expect(parsed.configView.keys).toBe(Object.keys(parsed.finalDependencyConfig).length);
    // The elision shrinks `rules` first — it is the largest array in the
    // payload — so the missing-input aggregate has to outlive it, and be
    // reported by NAME rather than dropped as a key.
    expect(parsed.missingInputs).toBeDefined();
    expect(parsed.missingInputs.rules).toBeGreaterThan(0);
    // And the rule list is a real sample of 713, not a token two.
    const rules = parsed.rules as { shown: number; omitted: number };
    expect(rules.shown + rules.omitted).toBeGreaterThan(700);
    expect(rules.shown).toBeGreaterThan(20);
  });

  /**
   * And the other half of the argument for the default: `full` asks for the
   * merge trace, and a merge step is a whole config snapshot — even this
   * three-line config's is far over the budget, so the answer comes back with
   * the trace elided or dropped BY NAME. That is the honest outcome of asking
   * for it; it is not the shape to spend a call on by accident.
   */
  test('detail: "full" asks for the merge trace, and pays for it', async () => {
    const runId = await runConfig(GROUPED);
    const dep = { depName: "react", packageName: "react" };
    const full = (await call("simulate", { runId, dep, detail: "full" })) as {
      truncated?: boolean;
      omittedKeys?: string[];
      detailNote?: string;
    };
    expect(full.detailNote).toBeUndefined();
    expect(full.truncated).toBe(true);
    expect(full.omittedKeys).toContain("mergeSteps");
    // The default answer for the same question never got that big.
    const verdict = (await call("simulate", { runId, dep })) as { truncated?: boolean };
    expect(verdict.truncated).toBeUndefined();
  });

  /**
   * Roadmap 048. The outcome was derivable from the payload and stated
   * nowhere in it; the web app had been rendering it as one sentence since
   * roadmap 012. It is now the FIRST key of both detail levels — `full` is
   * what a caller reaches for when the projection got in the way, so it must
   * not be the level that loses the answer.
   */
  test("the outcome is one sentence, at every detail level", async () => {
    const runId = await runConfig(AUTOMERGE_MINOR);
    const dep = { depName: "react", currentValue: "17.0.0", newValue: "17.1.0" };
    const sim = (await call("simulate", { runId, dep })) as {
      verdict: { text: string; changedKeys: string[] };
      flattened: {
        appliedBlock: { key: string; authored: boolean; changed: string[] } | null;
        consumedBlocks: unknown[];
        note: string;
      };
    };
    expect(sim.verdict.text).toBe(
      'This minor update WOULD automerge, get labels [deps], and be grouped as "react monorepo".',
    );
    expect(sim.verdict.changedKeys).toContain("automerge");
    expect(sim.flattened.appliedBlock).toMatchObject({ key: "minor", authored: true });
    expect(sim.flattened.note).toBe("the `minor` block merged up and set: `automerge`");

    // `full` asks for the merge trace and a merge step is a whole config
    // snapshot, so this answer is elided — and the sentence is exactly what
    // has to outlive that.
    const full = (await call("simulate", { runId, dep, detail: "full" })) as {
      verdict: { text: string };
      omittedKeys?: string[];
    };
    expect(full.omittedKeys).toContain("mergeSteps");
    expect(full.verdict.text).toBe(sim.verdict.text);
  });

  /**
   * The whole point of putting the answer in a small key: the elider drops the
   * LARGEST top-level keys first, so a ~200-byte sentence outlives the 713-row
   * rule list it is a summary of.
   */
  test("the sentence survives the elision that takes the rules", async () => {
    const runId = await runConfig(RECOMMENDED);
    const dep = { depName: "react", packageName: "react", currentValue: "17", newValue: "18" };
    const parsed = JSON.parse(await callText("simulate", { runId, dep })) as {
      verdict: { text: string };
      flattened: { note: string };
      rules: { shown: number; omitted: number } | unknown[];
    };
    expect(parsed.verdict.text).toContain("This major update");
    expect(parsed.flattened.note).toBeDefined();
    const rules = parsed.rules as { shown: number; omitted: number };
    expect(rules.omitted).toBeGreaterThan(0);
  });

  /** An agent cannot read a field it was never told the shape of: `flattened`
   *  was named once, unexplained, and read as "nothing happened" whenever a
   *  block contributed nothing. */
  test("the tool description explains the flattening fields it answers with", async () => {
    const { tools } = await client.listTools();
    const description = tools.find((t) => t.name === "simulate")?.description ?? "";
    expect(description).toContain("`verdict.text`");
    expect(description).toContain("`appliedBlock`");
    expect(description).toContain("`authoredBlocks`");
    expect(description).toContain("`consumedBlocks`");
    expect(client.getInstructions() ?? "").toContain("`verdict.text`");
  });

  /**
   * Roadmap 070. The `keys` axis composes with the others and only ever
   * narrows: what it names, of what `configScope` left, and a REASON for
   * everything it did not answer with.
   */
  test("keys narrows the per-dependency config, and names what it withheld", async () => {
    const runId = await runConfig(RECOMMENDED);
    const dep = { depName: "react", packageName: "react", currentValue: "17", newValue: "18" };
    const text = await callText("simulate", {
      runId,
      dep,
      keys: ["labels", "automerge", "onboardingConfig"],
    });
    const parsed = JSON.parse(text) as {
      truncated?: boolean;
      finalDependencyConfig: Record<string, unknown>;
      configView: { withheld?: { key: string; reason: string }[] };
      rules: unknown;
    };
    expect(Object.keys(parsed.finalDependencyConfig).toSorted()).toEqual(["automerge", "labels"]);
    // A globalOnly name is not resurrected — it is explained. `absent` and
    // `global-only` are different answers, and a silently empty result is
    // indistinguishable from a bug.
    expect(parsed.configView.withheld).toEqual([
      { key: "onboardingConfig", reason: "global-only" },
    ]);
    // …and `keys` never touches the rule list.
    expect(parsed.rules).toBeDefined();
  });

  test("configScope full is the way back to the whole document", async () => {
    const runId = await runConfig(GROUPED);
    const dep = { depName: "react", packageName: "react" };
    const scoped = (await call("simulate", { runId, dep, configScope: "full" })) as {
      finalDependencyConfig: Record<string, unknown>;
      configView: { scope: string; droppedGlobalOnly?: number };
    };
    expect(scoped.configView).toEqual({
      scope: "full",
      keys: Object.keys(scoped.finalDependencyConfig).length,
    });
    expect(scoped.finalDependencyConfig).toHaveProperty("onboardingConfig");
  });

  test("verdict/source scope the rule list and say what they hid", async () => {
    const runId = await runConfig(GROUPED);
    const dep = { depName: "react", currentValue: "17.0.0", newValue: "18.0.0" };
    const full = (await call("simulate", { runId, dep })) as { rules: unknown[] };
    // GROUPED's rules all match this dep, so `no-match` is the facet that
    // provably hides something.
    const scoped = (await call("simulate", { runId, dep, verdict: "no-match" })) as {
      rules: { verdict: string }[];
      ruleFilter: { verdict: string; total: number; shown: number; hidden: number };
    };
    // An unflagged call keeps the exact payload scripts already parse.
    expect(full).not.toHaveProperty("ruleFilter");
    expect(full.rules.length).toBeGreaterThan(0);
    expect(scoped.rules.every((rule) => rule.verdict === "no-match")).toBe(true);
    expect(scoped.ruleFilter.total).toBe(full.rules.length);
    expect(scoped.ruleFilter.shown).toBe(scoped.rules.length);
    expect(scoped.ruleFilter.hidden).toBe(full.rules.length - scoped.rules.length);
    expect(scoped.ruleFilter.hidden).toBeGreaterThan(0);
  });

  /**
   * The agent-shaped version of the bug: `verdict: "matched"` is the natural
   * ask, and it hides every rule that lost to an unset `dep` field — which
   * report a plain `no-match`. The summary is a sibling of the rule array, so
   * no filter can take it away, and it names the parameter that lists them.
   */
  test('verdict: "matched" still reports the rules an unset field cost', async () => {
    const runId = await runConfig(MIXED_RULES);
    const dep = { depName: "react" };
    const scoped = (await call("simulate", { runId, dep, verdict: "matched" })) as {
      rules: unknown[];
      missingInputs: { rules: number; groups: { fieldList: string; selectors: string[] }[] };
      missingInputsNote: string;
    };
    expect(scoped.rules).toHaveLength(1);
    expect(scoped.missingInputs.rules).toBe(2);
    expect(scoped.missingInputs.groups.map((group) => group.fieldList)).toEqual([
      "depType or depTypes",
      "sourceUrl",
    ]);
    expect(scoped.missingInputsNote).toContain('`verdict: "no-input"` lists them.');
    expect(scoped.missingInputsNote).not.toContain("--verdict");
    // …and it is there without asking, too.
    const unfiltered = (await call("simulate", { runId, dep })) as {
      missingInputs: { rules: number };
    };
    expect(unfiltered.missingInputs.rules).toBe(2);
  });

  test("two runs, one dependency: the edit oracle", async () => {
    const before = await runConfig(CONFIG);
    const after = await runConfig(GROUPED);
    const dep = { depName: "react", packageName: "react" };
    const comparison = (await call("compare_simulations", {
      runId: before,
      runIdB: after,
      dep,
    })) as { verdict: string; summary: string; startedMatching: { label: string }[] };
    expect(comparison.verdict).toBe("differs");
    expect(comparison.startedMatching[0]?.label).toBe("matchPackageNames");
    // Roadmap 068 (4 of 9 persona sessions): the net effect, before anyone has
    // to assemble it out of six arrays.
    expect(comparison.summary).toContain("differs: ");
    expect(comparison.summary).toContain("groupName");
  });

  test("the same run twice changes nothing", async () => {
    const runId = await runConfig(GROUPED);
    const comparison = (await call("compare_simulations", {
      runId,
      dep: { depName: "react", packageName: "react" },
    })) as { verdict: string; summary: string; mode: string };
    expect(comparison.verdict).toBe("identical");
    expect(comparison.summary).toBe(
      "identical: the same rules matched and the same effective config results",
    );
    // One run, one dependency: the caller varied the config (of which there is
    // one), never the dependency — the engine cannot see which and is told.
    expect(comparison.mode).toBe("config");
  });

  /** `identical:` over two sides that both went blind on the same rule is not
   *  an answer about the edit — so each side reports its own input gap. */
  test("each side reports the rules its dependency could not decide", async () => {
    const runId = await runConfig(MIXED_RULES);
    const comparison = (await call("compare_simulations", {
      runId,
      dep: { depName: "react" },
    })) as {
      a: { missingInputs: { rules: number; groups: { fieldList: string }[] } };
      b: { missingInputs: { rules: number } };
      missingInputsNote: string;
      verdict: string;
    };
    expect(comparison.verdict).toBe("identical");
    expect(comparison.a.missingInputs.rules).toBe(2);
    expect(comparison.b.missingInputs.rules).toBe(2);
    expect(comparison.a.missingInputs.groups.map((group) => group.fieldList)).toEqual([
      "depType or depTypes",
      "sourceUrl",
    ]);
    expect(comparison.missingInputsNote).toContain("A — 2 of 4 rules could not match");
    expect(comparison.missingInputsNote).toContain("B — 2 of 4 rules could not match");
    expect(comparison.missingInputsNote).toContain('`verdict: "no-input"` lists them.');
  });
});

/**
 * Roadmap 071. Every tool that quotes a rule INDEX has to say which array the
 * index is in: `simulate` and `get_provenance` cite the merged array,
 * Renovate's validator cites the config as written, and for a config with a
 * preset ahead of its own rules those are different numbers for the same rule.
 * Two personas reported the wrong rule because nothing said so.
 */
describe("rule indexes are cross-linked", () => {
  interface SimRules {
    ruleSources: { layer: string; kind: string; from: number; to: number; count: number }[];
    ruleSourcesNote: string;
    rules: { index: number; verdict: string; origin?: { layer: string; sourceIndex: number } }[];
  }

  test("simulate carries the legend, and the layer inline on matched rows only", async () => {
    const runId = await runConfig(MIXED_RULES);
    const sim = (await call("simulate", {
      runId,
      dep: { depName: "react", packageName: "react" },
    })) as SimRules;
    // The legend covers every rule index, contiguously.
    expect(sim.ruleSources.map((s) => [s.layer, s.from, s.to])).toEqual([
      ["preset :disablePeerDependencies", 0, 0],
      ["repo", 1, 3],
    ]);
    expect(sim.ruleSourcesNote).toContain("index - from");

    const matched = sim.rules.filter((rule) => rule.verdict === "matched");
    expect(matched.length).toBeGreaterThan(0);
    for (const rule of matched) {
      expect(rule.origin).toBeDefined();
    }
    // Not on the other ~700: the legend covers them, and annotating every row
    // costs 15 % of a payload the rule list already dominates.
    for (const rule of sim.rules.filter((r) => r.verdict !== "matched")) {
      expect(rule.origin).toBeUndefined();
    }
    // The one that matched is the reader's own first rule.
    expect(matched[0]?.origin).toEqual({ layer: "repo", sourceIndex: 0 });
  });

  test("a scoped rule list keeps the origin the unscoped one had", async () => {
    const runId = await runConfig(MIXED_RULES);
    const sim = (await call("simulate", {
      runId,
      dep: { depName: "react", packageName: "react" },
      verdict: "matched",
    })) as SimRules;
    expect(sim.rules[0]?.origin).toEqual({ layer: "repo", sourceIndex: 0 });
    expect(sim.ruleSources).toHaveLength(2);
  });

  test("run_config links a validator message to the merged rule it names", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: BAD_SECOND_RULE,
    })) as {
      errors: {
        message: string;
        rule?: { repoIndex: number; mergedIndex: number; note: string };
      }[];
    };
    const error = summary.errors.find((e) => e.message.includes("packageRules[1]"));
    // The preset ahead of it contributes merged rule 0, so the reader's
    // `packageRules[1]` is merged rule 2 — the index simulate would report.
    expect(error?.rule).toMatchObject({ repoIndex: 1, mergedIndex: 2 });
    expect(error?.rule?.note).toContain("merged rule `packageRules[2]`");
  });

  test("a config with no presets still links — 0 to 0 is an answer, not a guess", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: JSON.stringify({
        packageRules: [{ matchPackageNames: ["*", "lodash"], groupName: "everything" }],
      }),
    })) as { errors: { rule?: { repoIndex: number; mergedIndex: number } }[] };
    expect(summary.errors[0]?.rule).toMatchObject({ repoIndex: 0, mergedIndex: 0 });
  });

  test("explain_message carries the same link, by position", async () => {
    const runId = await runConfig(BAD_SECOND_RULE);
    const explained = (await call("explain_message", { runId, errorIndex: 0 })) as {
      rule?: { repoIndex: number; mergedIndex: number };
    };
    expect(explained.rule).toMatchObject({ repoIndex: 1, mergedIndex: 2 });
  });

  test("a run that cannot be attributed carries no link at all", async () => {
    // The preset never resolves, so no layer's rule count is known — and a
    // wrong cross-link is worse than none.
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: JSON.stringify({
        extends: [":thisPresetDoesNotExist"],
        packageRules: [{ matchPackageNames: ["*", "lodash"], groupName: "everything" }],
      }),
    })) as { errors: { message: string; rule?: unknown }[] };
    const error = summary.errors.find((e) => e.message.includes("packageRules[0]"));
    expect(error).toBeDefined();
    expect(error?.rule).toBeUndefined();
  });
});

describe("explain_message and get_option_docs", () => {
  test("a validator message is explained against the run it came from", async () => {
    const runId = await runConfig('{"labels":5}');
    const explained = (await call("explain_message", {
      runId,
      topic: "Configuration Error",
      message: "Configuration option `labels` should be a list (Array)",
    })) as { docsUrl?: string; message: string; severity: string };
    expect(explained.docsUrl).toContain("docs.renovatebot.com");
    expect(explained.severity).toBe("error");
  });

  test("a warning explained through the tool comes back a warning", async () => {
    // A globalOnly option in a repo config is a warning, not an error.
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: '{"dryRun":"full"}',
    })) as { runId: string; warnings: { topic: string; message: string }[] };
    const runId = summary.runId;
    const warning = summary.warnings[0];
    expect(warning).toBeDefined();
    const explained = (await call("explain_message", {
      runId,
      topic: warning?.topic,
      message: warning?.message,
    })) as { severity: string };
    expect(explained.severity).toBe("warning");
  });

  /**
   * The severity used to be "error unless the run's warnings hold this exact
   * text" — so every near miss, and every call without a run, came back a
   * confident `error`. The realistic near miss is not a typo: it is the digest,
   * which quotes the first problem shortened and with the trailing period
   * stripped. An agent pasting that back was told the wrong list with no hint
   * that anything had failed to match.
   */
  test("a message the run does not hold gets severity null, not a guess", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: '{"labels":5}',
    })) as { runId: string; errors: { message: string }[] };
    const full = summary.errors[0]?.message ?? "";
    const nearMiss = `${full.slice(0, Math.floor(full.length / 2))}…`;
    const explained = (await call("explain_message", {
      runId: summary.runId,
      message: nearMiss,
    })) as { severity: string | null; severityNote?: string };
    expect(explained.severity).toBeNull();
    expect(explained.severityNote).toContain("errors");
  });

  test("without a runId nothing decides the severity either", async () => {
    const explained = (await call("explain_message", {
      message: "Configuration option `labels` should be a list (Array)",
    })) as { severity: string | null; severityNote?: string };
    expect(explained.severity).toBeNull();
    expect(explained.severityNote).toMatch(/nothing decided/);
  });

  /**
   * Renovate files WARNINGS under the topic "Configuration Error" too, so an
   * agent that reasons the topic out from the severity it observed gets an
   * exact-match miss. The text alone is the retry tier.
   */
  test("a wrong topic falls back to the text and still finds the warning", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: '{"dryRun":"full"}',
    })) as { runId: string; warnings: { topic: string; message: string }[] };
    expect(summary.warnings[0]?.topic).toBe("Configuration Error");
    const explained = (await call("explain_message", {
      runId: summary.runId,
      topic: "Configuration Warning",
      message: summary.warnings[0]?.message,
    })) as { severity: string | null };
    expect(explained.severity).toBe("warning");
  });

  test("run_config numbers every message, and points at the parameter that takes it", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: '{"labels":5,"dryRun":"full"}',
    })) as {
      errors: { index: number }[];
      warnings: { index: number }[];
      messagesNote?: string;
    };
    expect(summary.errors[0]?.index).toBe(0);
    expect(summary.warnings[0]?.index).toBe(0);
    expect(summary.messagesNote).toContain("errorIndex");
  });

  test("a clean run carries no messagesNote", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: CONFIG,
    })) as Record<string, unknown>;
    expect(summary).not.toHaveProperty("messagesNote");
  });

  test("a message addressed by index needs no text at all", async () => {
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: '{"labels":5,"dryRun":"full"}',
    })) as { runId: string; errors: { message: string }[] };
    const explained = (await call("explain_message", {
      runId: summary.runId,
      errorIndex: 0,
    })) as { severity: string; message: string };
    expect(explained.severity).toBe("error");
    expect(explained.message).toBe(summary.errors[0]?.message);
  });

  test("an indexed warning reaches the fix path", async () => {
    const runId = await runConfig('{"dryRun":"full"}');
    const explained = (await call("explain_message", { runId, warningIndex: 0 })) as {
      severity: string;
      translationKnown: boolean;
      fix?: { summary: string };
    };
    expect(explained.severity).toBe("warning");
    expect(explained.translationKnown).toBe(true);
    expect(explained.fix?.summary).toBeTruthy();
  });

  test("an index that names nothing, or names it twice, is rejected with the reason", async () => {
    const runId = await runConfig('{"labels":5}');
    await expect(call("explain_message", { runId, errorIndex: 4 })).rejects.toThrow(/has 1 errors/);
    await expect(call("explain_message", { errorIndex: 0 })).rejects.toThrow(/runId/);
    await expect(
      call("explain_message", { runId, errorIndex: 0, message: "anything" }),
    ).rejects.toThrow(/exactly once/);
    await expect(call("explain_message", { runId })).rejects.toThrow(/exactly once/);
    await expect(
      call("explain_message", { runId, errorIndex: 0, topic: "Configuration Error" }),
    ).rejects.toThrow(/carries the run's own topic/);
  });

  test("option docs are for the pinned Renovate, and misses point at search", async () => {
    const doc = (await call("get_option_docs", { name: "packageRules" })) as {
      name: string;
      renovateVersion: string;
    };
    expect(doc.name).toBe("packageRules");
    expect(doc.renovateVersion).toMatch(/^\d+\./);
    await expect(call("get_option_docs", { name: "nopeNotAnOption" })).rejects.toThrow(/search/);
  });
});

/**
 * H2 (roadmap 068): a held `config:recommended` trace measured ~165 MB, 76 MB
 * of it events and 75 MB of THAT the logger shim's raw `log` records — which
 * nothing on this path reads. Four held runs were 713 MB of heap, in a process
 * an MCP host keeps alive for the length of a working session.
 */
describe("held runs carry only what the tools read", () => {
  test("a session holds three runs — the before/after oracle needs two", () => {
    expect(DEFAULT_RUN_LIMIT).toBe(3);
  });

  test("the held trace has no log events, and every tool still answers", async () => {
    const store = new RunStore();
    await close();
    await connect({ store });

    const runId = await runConfig(CONFIG);
    const held = store.get(runId);
    expect(held.result.events.length).toBeGreaterThan(0);
    expect(held.result.events.some((event) => event.kind === "log")).toBe(false);

    // Every drill-down answers from the stripped trace: the derivations index
    // stage/migration/preset events, and the tree, provenance and resolved
    // projections read no events at all.
    const summary = (await call("run_config", {
      fileName: "renovate.json",
      content: CONFIG,
    })) as { digest: string; treeSummary: { resolved: number } };
    expect(summary.digest).toContain("Renovate accepted this config");
    expect(summary.treeSummary.resolved).toBe(1);
    const tree = (await call("get_preset_tree", { runId })) as {
      root: { children: unknown[] };
    };
    expect(tree.root.children).toHaveLength(1);
    const provenance = (await call("get_provenance", { runId, key: "labels" })) as {
      winner: string;
    };
    expect(provenance.winner).toBe("repo");
    const resolved = (await call("get_resolved_config", { runId })) as {
      config: { extends: string[] };
    };
    expect(resolved.config.extends).toEqual([":dependencyDashboard"]);
    const explained = (await call("explain_message", {
      runId,
      message: "Configuration option `labels` should be a list (Array)",
    })) as { severity: string | null; message: string };
    // CONFIG is a clean run, so it holds no message with this text and nothing
    // decides its severity — the explanation is still the library's.
    expect(explained.severity).toBeNull();
    expect(explained.message).toContain("labels");
    const sim = (await call("simulate", { runId, dep: { depName: "react" } })) as {
      rules: unknown[];
    };
    expect(Array.isArray(sim.rules)).toBe(true);
  });
});

describe("RunStore", () => {
  test("evicts the oldest run, and keeps the one being drilled into", () => {
    const store = new RunStore(2);
    // eslint-disable-next-line — the store only ever reads `result`/`input` back out
    const fake = { events: [], errors: [], warnings: [] } as unknown as Parameters<
      RunStore["put"]
    >[0];
    const input = { fileName: "renovate.json", content: "{}" };
    const a = store.put(fake, input);
    const b = store.put(fake, input);
    // Touching `a` makes `b` the least recently used.
    store.get(a.runId);
    const c = store.put(fake, input);
    expect(store.size).toBe(2);
    expect(() => store.get(b.runId)).toThrow(/no run/);
    expect(store.get(a.runId).runId).toBe(a.runId);
    expect(store.get(c.runId).runId).toBe(c.runId);
  });
});
