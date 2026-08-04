import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  compareSimulations,
  computeResolvedConfig,
  computeRuleProvenance,
  type DependencyDescriptor,
  deriveUpdateType,
  getOptionIndex,
  type PipelineInput,
  type ResolvedConfigMode,
  renovateVersion,
  runPipeline,
  simulatePackageRules,
  type SimulationResult,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import { validatedConfigOf } from "@renovate-config-debugger/app/headless";
import { errorMessage, type CliIo } from "../io";
import { digestPayload } from "../projections/digest";
import { describeMessage } from "../projections/messages";
import { entryView, layerLabel, provenanceOf } from "../projections/provenance";
import {
  BODIES,
  DEFAULT_TREE_DEPTH,
  findNode,
  parseBody,
  searchNodes,
  treeStatsOf,
  viewOf,
} from "../projections/tree";
import { applyRunAuth } from "../run-input";
import { type HeldRun, RunStore } from "./run-store";

/**
 * Roadmap 060: the same answers as the subcommands, over MCP.
 *
 * No new functionality — every tool below is a projection module the CLI
 * already uses — so the justification is purely interaction economics: the
 * module graph and the preset-fetch cache are paid once per session, and the
 * drill-down tools query a HELD run instead of re-running the pipeline (and a
 * fresh round of preset API calls) per question.
 *
 * The tool descriptions carry the domain hints an agent would otherwise learn
 * the hard way — above all: preset-node bodies are large, query one node at a
 * time.
 */

const RUN_ID = z.string().describe("A runId returned by run_config.");

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(err: unknown) {
  return {
    content: [{ type: "text" as const, text: errorMessage(err) }],
    isError: true,
  };
}

/** Every tool answers or explains itself; nothing throws across the wire. */
function answer<Args extends unknown[]>(
  // `unknown` covers a promise too — every result is awaited below.
  fn: (...args: Args) => unknown,
): (...args: Args) => Promise<ReturnType<typeof textResult>> {
  return async (...args: Args) => {
    try {
      return textResult(await fn(...args));
    } catch (err) {
      return errorResult(err);
    }
  };
}

/** The dependency descriptor, with `updateType` derived the way a real lookup
 *  would when the caller did not set it. */
function toDependency(dep: Record<string, unknown>): DependencyDescriptor {
  const descriptor = dep as DependencyDescriptor;
  if (descriptor.updateType) {
    return descriptor;
  }
  const derived = deriveUpdateType(
    descriptor.currentValue,
    descriptor.newValue,
    descriptor.versioning,
  );
  return derived ? { ...descriptor, updateType: derived } : descriptor;
}

function simulateRun(run: HeldRun, dep: Record<string, unknown>): Promise<SimulationResult> {
  const config = run.result.finalConfig;
  if (!config) {
    throw new Error(`${run.runId} produced no effective config — nothing to simulate`);
  }
  return simulatePackageRules({ config, dep: toDependency(dep) });
}

function runSummary(run: HeldRun, notes: string[]) {
  const { result, facts } = run;
  const payload = digestPayload(result, facts);
  const stats = result.presetTree ? treeStatsOf(result).stats : null;
  return {
    runId: run.runId,
    renovateVersion: result.renovateVersion,
    accepted: payload.accepted,
    digest: payload.digest,
    stageStatus: result.stageStatus,
    errors: result.errors,
    warnings: result.warnings,
    presetErrors: facts.presetErrors.map((event) => event.title),
    treeSummary: stats?.summary ?? null,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

const DEP_DESCRIPTION =
  "The hypothetical update, as an object: depName, packageName, datasource, manager, depType, " +
  "packageFile, currentValue, currentVersion, newValue, updateType, versioning, sourceUrl, " +
  "registryUrls, categories, baseBranch, currentVersionTimestamp. Every field is optional; a " +
  "matcher whose fields you left unset reports `no-input` rather than silently passing. " +
  "updateType is derived from currentValue/newValue when you omit it.";

export interface McpServerOptions {
  /** Overrides the run store, for tests. */
  store?: RunStore;
}

export function createMcpServer(io: CliIo, options?: McpServerOptions): McpServer {
  const store = options?.store ?? new RunStore();
  const server = new McpServer({
    name: "renovate-config-debugger",
    version: renovateVersion,
    title: "Renovate config debugger",
  });

  server.registerTool(
    "run_config",
    {
      title: "Run a Renovate config",
      description:
        "Resolves a Renovate config exactly as the visualizer does — parse, migrate, massage, " +
        "validate, resolve presets, merge — and HOLDS the trace. Returns a small summary plus a " +
        "runId; every other tool takes that runId, so a whole debugging session describes ONE " +
        "run instead of re-resolving (and re-fetching remote presets) per question. Start here.",
      inputSchema: {
        fileName: z
          .string()
          .default("renovate.json")
          .describe("Drives format detection — renovate.json, renovate.json5, .renovaterc, …"),
        content: z.string().describe("The config file's contents."),
        globalConfig: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Self-hosted global config layer (roadmap 008)."),
        inheritedConfig: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Inherited config layer."),
        platform: z
          .string()
          .optional()
          .describe("Platform context for `local>` presets. Defaults to github."),
        endpoint: z.string().optional().describe("API endpoint for that platform."),
        platformOverride: z
          .boolean()
          .optional()
          .describe("Let platform/endpoint here win over the global config's own values."),
        trustEndpoints: z
          .boolean()
          .optional()
          .describe(
            "Send host tokens even when the global config chooses the endpoint. Off by default: " +
              "a config you did not write must not decide where your credentials go.",
          ),
      },
    },
    answer(async (args) => {
      const input: PipelineInput = {
        fileName: args.fileName,
        content: args.content,
        ...(args.globalConfig ? { globalConfig: args.globalConfig } : {}),
        ...(args.inheritedConfig ? { inheritedConfig: args.inheritedConfig } : {}),
        ...(args.platform ? { platform: args.platform } : {}),
        ...(args.endpoint ? { endpoint: args.endpoint } : {}),
        ...(args.platformOverride ? { platformOverride: true } : {}),
      };
      const notes = applyRunAuth(io.env, input.globalConfig, {
        trustEndpoints: args.trustEndpoints ?? false,
        platformOverride: args.platformOverride ?? false,
      });
      const result: TraceResult = await runPipeline(input);
      return runSummary(store.put(result, input), notes);
    }),
  );

  server.registerTool(
    "get_final_config",
    {
      title: "Effective config",
      description:
        "The effective config the run produced — everything merged, Renovate's defaults " +
        "included. Large. If the question is 'who set this option', get_provenance answers it " +
        "better; if it is 'what would I write instead of these presets', use get_resolved_config.",
      inputSchema: { runId: RUN_ID },
    },
    answer(({ runId }) => ({ finalConfig: store.get(runId).result.finalConfig })),
  );

  server.registerTool(
    "get_preset_tree",
    {
      title: "Preset expansion",
      description:
        "What `extends` expanded into: structure plus per-node contribution stats, NO config " +
        "bodies. A `config:recommended` expansion is over a thousand nodes, so this is depth-" +
        `limited (default ${DEFAULT_TREE_DEPTH}); pass a query to search the whole tree by name ` +
        "instead. Use get_preset_node for one node's body.",
      inputSchema: {
        runId: RUN_ID,
        depth: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(`Levels to include (default ${DEFAULT_TREE_DEPTH}).`),
        query: z
          .string()
          .optional()
          .describe("Return a flat list of matching preset names instead of the tree."),
      },
    },
    answer(({ runId, depth, query }) => {
      const { root, stats } = treeStatsOf(store.get(runId).result);
      return query
        ? { summary: stats.summary, matches: searchNodes(stats, query) }
        : { summary: stats.summary, root: viewOf(root, stats, depth ?? DEFAULT_TREE_DEPTH) };
    }),
  );

  server.registerTool(
    "get_preset_node",
    {
      title: "One preset's contribution",
      description:
        "One node of the expansion, by preset name or by the structural identity get_preset_tree " +
        "reports. PRESET-NODE BODIES ARE LARGE — query one node at a time, and only ask for a " +
        `body when the stats are not enough. Bodies: ${BODIES.join(", ")} (fetched = as served, ` +
        "input = migrated/massaged, resolved = with its own sub-presets merged in).",
      inputSchema: {
        runId: RUN_ID,
        node: z.string().describe("Preset name, or a `a>b>c` structural identity."),
        body: z.enum(BODIES).optional().describe("Omit for structure and stats only."),
      },
    },
    answer(({ runId, node, body }) => {
      const { stats } = treeStatsOf(store.get(runId).result);
      const found = findNode(stats, node);
      const kind = parseBody(body);
      return {
        node: viewOf(found, stats, 1),
        occurrences: stats.occurrencesByName.get(found.name)?.length ?? 1,
        ...(kind ? { body: kind, [kind]: found[kind] } : {}),
      };
    }),
  );

  server.registerTool(
    "get_provenance",
    {
      title: "Who set this option",
      description:
        "Per-key provenance: which layer (defaults / global / inherited / each preset / the repo " +
        "config) set each option, and who overrode whom. Without a key: every option some layer " +
        "beyond the defaults set, with the winning layer. With a key: the full override chain — " +
        "and for `packageRules`, which layer contributed each merged rule. This is the tool for " +
        "'why is this value what it is'.",
      inputSchema: {
        runId: RUN_ID,
        key: z.string().optional().describe("A top-level config option, e.g. `labels`."),
      },
    },
    answer(({ runId, key }) => {
      const { result } = store.get(runId);
      const provenance = provenanceOf(result);
      if (!key) {
        return {
          keys: [...provenance.values()].filter((e) => !e.isDefaultOnly).map(entryView),
        };
      }
      const entry = provenance.get(key);
      if (!entry) {
        throw new Error(`no key "${key}" in the effective config`);
      }
      const rules =
        key === "packageRules"
          ? (computeRuleProvenance(result) ?? []).map((attr) => ({
              index: attr.index,
              layer: layerLabel(attr.layer),
            }))
          : [];
      return { ...entryView(entry), ...(rules.length > 0 ? { rules } : {}) };
    }),
  );

  server.registerTool(
    "get_resolved_config",
    {
      title: "Config without external references",
      description:
        "The equivalent config with hosted presets inlined — what you would write instead of the " +
        "`extends` entries. `keep-internal` (default) keeps Renovate's own `config:*` references; " +
        "`full` expands everything. Defaults may only be included in a fully expanded document " +
        "(in one that still extends presets they would merge after them and override them).",
      inputSchema: {
        runId: RUN_ID,
        mode: z.enum(["keep-internal", "full"]).optional(),
        includeDefaults: z.boolean().optional(),
      },
    },
    answer(({ runId, mode, includeDefaults }) => {
      const resolvedMode: ResolvedConfigMode = mode ?? "keep-internal";
      if (includeDefaults && resolvedMode !== "full") {
        throw new Error('includeDefaults needs mode "full"');
      }
      const output = computeResolvedConfig(store.get(runId).result, resolvedMode, {
        includeDefaults: includeDefaults ?? false,
      });
      if (!output) {
        throw new Error("this document needs a completed preset resolution — validate the config");
      }
      return { mode: resolvedMode, ...output };
    }),
  );

  server.registerTool(
    "simulate",
    {
      title: "Would this update match the rules?",
      description:
        "Evaluates every packageRule of the run's effective config against one hypothetical " +
        "dependency update: a verdict per rule with clause-level evidence (which matcher fired, " +
        "what it read), and the options the matching rules set for that dependency.",
      inputSchema: {
        runId: RUN_ID,
        dep: z.record(z.string(), z.unknown()).describe(DEP_DESCRIPTION),
      },
    },
    answer(async ({ runId, dep }) => {
      const run = store.get(runId);
      const sim = await simulateRun(run, dep);
      return { dep: toDependency(dep), ...sim };
    }),
  );

  server.registerTool(
    "compare_simulations",
    {
      title: "Did my edit change anything?",
      description:
        "The edit oracle. Run the config before your edit and the config after it, then compare " +
        "the two runs against the same dependency — you get the rules that started or stopped " +
        "matching and the key-level delta of the resulting config, or an explicit 'no behavioral " +
        "change'. Pass runIdB to compare two configs, or depB to compare two dependencies " +
        "against the same config.",
      inputSchema: {
        runId: RUN_ID,
        dep: z.record(z.string(), z.unknown()).describe(DEP_DESCRIPTION),
        runIdB: z.string().optional().describe("The B-side run. Defaults to runId."),
        depB: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("The B-side dependency. Defaults to dep."),
      },
    },
    answer(async ({ runId, dep, runIdB, depB }) => {
      const a = store.get(runId);
      const b = runIdB ? store.get(runIdB) : a;
      const [simA, simB] = await Promise.all([simulateRun(a, dep), simulateRun(b, depB ?? dep)]);
      return {
        a: { runId: a.runId, dep: toDependency(dep) },
        b: { runId: b.runId, dep: toDependency(depB ?? dep) },
        ...compareSimulations(simA, simB),
      };
    }),
  );

  server.registerTool(
    "explain_message",
    {
      title: "Explain a validation message",
      description:
        "Translates one of Renovate's validator messages into what it actually means, with a " +
        "docs link and — when the library knows one — a concrete fix. Pass the runId the message " +
        "came from and the fix is computed against that exact config snapshot, including the " +
        "edited file text.",
      inputSchema: {
        message: z.string().describe("The message text, verbatim."),
        topic: z.string().optional().describe("The message's topic, e.g. `Configuration Error`."),
        runId: z.string().optional().describe("The run the message came from."),
      },
    },
    answer(({ message, topic, runId }) => {
      const run = runId ? store.get(runId) : null;
      return describeMessage(
        { topic: topic ?? "Configuration Error", message },
        "error",
        run ? validatedConfigOf(run.result) : null,
        run?.input.content ?? null,
      );
    }),
  );

  server.registerTool(
    "get_option_docs",
    {
      title: "What does this option mean?",
      description:
        `Renovate's own metadata for an option, for the exact pinned version (${renovateVersion}) ` +
        "— type, default, allowed values, where it may appear, deprecation. Use this instead of " +
        "recalling option semantics: they change between Renovate releases.",
      inputSchema: {
        name: z.string().describe("An option name, or a substring with search: true."),
        search: z.boolean().optional().describe("List every option whose name contains `name`."),
      },
    },
    answer(({ name, search }) => {
      const index = getOptionIndex();
      if (search) {
        const needle = name.toLowerCase();
        return {
          renovateVersion,
          matches: [...index.options.values()]
            .filter((doc) => doc.name.toLowerCase().includes(needle))
            .map((doc) => ({ name: doc.name, type: doc.type, description: doc.description })),
        };
      }
      const doc = index.options.get(name);
      if (!doc) {
        throw new Error(
          `Renovate ${renovateVersion} has no option "${name}" — retry with search: true`,
        );
      }
      return { renovateVersion, ...doc, isContainer: index.containers.has(doc.name) };
    }),
  );

  return server;
}
