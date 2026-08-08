import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMcpServer } from "../src/mcp/server";
import { RunStore } from "../src/mcp/run-store";
import { recordingIo } from "./harness";

/**
 * Roadmap 060: the tool surface, driven through a real MCP client over the
 * SDK's in-memory transport pair — so the schemas, the handlers and the
 * result shapes are exercised exactly as a client would.
 *
 * Thin, like the CLI's own tests: the answers themselves come from the shared
 * projection modules the subcommands use, and the engine's golden↔shimmed
 * suite owns the semantics underneath.
 */

const CONFIG = '{"extends":[":dependencyDashboard"],"labels":["deps"]}';
const GROUPED =
  '{"labels":["deps"],"packageRules":[{"matchPackageNames":["react"],"groupName":"react"}]}';

let client: Client;
let close: () => Promise<void>;

async function connect(): Promise<void> {
  const server = createMcpServer(recordingIo());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  close = async () => {
    await client.close();
    await server.close();
  };
}

/** The one JSON document every tool answers with. */
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  const text = result.content[0]?.text ?? "";
  if (result.isError) {
    throw new Error(text);
  }
  return JSON.parse(text) as unknown;
}

async function runConfig(content: string): Promise<string> {
  const summary = (await call("run_config", { fileName: "renovate.json", content })) as {
    runId: string;
  };
  return summary.runId;
}

beforeEach(connect);
afterEach(() => close());

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

  test("provenance answers who set a key", async () => {
    const runId = await runConfig(CONFIG);
    const entry = (await call("get_provenance", { runId, key: "labels" })) as {
      winner: string;
    };
    expect(entry.winner).toBe("repo");
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

  test("two runs, one dependency: the edit oracle", async () => {
    const before = await runConfig(CONFIG);
    const after = await runConfig(GROUPED);
    const dep = { depName: "react", packageName: "react" };
    const comparison = (await call("compare_simulations", {
      runId: before,
      runIdB: after,
      dep,
    })) as { noChange: boolean; matchedOnlyInB: { label: string }[] };
    expect(comparison.noChange).toBe(false);
    expect(comparison.matchedOnlyInB[0]?.label).toBe("matchPackageNames");
  });

  test("the same run twice changes nothing", async () => {
    const runId = await runConfig(GROUPED);
    const comparison = (await call("compare_simulations", {
      runId,
      dep: { depName: "react", packageName: "react" },
    })) as { noChange: boolean };
    expect(comparison.noChange).toBe(true);
  });
});

describe("explain_message and get_option_docs", () => {
  test("a validator message is explained against the run it came from", async () => {
    const runId = await runConfig('{"labels":5}');
    const explained = (await call("explain_message", {
      runId,
      topic: "Configuration Error",
      message: "Configuration option `labels` should be a list (Array)",
    })) as { docsUrl?: string; message: string };
    expect(explained.docsUrl).toContain("docs.renovatebot.com");
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
