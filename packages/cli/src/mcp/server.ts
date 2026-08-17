import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  compareSimulations,
  computeResolvedConfig,
  computeRuleProvenance,
  type DependencyDescriptor,
  deriveUpdateType,
  getOptionIndex,
  type PipelineInput,
  type PresetNode,
  type ResolvedConfigMode,
  renovateVersion,
  runPipeline,
  simulatePackageRules,
  type SimulationResult,
  type TraceResult,
  type ValidationMessage,
} from "@renovate-config-debugger/engine";
import {
  type SourceFilter,
  validatedConfigOf,
  type VerdictFilter,
} from "@renovate-config-debugger/app/headless";
import pkg from "../../package.json";
import { errorMessage, type CliIo } from "../io";
import { buildRuleView, ruleFilterPayload } from "../rule-view";
import { digestPayload } from "../projections/digest";
import { describeMessage } from "../projections/messages";
import {
  entryView,
  indexView,
  layerLabel,
  perDependencyNote,
  provenanceOf,
} from "../projections/provenance";
import {
  BODIES,
  type BodyKind,
  DEFAULT_TREE_DEPTH,
  findNode,
  parseBody,
  searchNodes,
  treeStatsOf,
  viewOf,
} from "../projections/tree";
import { resolveRunAuth } from "../run-input";
import { textResult } from "./result";
import { type HeldRun, RunStore } from "./run-store";

/**
 * Roadmap 060: the same answers as the subcommands, over MCP.
 *
 * No new functionality — every tool below is a projection module the CLI
 * already uses — so the justification is purely interaction economics: the
 * engine boots once, and `run_config` HOLDS the trace so the drill-down tools
 * query one consistent run instead of re-resolving (and re-fetching remote
 * presets) per question. Only the module graph is amortized across runs;
 * renovate's own preset cache is memCache, which the pipeline initializes and
 * resets per run, so a SECOND `run_config` refetches everything.
 *
 * The tool descriptions carry the domain hints an agent would otherwise learn
 * the hard way — above all: preset-node bodies are large, query one node at a
 * time.
 *
 * Nothing below is era-aware, deliberately: `../commands/mcp` hands this
 * function to the SDK's stdio entry as a factory, and the entry pins one
 * instance per connection to either the 2026-07-28 protocol or the legacy
 * 2025-era handshake. These registrations serve both unchanged.
 *
 * Three protocol details this file takes seriously:
 *
 * - Handlers run CONCURRENTLY. Nothing here mutates shared state except the
 *   run store; the credentials a run may use travel ON the pipeline input
 *   (`presetAuth`), because installing them in the engine's module state from
 *   here would let one run's tokens ride along on another run's fetches.
 * - Input schemas are STRICT. A silently stripped typo gives the agent no
 *   signal; a validation error naming the unknown key lets it self-correct.
 * - Annotations are hints a client trusts by default only in their
 *   worst-case reading, so every tool declares them: read-only,
 *   non-destructive, and open-world only where a run can fetch a remote
 *   preset.
 */

/** Same args + same held run = same answer. */
const HELD_RUN_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * What to do when an answer did not fit the budget (see `./result`): the
 * narrowing THIS tool takes, named. "Output truncated" tells an agent nothing
 * it can act on.
 */
const HINTS = {
  finalConfig:
    "the effective config is too large to return whole — ask get_provenance for one `key`, or get_resolved_config for the document without the defaults.",
  tree: "the tree is too large at this depth — lower `depth`, pass a `query`, or query one node with get_preset_node.",
  node: "this node's body is too large to return whole — ask for a deeper child instead, or omit `body` and read the contribution stats.",
  provenance:
    "this key's override chain is too large to return whole — the layers that contributed are listed; ask get_preset_node for the body of the one you care about.",
  resolved:
    'the resolved document is too large to return whole — try mode "keep-internal" without includeDefaults, or read one preset\'s contribution with get_preset_node.',
  simulate:
    "this config has too many packageRules to report whole — the omission is marked; narrow the dependency (a datasource, a depType) so fewer rules report `no-input`.",
  compare:
    "the comparison is too large to return whole — narrow the dependency, or ask simulate for one side at a time.",
  optionDocs: "too many options matched — search for a longer substring.",
} as const;

const RUN_ID = z.string().describe("A runId returned by run_config.");

const INSTRUCTIONS =
  "Debug one Renovate config at a time. Call run_config FIRST: it resolves the config the way " +
  "Renovate would and returns a runId plus a small summary — `accepted` is the validation " +
  "verdict, `errors`/`warnings` are Renovate's own messages, `digest` is the orientation " +
  "paragraph. Every other tool takes that runId and queries the HELD run, so the whole session " +
  "describes one resolution instead of re-resolving per question. Then drill down ONE question " +
  "at a time: get_provenance with a key for 'who set this value', get_preset_tree and " +
  "get_preset_node for what `extends` expanded into (preset bodies are large — one node per " +
  "call), get_option_docs instead of recalling option semantics, which change between Renovate " +
  "releases. Before you propose an edit, prove it: run_config the edited text and " +
  "compare_simulations the two runs against the same dependency. Everything here is read-only.";

function errorResult(err: unknown) {
  return {
    content: [{ type: "text" as const, text: errorMessage(err) }],
    isError: true,
  };
}

/**
 * The slice of the SDK's handler context this file reads. Narrow on purpose:
 * a structural subset keeps the handlers assignable on both protocol eras.
 */
export interface ToolContext {
  mcpReq: { signal: AbortSignal };
}

class CancelledError extends Error {
  constructor() {
    super("the client cancelled this request");
  }
}

/**
 * The client sent `notifications/cancelled`; the SDK aborted the signal and
 * will drop whatever we answer.
 *
 * Checked twice — on entry, and again immediately before an engine call — for
 * a reason the abort alone does not cover: engine work is SERIALIZED through
 * one queue, so a cancelled call that still enqueues does not merely waste
 * its own time, it holds up every question asked after it. Renovate's config
 * modules are synchronous and stateful, so a run already inside them cannot be
 * interrupted; not starting one is the whole of what is achievable.
 */
function throwIfCancelled(ctx: ToolContext | undefined): void {
  if (ctx?.mcpReq.signal.aborted) {
    throw new CancelledError();
  }
}

/**
 * Every tool answers or explains itself; nothing throws across the wire.
 * `hint` names the narrowing to apply when this tool's answer is too large to
 * return whole (see `./result`).
 */
function answer<Args>(
  // `unknown` covers a promise too — every result is awaited below.
  fn: (args: Args, ctx: ToolContext) => unknown,
  hint?: string,
): (args: Args, ctx: ToolContext) => Promise<ReturnType<typeof textResult>> {
  return async (args: Args, ctx: ToolContext) => {
    try {
      throwIfCancelled(ctx);
      return textResult(await fn(args, ctx), hint);
    } catch (err) {
      return errorResult(err);
    }
  };
}

/**
 * The dependency, as strict as the simulator's own descriptor: a typo'd field
 * is a validation error naming the key, not a matcher that quietly reports
 * `no-input` because nothing it reads was ever set.
 */
const DEP = z
  .strictObject({
    depName: z.string().optional(),
    packageName: z.string().optional(),
    datasource: z.string().optional(),
    manager: z.string().optional(),
    depType: z.string().optional(),
    packageFile: z.string().optional(),
    currentValue: z.string().optional(),
    currentVersion: z.string().optional(),
    lockedVersion: z.string().optional(),
    newValue: z.string().optional(),
    updateType: z
      .enum([
        "major",
        "minor",
        "patch",
        "pin",
        "digest",
        "pinDigest",
        "lockFileMaintenance",
        "lockfileUpdate",
        "rollback",
        "bump",
        "replacement",
      ])
      .optional(),
    isBump: z.boolean().optional(),
    versioning: z.string().optional(),
    sourceUrl: z.string().optional(),
    registryUrls: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    lockFiles: z.array(z.string()).optional(),
    repository: z.string().optional(),
    baseBranch: z.string().optional(),
    currentVersionTimestamp: z.string().optional(),
    mergeConfidenceLevel: z.string().optional(),
  })
  .describe(
    "The hypothetical update. Every field is optional; a matcher whose fields you left unset " +
      "reports `no-input` rather than silently passing. updateType is derived from " +
      "currentValue/newValue when you omit it. Unknown fields are rejected — the field names are " +
      "Renovate's own (depName, packageName, datasource, manager, depType, packageFile, " +
      "currentValue, currentVersion, newValue, updateType, versioning, sourceUrl, registryUrls, " +
      "categories, baseBranch, currentVersionTimestamp, and lockedVersion/lockFiles/isBump/" +
      "repository/mergeConfidenceLevel for the matchers that read them).",
  );

type DepInput = z.infer<typeof DEP>;

/**
 * The rule-list scoping facets, shared with `rcd simulate --verdict/--source`
 * and the web app's rules drawer (both go through `buildRuleView`). The
 * literals are spelled out for zod; `satisfies` keeps them from drifting ahead
 * of the app's `VerdictFilter`/`SourceFilter` unions.
 */
const RULE_VERDICT = z
  .enum(["notable", "all", "matched", "no-input", "no-match"] satisfies readonly VerdictFilter[])
  .optional()
  .describe(
    "Scope the returned rules by verdict: `notable` (matched + unresolved — the app's default " +
      "view), `matched`, `no-input`, `no-match`, or `all`. Omit for the full list.",
  );
const RULE_SOURCE = z
  .enum(["all", "repo", "presets"] satisfies readonly SourceFilter[])
  .optional()
  .describe(
    "Scope the returned rules by origin: `repo` (rules your config wrote) or `presets` " +
      "(rules `extends` pulled in). Omit for all.",
  );

/** The dependency descriptor, with `updateType` derived the way a real lookup
 *  would when the caller did not set it. */
function toDependency(dep: DepInput): DependencyDescriptor {
  const descriptor: DependencyDescriptor = dep;
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

/** The run's effective config, or the reason there is none — an empty object
 *  would read as "Renovate set nothing", which is never what happened. */
function finalConfigOf(run: HeldRun): Record<string, unknown> {
  const config = run.result.finalConfig;
  if (!config) {
    throw new Error(
      `${run.runId} produced no effective config — the run stopped before the merge stage. ` +
        "Check `accepted`, `errors` and `stageStatus` from run_config.",
    );
  }
  return config;
}

function simulateRun(run: HeldRun, dep: DepInput, ctx: ToolContext): Promise<SimulationResult> {
  const input = { config: finalConfigOf(run), dep: toDependency(dep) };
  throwIfCancelled(ctx);
  return simulatePackageRules(input, ctx.mcpReq.signal);
}

/**
 * H1 (roadmap 068, 6 of 9 persona sessions): what a simulate answer carries by
 * default.
 *
 * Measured on `config:recommended` + a react update, the whole
 * `SimulationResult` is 1.36 MB — of which `mergeSteps` is 797 kB (two
 * elements, each a full config snapshot) and `rawFinalConfig` 199 kB. Those
 * two answer "how did the merge proceed", a question nobody asked, and they
 * drowned the one that was: the elision spent its budget on them and returned
 * 2 of 713 rules, with the merge trace dropped whole anyway. Personas at every
 * level asked for the same shape by hand — the matched rules, `flattened` and
 * `finalDependencyConfig`.
 *
 * So the merge trace is opt-in. `full` is the old payload, unchanged, for the
 * caller who is actually stepping through the merge.
 */
const SIMULATE_DETAIL = ["verdict", "full"] as const;
type SimulateDetail = (typeof SIMULATE_DETAIL)[number];

const VERDICT_DETAIL_NOTE =
  "`mergeSteps` and `rawFinalConfig` are omitted at this detail level — on a `config:recommended` " +
  'run they are ~1 MB of the payload and describe how the merge proceeded. Pass detail: "full" ' +
  "for them.";

/** The simulation, at the requested detail. Listed key by key rather than
 *  subtracted from the result, so the default shape is legible here and a
 *  future field has to be admitted on purpose. */
function simulationPayload(sim: SimulationResult, detail: SimulateDetail) {
  if (detail === "full") {
    return sim;
  }
  return {
    rules: sim.rules,
    flattened: sim.flattened,
    finalDependencyConfig: sim.finalDependencyConfig,
    errors: sim.errors,
    warnings: sim.warnings,
    notes: sim.notes,
    detailNote: VERDICT_DETAIL_NOTE,
  };
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

const sameMessage = (candidate: ValidationMessage, message: string, topic?: string): boolean =>
  candidate.message === message && (topic === undefined || candidate.topic === topic);

/**
 * Which list the message came from. A warning explained as an error is a
 * misreport an agent then acts on, so the run — when one is given — decides.
 */
function severityOf(
  run: HeldRun | null,
  message: string,
  topic: string | undefined,
): "error" | "warning" {
  if (run?.result.warnings.some((w) => sameMessage(w, message, topic))) {
    return "warning";
  }
  return "error";
}

/** The body a node holds, or an explicit null saying it holds none — a key
 *  that just vanishes from the JSON is indistinguishable from a bug. */
function bodyOf(node: PresetNode, kind: BodyKind) {
  const body = node[kind];
  if (body === undefined) {
    return {
      body: kind,
      [kind]: null,
      note:
        `this node has no \`${kind}\` body (state: ${node.state}) — it was never reached in that ` +
        `form. The bodies a run records are ${BODIES.join(", ")}; a node that failed to fetch, ` +
        "or a duplicate that was not re-resolved, holds fewer of them.",
    };
  }
  return { body: kind, [kind]: body };
}

export interface McpServerOptions {
  /** Overrides the run store, for tests. */
  store?: RunStore;
}

export function createMcpServer(io: CliIo, options?: McpServerOptions): McpServer {
  const store = options?.store ?? new RunStore();
  const server = new McpServer(
    {
      name: "renovate-config-debugger",
      // The SERVER's version — the Renovate it speaks for is in the title and
      // in every answer that quotes a version.
      version: pkg.version,
      title: `Renovate Config Debugger (Renovate ${renovateVersion})`,
    },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "run_config",
    {
      title: "Run a Renovate config",
      description:
        "Resolves a Renovate config exactly as the web app does — parse, migrate, massage, " +
        "validate, resolve presets, merge — and HOLDS the trace. Returns a small summary plus a " +
        "runId; every other tool takes that runId, so a whole debugging session describes ONE " +
        "run instead of re-resolving (and re-fetching remote presets) per question. Start here.",
      // The one tool that reaches the network: `extends` can name a preset on
      // GitHub, GitLab, Gitea or Forgejo. Not idempotent for the same reason —
      // a remote preset can change between two runs, which is exactly why the
      // other tools query a held run.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.strictObject({
        fileName: z
          .string()
          .default("renovate.json")
          .describe("Drives format detection — renovate.json, renovate.json5, .renovaterc, …"),
        content: z
          .string()
          .describe(
            "The config file's contents, as a JSON *string* — the file's text, not the parsed " +
              "object. Pass it exactly as written, comments and all; parsing it is this tool's job.",
          ),
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
        endpoint: z
          .string()
          .optional()
          .describe(
            "API endpoint for that platform. Setting it WITHHOLDS this server's host tokens " +
              "unless you also set trustEndpoints — you are choosing where credentials would be " +
              "sent, and the config under inspection is allowed to suggest an endpoint.",
          ),
        platformOverride: z
          .boolean()
          .optional()
          .describe("Let platform/endpoint here win over the global config's own values."),
        trustEndpoints: z
          .boolean()
          .optional()
          .describe(
            "Send host tokens even when the global config — or this call's own `endpoint` — " +
              "chooses where preset requests go. Off by default: neither a config you did not " +
              "write nor a value you read out of one may decide where your credentials go.",
          ),
      }),
    },
    answer(async (args, ctx) => {
      const { auth, notes } = resolveRunAuth(
        io.env,
        args.globalConfig,
        {
          trustEndpoints: args.trustEndpoints ?? false,
          platformOverride: args.platformOverride ?? false,
          // The endpoint arrived as a tool PARAMETER: over MCP that is the
          // model's choice, not the user's, and the model may have read it out
          // of the config it is inspecting. Same guard, one layer earlier.
          ...(args.endpoint ? { callerEndpoint: args.endpoint } : {}),
        },
        "mcp",
      );
      const input: PipelineInput = {
        fileName: args.fileName,
        content: args.content,
        // Per-run credentials, installed by the pipeline inside its own
        // serialized queue: handlers run concurrently here, so module-level
        // auth would let a trusting run's tokens leak into a run whose
        // untrusted global config picked the endpoint.
        presetAuth: auth,
        ...(args.globalConfig ? { globalConfig: args.globalConfig } : {}),
        ...(args.inheritedConfig ? { inheritedConfig: args.inheritedConfig } : {}),
        ...(args.platform ? { platform: args.platform } : {}),
        ...(args.endpoint ? { endpoint: args.endpoint } : {}),
        ...(args.platformOverride ? { platformOverride: true } : {}),
      };
      throwIfCancelled(ctx);
      const result: TraceResult = await runPipeline(input, ctx.mcpReq.signal);
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
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({ runId: RUN_ID }),
    },
    answer(({ runId }) => ({ finalConfig: finalConfigOf(store.get(runId)) }), HINTS.finalConfig),
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
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        depth: z
          .number()
          .int()
          .min(0)
          .max(6)
          .optional()
          .describe(
            `Levels to include (default ${DEFAULT_TREE_DEPTH}, max 6). The cap is a size one: ` +
              "a fully expanded `config:recommended` tree is hundreds of kilobytes of JSON. " +
              "To reach deeper, query one node with get_preset_node or search with `query`.",
          ),
        query: z
          .string()
          .optional()
          .describe("Return a flat list of matching preset names instead of the tree."),
      }),
    },
    answer(({ runId, depth, query }) => {
      const { root, stats } = treeStatsOf(store.get(runId).result);
      return query
        ? { summary: stats.summary, matches: searchNodes(stats, query) }
        : { summary: stats.summary, root: viewOf(root, stats, depth ?? DEFAULT_TREE_DEPTH) };
    }, HINTS.tree),
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
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        node: z.string().describe("Preset name, or a `a>b>c` structural identity."),
        body: z.enum(BODIES).optional().describe("Omit for structure and stats only."),
      }),
    },
    answer(({ runId, node, body }) => {
      const { stats } = treeStatsOf(store.get(runId).result);
      const found = findNode(stats, node);
      const kind = parseBody(body);
      const foundDepth = stats.statsById.get(found.id)?.depth ?? 0;
      return {
        node: viewOf(found, stats, foundDepth + 1),
        occurrences: stats.occurrencesByName.get(found.name)?.length ?? 1,
        ...(kind ? bodyOf(found, kind) : {}),
      };
    }, HINTS.node),
  );

  server.registerTool(
    "get_provenance",
    {
      title: "Who set this option",
      description:
        "Per-key provenance: which layer (defaults / global / inherited / each preset / the repo " +
        "config) set each option, and who overrode whom. Without a key: a compact INDEX — every " +
        "option some layer beyond the defaults set, with its winning layer and a short value " +
        "preview. With a key: the full override chain, every layer's before/after — and for " +
        "`packageRules`, which layer contributed each merged rule. This is the tool for 'why is " +
        "this value what it is': read the index, then ask for the one key.",
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        key: z
          .string()
          .optional()
          .describe("A top-level config option, e.g. `labels`. Omit for the index."),
      }),
    },
    answer(({ runId, key }) => {
      const { result } = store.get(runId);
      const provenance = provenanceOf(result);
      if (!key) {
        return {
          note: "index only — pass `key` for that option's full override chain.",
          keys: [...provenance.values()].filter((e) => !e.isDefaultOnly).map(indexView),
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
      const perDependency = perDependencyNote(key, result.finalConfig);
      return {
        ...entryView(entry),
        ...(perDependency ? { note: perDependency } : {}),
        ...(rules.length > 0 ? { rules } : {}),
      };
    }, HINTS.provenance),
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
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        mode: z.enum(["keep-internal", "full"]).optional(),
        includeDefaults: z.boolean().optional(),
      }),
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
    }, HINTS.resolved),
  );

  server.registerTool(
    "simulate",
    {
      title: "Would this update match the rules?",
      description:
        "Evaluates every packageRule of the run's effective config against one hypothetical " +
        "dependency update: a verdict per rule with clause-level evidence (which matcher fired, " +
        "what it read), the options the matching rules set for that dependency " +
        "(`finalDependencyConfig`) and how they got there (`flattened`). " +
        "A `config:recommended` run has ~700 rules — `verdict` and `source` scope the list " +
        '(`source: "repo"` is "just my own config\'s rules"). The step-by-step merge trace is ' +
        'NOT included unless you ask for detail: "full"; it is the bulk of the payload.',
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        dep: DEP,
        verdict: RULE_VERDICT,
        source: RULE_SOURCE,
        detail: z
          .enum(SIMULATE_DETAIL)
          .optional()
          .describe(
            '`verdict` (the default) answers "what matched and what does this dependency end up ' +
              'with"; `full` adds `mergeSteps` and `rawFinalConfig` — ~1 MB on a ' +
              "`config:recommended` run, so ask for it only when you are stepping through the " +
              "merge itself.",
          ),
      }),
    },
    answer(async ({ runId, dep, verdict, source, detail }, ctx) => {
      const run = store.get(runId);
      const sim = await simulateRun(run, dep, ctx);
      const payload = simulationPayload(sim, detail ?? "verdict");
      if (verdict === undefined && source === undefined) {
        return { dep: toDependency(dep), ...payload };
      }
      const view = buildRuleView(sim, run.result, {
        verdict: verdict ?? "all",
        source: source ?? "all",
        explicit: true,
        transport: "mcp",
      });
      return {
        dep: toDependency(dep),
        ...payload,
        rules: view.rules,
        ...(view.notes.length > 0 ? { filterNotes: view.notes } : {}),
        ...ruleFilterPayload(view),
      };
    }, HINTS.simulate),
  );

  server.registerTool(
    "compare_simulations",
    {
      title: "Did my edit change anything?",
      description:
        "The edit oracle. Run the config before your edit and the config after it, then compare " +
        "the two runs against the same dependency — `summary` is the whole verdict in one line " +
        "(`identical: …` / `differs: …`), with the rules that started or stopped matching and " +
        "the key-level delta of the resulting config underneath it. Pass runIdB to compare two " +
        "configs, or depB to compare two dependencies against the same config.",
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        dep: DEP,
        runIdB: z.string().optional().describe("The B-side run. Defaults to runId."),
        depB: DEP.optional().describe("The B-side dependency. Defaults to dep."),
      }),
    },
    answer(async ({ runId, dep, runIdB, depB }, ctx) => {
      const a = store.get(runId);
      const b = runIdB ? store.get(runIdB) : a;
      const [simA, simB] = await Promise.all([
        simulateRun(a, dep, ctx),
        simulateRun(b, depB ?? dep, ctx),
      ]);
      return {
        a: { runId: a.runId, dep: toDependency(dep) },
        b: { runId: b.runId, dep: toDependency(depB ?? dep) },
        ...compareSimulations(simA, simB),
      };
    }, HINTS.compare),
  );

  server.registerTool(
    "explain_message",
    {
      title: "Explain a validation message",
      description:
        "Translates one of Renovate's validator messages into what it actually means, with a " +
        "docs link and — when the library knows one — a concrete fix. It always says which you " +
        "got: `translationKnown` is false, with a `note` explaining why, when the curated " +
        "library has no entry for the message, so a bare echo is never ambiguous. Pass the " +
        "runId the message came from and the fix is computed against that exact config " +
        "snapshot, including the edited file text, and the reported severity is the list the " +
        "run itself put it in.",
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        message: z.string().describe("The message text, verbatim."),
        topic: z.string().optional().describe("The message's topic, e.g. `Configuration Error`."),
        runId: z.string().optional().describe("The run the message came from."),
      }),
    },
    answer(({ message, topic, runId }) => {
      const run = runId ? store.get(runId) : null;
      return describeMessage(
        { topic: topic ?? "Configuration Error", message },
        severityOf(run, message, topic),
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
      // No held run involved — the answer depends only on the pinned Renovate.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.strictObject({
        name: z.string().describe("An option name, or a substring with search: true."),
        search: z.boolean().optional().describe("List every option whose name contains `name`."),
      }),
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
    }, HINTS.optionDocs),
  );

  return server;
}
