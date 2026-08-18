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
import { buildRuleView, missingInputsNote, ruleFilterPayload } from "../rule-view";
import { digestPayload } from "../projections/digest";
import { CONFIG_SCOPES, projectConfig } from "../projections/config-view";
import {
  describeMessage,
  type MessageSeverity,
  type RuleCrossLink,
  ruleCrossLink,
  repoStageMessage,
} from "../projections/messages";
import {
  collapseRuleMerges,
  comparisonPayload,
  SIMULATE_DETAIL,
  simulationPayload,
  withRuleOrigins,
} from "../projections/simulate";
import {
  entryView,
  indexView,
  perDependencyNote,
  previewValue,
  provenanceOf,
} from "../projections/provenance";
import { oneRuleView, RULE_DIGEST_PLANS, ruleProvenanceView } from "../projections/rule-provenance";
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
import { fitsBudget, textResult } from "./result";
import { type HeldRun, RunStore } from "./run-store";
import { installZodLocale } from "./zod-locale";

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
    "the effective config is too large to return whole — pass `keys: [...]` for the options you care about, ask get_provenance for one `key`, or get_resolved_config for the document without the defaults.",
  tree: "the tree is too large at this depth — lower `depth`, pass a `query`, or query one node with get_preset_node.",
  node: "this node's body is too large to return whole — ask for a deeper child instead, or omit `body` and read the contribution stats.",
  provenance:
    "this key's override chain is too large to return whole — the layers that contributed are listed; ask get_preset_node for the body of the one you care about.",
  resolved:
    'the resolved document is too large to return whole — try mode "keep-internal" without includeDefaults, or read one preset\'s contribution with get_preset_node.',
  simulate:
    "this config has too many packageRules to report whole — the omission is marked; scope the list with `verdict`/`source`, pass `keys: [...]` for the options you care about, or narrow the dependency (a datasource, a depType) so fewer rules report `no-input`.",
  compare:
    "the comparison is too large to return whole — pass `keys: [...]` for the options you care about, narrow the dependency, or ask simulate for one side at a time.",
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
  "releases. simulate answers in one sentence (`verdict.text`) before the evidence. " +
  "Before you propose an edit, prove it: run_config the edited text and " +
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
      "reports `no-input` instead of passing. updateType is derived from currentValue/newValue " +
      "when you omit it. Unknown fields are rejected.",
  )
  // One `$defs.dependency` entry plus `$ref`s instead of the schema inlined
  // per property: `extractDefs` lifts any schema carrying `id` metadata, which
  // is the only dedup the SDK's conversion leaves reachable. Serialization
  // only — validation, and the strictness above, are untouched.
  .meta({ id: "dependency" });

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
 * Roadmap 070: the two config-projection parameters, spelled the same on every
 * tool that answers with a config document. The DEFAULT differs per tool, and
 * deliberately — see `get_final_config` and `simulate` below.
 */
const CONFIG_KEYS = z
  .array(z.string())
  .optional()
  .describe(
    'Only these TOP-LEVEL config options, e.g. ["automerge", "labels"] (no dot paths — the ' +
      "same `key` get_provenance takes). It only ever narrows: a key `configScope` removed is " +
      'not resurrected, it comes back in `configView.withheld` with reason "global-only".',
  );

const CONFIG_SCOPE = z
  .enum(CONFIG_SCOPES)
  .optional()
  .describe(
    "Which CLASS of config key to report: `package-rules` drops the ~107 globalOnly options no " +
      "packageRule can read or write, `full` keeps everything. The answer always states which " +
      "one produced it, in `configView`.",
  );

/**
 * The `packageRules[N]` cross-link for one of a run's own messages, or nothing.
 *
 * Two guards, both roadmap 071: the message must come from the `validate`
 * stage — the global and inherited layers validate their own documents into
 * the same `errors`/`warnings` arrays, and their indexes address a different
 * array — and the run must be attributable at all.
 */
function ruleLinkOf(run: HeldRun, message: ValidationMessage): RuleCrossLink | undefined {
  if (!repoStageMessage(run.result, message)) {
    return undefined;
  }
  return ruleCrossLink(message, "repo", computeRuleProvenance(run.result));
}

/** Each validator message with the position `explain_message` addresses it by.
 *  The array's own index is NOT that position: a large answer is elided
 *  structurally (see ./result), which drops elements out of the middle. */
function withIndex(run: HeldRun, messages: readonly ValidationMessage[]) {
  return messages.map((message, index) => {
    const rule = ruleLinkOf(run, message);
    return { index, ...message, ...(rule ? { rule } : {}) };
  });
}

const MESSAGES_NOTE =
  "explain_message takes these by POSITION — pass this runId with errorIndex/warningIndex (the " +
  "`index` on each message) rather than re-typing the text; a re-typed message that does not " +
  "match the run exactly comes back with severity null.";

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
    errors: withIndex(run, result.errors),
    warnings: withIndex(run, result.warnings),
    ...(result.errors.length + result.warnings.length > 0 ? { messagesNote: MESSAGES_NOTE } : {}),
    presetErrors: facts.presetErrors.map((event) => event.title),
    treeSummary: stats?.summary ?? null,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

const sameMessage = (candidate: ValidationMessage, message: string, topic?: string): boolean =>
  candidate.message === message && (topic === undefined || candidate.topic === topic);

/**
 * Which list the message came from. A warning explained as an error is a
 * misreport an agent then acts on, so the RUN decides — and when the run does
 * not decide it, the answer is `null` rather than a plausible guess. Nothing
 * outside the run's own lists can stand in: Renovate files warnings under the
 * topic "Configuration Error" too, so the topic carries no severity.
 */
function severityOf(
  run: HeldRun | null,
  message: string,
  topic: string | undefined,
): MessageSeverity | null {
  if (!run) {
    return null;
  }
  const inErrors = run.result.errors.some((m) => sameMessage(m, message, topic));
  const inWarnings = run.result.warnings.some((m) => sameMessage(m, message, topic));
  if (inErrors !== inWarnings) {
    return inErrors ? "error" : "warning";
  }
  if (inErrors && inWarnings) {
    // The same text in both lists — the run does not disambiguate it.
    return null;
  }
  // A topic that did not match is the likelier miss than the text: a caller
  // who reasoned the topic out from the severity gets no hit at all. Retry on
  // the text alone; the recursion cannot loop, the second call passes none.
  return topic === undefined ? null : severityOf(run, message, undefined);
}

/** One of a held run's own messages, addressed by position — so its severity
 *  and its topic are the run's by construction and no text has to match. */
function pickMessage(
  run: HeldRun | null,
  list: "errors" | "warnings",
  param: string,
  index: number,
): ValidationMessage {
  if (!run) {
    throw new Error(`${param} indexes into a run's ${list} — pass the runId those came from.`);
  }
  const held = run.result[list];
  const found = held[index];
  if (!found) {
    throw new Error(
      `${run.runId} has ${held.length} ${list}; there is no ${list}[${index}]. ` +
        "run_config lists them, each with the `index` this parameter takes.",
    );
  }
  return found;
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
  // First, and before any argument is validated: the published bundle loses
  // zod's locale to tree-shaking, and without it every rejection reads
  // `Invalid input`. Global config is read when an issue is finalized, so
  // calling it here — after the module-level schema constants — is correct.
  installZodLocale();
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
        "included. Large: pass `keys` for the options you care about. If the question is 'who " +
        "set this option', get_provenance answers it better; if it is 'what would I write " +
        "instead of these presets', use get_resolved_config. This is the RUN's whole config, so " +
        'it reports `configScope: "full"` by default — the globalOnly options are the answer ' +
        "when you are debugging a self-hosted global or inherited layer.",
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({ runId: RUN_ID, keys: CONFIG_KEYS, configScope: CONFIG_SCOPE }),
    },
    answer(({ runId, keys, configScope }) => {
      const projected = projectConfig(finalConfigOf(store.get(runId)), {
        scope: configScope ?? "full",
        ...(keys ? { keys } : {}),
      });
      return { finalConfig: projected.config, configView: projected.view };
    }, HINTS.finalConfig),
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
        "preview. With a key: the full override chain, every layer's before/after. " +
        '`key: "packageRules"` answers differently, because Renovate CONCATENATES that key: you ' +
        "get one contiguous merged-index RANGE per contributing layer plus a one-line digest of " +
        "each rule, never the bodies — `rule: <index>` returns one body, `source` scopes the " +
        "ranges to `repo` or `presets`. This is the tool for 'why is this value what it is': " +
        "read the index, then ask for the one key.",
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        key: z
          .string()
          .optional()
          .describe("A top-level config option, e.g. `labels`. Omit for the index."),
        rule: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'One merged rule by index: its body, its layer and its index inside that layer. `key: "packageRules"` only.',
          ),
        source: RULE_SOURCE,
      }),
    },
    answer(({ runId, key, rule, source }) => {
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
      if (key !== "packageRules") {
        for (const [name, value] of [
          ["rule", rule],
          ["source", source],
        ] as const) {
          if (value !== undefined) {
            throw new Error(
              `\`${name}\` scopes the merged packageRules; key "${key}" is not an array of rules. ` +
                'Drop it, or ask for key: "packageRules".',
            );
          }
        }
        const perDependency = perDependencyNote(key, result.finalConfig);
        const view = {
          ...entryView(entry),
          ...(perDependency ? { note: perDependency } : {}),
        };
        // Last resort before the generic elider gets it: an override chain
        // whose FINAL value alone blows the budget keeps the chain — which is
        // this tool's answer — and previews the value.
        return fitsBudget(view)
          ? view
          : {
              ...view,
              finalValue: previewValue(entry.finalValue, 200),
              finalValueNote:
                "`finalValue` is a preview — the whole value did not fit this answer's budget. " +
                `get_final_config with \`keys: ["${key}"]\` returns it in full.`,
            };
      }
      const attribution = computeRuleProvenance(result);
      const rules = Array.isArray(result.finalConfig?.packageRules)
        ? result.finalConfig.packageRules
        : [];
      if (rule !== undefined) {
        return oneRuleView(rule, attribution, rules);
      }
      // The richest digest that survives the budget WHOLE. Degrading here is
      // semantic (shorter lines, complete ranges); leaving it to the generic
      // elider is structural (2 rules of 727), which is no answer at all.
      const scoped = source ? { source } : {};
      const [richest, ...leaner] = RULE_DIGEST_PLANS;
      let view = ruleProvenanceView(entry, attribution, rules, richest, scoped);
      for (const plan of leaner) {
        if (fitsBudget(view)) {
          break;
        }
        view = ruleProvenanceView(entry, attribution, rules, plan, scoped);
      }
      return view;
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
        "(`finalDependencyConfig`) and `verdict.text`, the whole outcome in one sentence. " +
        "`flattened` is the update-type flattening: `updateType` is this update's type; " +
        "`blocks` are the `major`/`minor`/`patch`/`pin`/`digest`/`lockFileMaintenance`/" +
        "`replacement` blocks the config carried before flattening (Renovate's defaults declare " +
        "all seven, so presence alone means nothing); `authoredBlocks` are the ones a human " +
        "actually wrote; `merged` are the keys the matching block set on the final config; " +
        "`appliedBlock` says whether a block was flattened at all and what it changed — `null` " +
        "means there was no block for this update type, and an empty `changed` means the block " +
        "existed and contributed nothing; `consumedBlocks` are the authored blocks that were " +
        "dropped WITHOUT applying, which is why an option you set may not be in the result. " +
        "`note` states which of those happened. " +
        "A `config:recommended` run has ~700 rules — `verdict` and `source` scope the list " +
        '(`source: "repo"` is "just my own config\'s rules"), and `keys` narrows ' +
        "`finalDependencyConfig` to the options you asked about. " +
        "`ruleSources` is the legend for the rule indexes — one merged-index range per " +
        "contributing layer — and every MATCHED rule carries its own `origin` inline. " +
        "Rules that failed ONLY because " +
        "your `dep` left a field they read unset are summarized in `missingInputs`, whatever " +
        "`verdict` you asked for: they report a plain `no-match`, so every scoped view hides them " +
        'and the answer reads as "nothing matched". The step-by-step merge trace is ' +
        'NOT included unless you ask for detail: "full"; it is the bulk of the payload.',
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        dep: DEP,
        verdict: RULE_VERDICT,
        source: RULE_SOURCE,
        keys: CONFIG_KEYS,
        configScope: CONFIG_SCOPE,
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
    answer(async ({ runId, dep, verdict, source, keys, configScope, detail }, ctx) => {
      const run = store.get(runId);
      const sim = await simulateRun(run, dep, ctx);
      const resolvedDetail = detail ?? "verdict";
      const view = buildRuleView(sim, run.result, {
        verdict: verdict ?? "all",
        source: source ?? "all",
        explicit: true,
        transport: "mcp",
      });
      // `finalDependencyConfig` is by construction "what applyPackageRules
      // produced for ONE dependency", so the globalOnly class is provably
      // inert here and goes by default — the opposite of get_final_config's
      // document, and stated as such in `configView`.
      const payload = simulationPayload(sim, {
        detail: resolvedDetail,
        scope: configScope ?? "package-rules",
        transport: "mcp",
        attribution: view.attribution,
        finalConfig: run.result.finalConfig,
        ...(keys ? { keys } : {}),
      });
      if (verdict === undefined && source === undefined) {
        return { dep: toDependency(dep), ...payload };
      }
      return {
        dep: toDependency(dep),
        ...payload,
        // The scoped list REPLACES the payload's, so it has to carry the same
        // per-rule `origin` — the legend stays either way.
        rules:
          resolvedDetail === "full"
            ? view.rules
            : withRuleOrigins(collapseRuleMerges(view.rules), view.attribution),
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
        "configs, or depB to compare two dependencies against the same config. `keys` narrows " +
        "the delta to the options you care about; `summary` and the verdict booleans always " +
        "describe the WHOLE delta, so narrowing the view never moves the verdict. A side that " +
        "could not evaluate a rule for lack of dependency input reports it in its own " +
        "`missingInputs`: two blind sides agree perfectly, and `identical:` over them is not an " +
        "answer about your edit.",
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        runId: RUN_ID,
        dep: DEP,
        runIdB: z.string().optional().describe("The B-side run. Defaults to runId."),
        depB: DEP.optional().describe("The B-side dependency. Defaults to dep."),
        keys: CONFIG_KEYS,
        configScope: CONFIG_SCOPE,
      }),
    },
    answer(async ({ runId, dep, runIdB, depB, keys, configScope }, ctx) => {
      const a = store.get(runId);
      const b = runIdB ? store.get(runIdB) : a;
      const [simA, simB] = await Promise.all([
        simulateRun(a, dep, ctx),
        simulateRun(b, depB ?? dep, ctx),
      ]);
      // Per side, and outside `comparisonPayload`: the pure diff module states
      // what the two runs did, and a side that never got to evaluate a rule is
      // a fact about that side's INPUT, not about the difference.
      const noteA = missingInputsNote(simA.missingInputs, "mcp");
      const noteB = missingInputsNote(simB.missingInputs, "mcp");
      const combined = [
        ...(noteA ? [`A — ${noteA}`] : []),
        ...(noteB ? [`B — ${noteB}`] : []),
      ].join(" ");
      return {
        a: { runId: a.runId, dep: toDependency(dep), missingInputs: simA.missingInputs },
        b: { runId: b.runId, dep: toDependency(depB ?? dep), missingInputs: simB.missingInputs },
        ...(combined ? { missingInputsNote: combined } : {}),
        ...comparisonPayload(compareSimulations(simA, simB), {
          scope: configScope ?? "package-rules",
          ...(keys ? { keys } : {}),
        }),
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
        "library has no entry for the message, so a bare echo is never ambiguous. Address the " +
        "message BY POSITION — this runId plus errorIndex/warningIndex, the `index` run_config " +
        "reported — and the fix is computed against that exact config snapshot, including the " +
        "edited file text, with the run's own severity and topic. Quoting the text instead " +
        "works, but `severity` is then only as good as the quote: it is the list the run itself " +
        "put the message in, and `null` with a `severityNote` when the run holds no message " +
        "with this text at all.",
      annotations: HELD_RUN_ANNOTATIONS,
      inputSchema: z.strictObject({
        message: z
          .string()
          .optional()
          .describe(
            "The message text, VERBATIM as run_config returned it. Prefer errorIndex/" +
              "warningIndex when you have a runId — a quote that differs by a character cannot " +
              "be matched to the run.",
          ),
        topic: z
          .string()
          .optional()
          .describe(
            "The message's topic, e.g. `Configuration Error`. Only meaningful with `message`.",
          ),
        runId: z.string().optional().describe("The run the message came from."),
        errorIndex: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Position in this runId's `errors` — the `index` run_config reported. Needs runId.",
          ),
        warningIndex: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Position in this runId's `warnings`. Needs runId."),
      }),
    },
    answer(({ message, topic, runId, errorIndex, warningIndex }) => {
      const run = runId ? store.get(runId) : null;
      const config = run ? validatedConfigOf(run.result) : null;
      const text = run?.input.content ?? null;
      const selectors = [message, errorIndex, warningIndex].filter((v) => v !== undefined).length;
      if (selectors !== 1) {
        throw new Error(
          "name the message exactly once: `message` with its verbatim text, or `errorIndex` / " +
            "`warningIndex` from run_config's lists for this runId.",
        );
      }
      if (topic !== undefined && (errorIndex !== undefined || warningIndex !== undefined)) {
        throw new Error(
          "`topic` describes a `message`; an indexed message carries the run's own topic.",
        );
      }
      // The cross-link needs the run the message came from — a re-typed
      // message with no runId is exactly the case that cannot have one.
      const linkOf = (picked: ValidationMessage) => (run ? ruleLinkOf(run, picked) : undefined);
      if (errorIndex !== undefined) {
        const picked = pickMessage(run, "errors", "errorIndex", errorIndex);
        return describeMessage(picked, "error", config, text, linkOf(picked));
      }
      if (warningIndex !== undefined) {
        const picked = pickMessage(run, "warnings", "warningIndex", warningIndex);
        return describeMessage(picked, "warning", config, text, linkOf(picked));
      }
      if (message === undefined) {
        // Unreachable after the count check; keeps `message` narrowed to string.
        throw new Error("`message` is required when no index selects one.");
      }
      const quoted: ValidationMessage = { topic: topic ?? "Configuration Error", message };
      return describeMessage(quoted, severityOf(run, message, topic), config, text, linkOf(quoted));
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
