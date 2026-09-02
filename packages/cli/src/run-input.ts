import { readFile } from "node:fs/promises";
import {
  fetchRepoConfig,
  parseInjectedPreset,
  type PipelineInput,
  type PresetAuth,
  type PresetNode,
  presetInjectionKey,
  type PresetTokenKey,
  type RepoPlatform,
  runPipeline,
  setPresetAuth,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import { parseLayerJson } from "@renovate-config-debugger/app/headless";
import { boolOption, listOption, type OptionName, type ParsedArgs, stringOption } from "./args";
import { CliError, type CliIo, errorMessage } from "./io";
import { buildPipelineInput } from "./questions/pipeline";

/**
 * Turning flags into a `PipelineInput` and running it. Every subcommand that
 * asks a question about a config goes through here, so they all accept the
 * same inputs, the same credentials and the same endpoint guard.
 */

/** The input flags every config-consuming subcommand accepts. */
export const INPUT_OPTIONS: readonly OptionName[] = [
  "stdin",
  "file-name",
  "repo",
  "ref",
  "platform",
  "endpoint",
  "platform-override",
  "global-config",
  "inherited",
  "inject",
  "trust-endpoints",
];

const REPO_PLATFORMS: readonly RepoPlatform[] = ["github", "gitlab", "gitea", "forgejo"];

/**
 * Tokens come from the environment ONLY — never from a flag, where they would
 * land in shell history and in every `ps` listing. `RCD_*` wins; the ambient
 * conventions are the fallback, because agents and CI runners already have
 * them. Coverage is identical to the web app's: the `npm` and `http` preset
 * fetchers have no auth at all.
 */
const HOST_ENV: readonly { key: PresetTokenKey; vars: readonly string[] }[] = [
  { key: "githubToken", vars: ["RCD_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"] },
  { key: "gitlabToken", vars: ["RCD_GITLAB_TOKEN", "GITLAB_TOKEN"] },
  { key: "giteaToken", vars: ["RCD_GITEA_TOKEN"] },
  { key: "forgejoToken", vars: ["RCD_FORGEJO_TOKEN"] },
];

export function tokensFromEnv(env: Readonly<Record<string, string | undefined>>): PresetAuth {
  const auth: PresetAuth = {};
  for (const host of HOST_ENV) {
    for (const name of host.vars) {
      const value = env[name]?.trim();
      if (value) {
        auth[host.key] = value;
        break;
      }
    }
  }
  return auth;
}

function hasTokens(auth: PresetAuth): boolean {
  return Object.values(auth).some((value) => Boolean(value));
}

/**
 * The app's `suppressTokens` guard, carried over (roadmap 058). The preset
 * fetchers send a host's token to whatever endpoint the platform context
 * resolves to — and a global config sets that context. So a token is attached
 * only to an endpoint that came from an explicit flag or the environment,
 * never to one the config under inspection chose, unless the user says the
 * config is trusted.
 */
export interface EndpointTrust {
  /** The caller vouched for the config under inspection. */
  trustEndpoints?: boolean;
  /** The caller's own platform/endpoint wins over the global config's. */
  platformOverride?: boolean;
  /**
   * The endpoint the CALLER supplied, when the caller is not a person.
   *
   * On the CLI this stays unset: a human typed `--endpoint`, which is exactly
   * the "explicit flag" the guard trusts. Over MCP the same value is a tool
   * PARAMETER the model chose — plausibly from text in the very repository it
   * is inspecting — so it is not the user's choice at all, and the guard has
   * to treat it the way it treats an endpoint a config chose.
   *
   * Only the endpoint. `platform` on its own moves a token to that platform's
   * own public API, which is where a token for that platform already goes.
   */
  callerEndpoint?: string;
  /**
   * The endpoint this caller actually supplied, whichever transport — an empty
   * flag value counts as none, as it does for the pipeline input.
   * {@link callerEndpoint} is the subset of it that must not be trusted.
   */
  ownEndpoint?: string;
}

/**
 * How the caller reached us. The guard is one rule with two spellings: on the
 * CLI the opt-ins are flags, over MCP they are tool parameters, and a note
 * that names the wrong one is a dead end for whoever reads it.
 */
export type RunTransport = "cli" | "mcp";

const OPT_IN_WORDING: Record<RunTransport, string> = {
  cli: "Pass `--platform-override` to impose your own endpoint, or `--trust-endpoints` if the config is yours.",
  mcp: "Set `platformOverride: true` to impose your own endpoint, or `trustEndpoints: true` if the config is yours.",
};

/** When the global config chose the `endpoint` and the caller named none,
 *  imposing "your own" endpoint resolves to that same one, so naming the
 *  override here would send the reader nowhere. */
const NO_ENDPOINT_WORDING: Record<RunTransport, string> = {
  cli: "Pass `--endpoint <yours> --platform-override` to send requests somewhere you chose, or `--trust-endpoints` if the config is yours.",
  mcp: "Set `trustEndpoints: true` if the config is yours.",
};

/** The only opt-in that applies when the CALLER, not the config, picked the
 *  endpoint — imposing it harder changes nothing about who chose it. */
const TRUST_WORDING: Record<RunTransport, string> = {
  cli: "Pass `--trust-endpoints` if that endpoint is yours.",
  mcp: "Set `trustEndpoints: true` if that endpoint is yours.",
};

export function endpointTokenPolicy(
  trust: EndpointTrust,
  globalConfig: Record<string, unknown> | undefined,
  transport: RunTransport = "cli",
): { suppress: boolean; reason?: string } {
  if (trust.trustEndpoints) {
    return { suppress: false };
  }
  // The same rule as below, one layer out: the guard asks "did the person
  // whose tokens these are choose where they go?", and over MCP an `endpoint`
  // tool parameter is not that person's answer — the model wrote it, and a
  // config it just read can suggest one. `platformOverride` deliberately does
  // NOT unlock this: it only says whose endpoint wins between two untrusted
  // sources. `trustEndpoints` is the one opt-in that means "I vouch for it".
  // The global-config branch below agrees: the override releases the guard
  // only when it can actually move the destination away from that config's.
  if (trust.callerEndpoint) {
    return {
      suppress: true,
      reason:
        `\`endpoint\` was chosen by the caller (${trust.callerEndpoint}) rather than by the ` +
        "environment this server runs in, so host tokens were NOT sent there. " +
        TRUST_WORDING[transport],
    };
  }
  if (!globalConfig) {
    return { suppress: false };
  }
  const chosen = ["endpoint", "platform"].filter((key) =>
    Object.prototype.hasOwnProperty.call(globalConfig, key),
  );
  if (chosen.length === 0) {
    return { suppress: false };
  }
  // A platform-only global config resolves to that platform's public default
  // endpoint, so the override does move the destination; against an `endpoint`
  // key it moves it only when the caller supplied one of their own.
  const overrideMoves =
    Boolean(trust.ownEndpoint) || !Object.prototype.hasOwnProperty.call(globalConfig, "endpoint");
  if (trust.platformOverride && overrideMoves) {
    return { suppress: false };
  }
  return {
    suppress: true,
    reason:
      `the global config sets ${chosen.map((k) => `\`${k}\``).join(" and ")}, so it — not you — ` +
      "chooses where preset requests go; host tokens were NOT sent. " +
      (overrideMoves ? OPT_IN_WORDING[transport] : NO_ENDPOINT_WORDING[transport]),
  };
}

export interface RunAuth {
  /** The credentials this run may use — `{}` when the guard withheld them. */
  auth: PresetAuth;
  /** Diagnostics for the caller; never part of an answer. */
  notes: string[];
}

/**
 * The credentials a run may use, and what was withheld. Shared by the CLI's
 * input path and the MCP server's `run_config`, so the guard cannot be
 * enforced on one transport and forgotten on the other.
 *
 * It RESOLVES, it does not install: the auth travels on the `PipelineInput`,
 * and the engine installs it inside its own serialized queue. Installing it
 * here would publish it to every run that starts before this one finishes —
 * which, with concurrent MCP handlers, is how run B's tokens end up on run A's
 * fetches to an endpoint A's untrusted global config chose.
 */
export function resolveRunAuth(
  env: Readonly<Record<string, string | undefined>>,
  globalConfig: Record<string, unknown> | undefined,
  trust: EndpointTrust,
  transport: RunTransport,
): RunAuth {
  const auth = tokensFromEnv(env);
  const policy = endpointTokenPolicy(trust, globalConfig, transport);
  return {
    auth: policy.suppress ? {} : auth,
    notes:
      policy.suppress && hasTokens(auth) ? [`credentials withheld: ${policy.reason ?? ""}`] : [],
  };
}

/** A file the user named on the command line, with the flag in the error —
 *  "cannot read a file" is only actionable when it says which flag chose it. */
export async function readTextFile(path: string, what: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    throw new CliError(`cannot read ${what} "${path}": ${errorMessage(err)}`);
  }
}

async function readLayer(
  path: string | undefined,
  flag: string,
): Promise<Record<string, unknown> | undefined> {
  if (!path) {
    return undefined;
  }
  const parsed = parseLayerJson(await readTextFile(path, flag));
  if (parsed.error) {
    throw new CliError(`${flag} "${path}": ${parsed.error}`);
  }
  return parsed.config;
}

/**
 * The config file is the first positional — unless the config comes from
 * stdin or a repository, in which case every positional belongs to the
 * subcommand (`rcd provenance --repo o/r labels`).
 */
export function takeInputFile(args: ParsedArgs): { file?: string; rest: string[] } {
  if (boolOption(args, "stdin") || stringOption(args, "repo")) {
    return { rest: args.positionals };
  }
  const [file, ...rest] = args.positionals;
  return { file, rest };
}

/**
 * Positionals the subcommand never reads are a mistake, not a no-op: `rcd
 * validate a.json b.json` used to validate `a.json` alone and exit `0`, and a
 * second `provenance` key was silently dropped, which read as "the first key's
 * chain is the whole answer". `allowed` counts what the command takes BESIDES
 * its input positional (the config file, an option name for `docs`, or the
 * manifest for `extract`), the same `rest` {@link takeInputFile} hands it.
 */
export function rejectExtraPositionals(args: ParsedArgs, command: string, allowed: number): void {
  const { rest } = takeInputFile(args);
  if (rest.length <= allowed) {
    return;
  }
  const extra = rest
    .slice(allowed)
    .map((value) => `"${value}"`)
    .join(", ");
  const claimed = boolOption(args, "stdin")
    ? "--stdin"
    : stringOption(args, "repo")
      ? "--repo"
      : undefined;
  // A command that takes no argument of its own reads every positional as the
  // config, so "unexpected argument" would be nonsense once a flag supplied it.
  if (allowed === 0 && claimed) {
    throw new CliError(`the config comes from ${claimed}, so ${extra} is not a config file`);
  }
  throw new CliError(`rcd ${command} does not take ${extra} — see \`rcd ${command} --help\``);
}

function repoPlatform(args: ParsedArgs): RepoPlatform {
  const name = stringOption(args, "platform") ?? "github";
  const platform = REPO_PLATFORMS.find((p) => p === name);
  if (!platform) {
    throw new CliError(
      `--repo needs a platform that hosts repositories: ${REPO_PLATFORMS.join(", ")} (got "${name}")`,
    );
  }
  return platform;
}

export interface LoadedInput {
  input: PipelineInput;
  /** Diagnostics for stderr — never part of the answer on stdout. */
  notes: string[];
}

/**
 * Builds the `PipelineInput` and installs the credentials the run may use.
 * `file` is the path a caller took from the positionals; `undefined` means
 * stdin or `--repo` supplies the config.
 */
export async function loadPipelineInput(
  args: ParsedArgs,
  io: CliIo,
  file: string | undefined,
): Promise<LoadedInput> {
  const globalConfig = await readLayer(stringOption(args, "global-config"), "--global-config");
  const inheritedConfig = await readLayer(stringOption(args, "inherited"), "--inherited");

  const { auth, notes } = resolveRunAuth(
    io.env,
    globalConfig,
    {
      trustEndpoints: boolOption(args, "trust-endpoints"),
      platformOverride: boolOption(args, "platform-override"),
      ownEndpoint: stringOption(args, "endpoint"),
    },
    "cli",
  );
  // `--repo` loads the config through the engine's repo-config fetcher, which
  // reads the module-level auth and runs OUTSIDE the pipeline — so the CLI
  // still installs it globally. The run itself is scoped by `presetAuth` on
  // the input below; one process, one config at a time, so the two agree.
  setPresetAuth(auth);

  const repo = stringOption(args, "repo");
  let fileName: string;
  let content: string;
  if (repo) {
    const loaded = await fetchRepoConfig({
      platform: repoPlatform(args),
      repo,
      ...(stringOption(args, "endpoint") ? { endpoint: stringOption(args, "endpoint") } : {}),
      ...(stringOption(args, "ref") ? { ref: stringOption(args, "ref") } : {}),
    });
    fileName = loaded.fileName;
    content = loaded.content;
    notes.push(`loaded ${repo}:${loaded.fileName}`);
  } else if (boolOption(args, "stdin")) {
    fileName = stringOption(args, "file-name") ?? "renovate.json";
    content = await io.readStdin();
  } else if (file) {
    fileName = stringOption(args, "file-name") ?? file.split("/").at(-1) ?? "renovate.json";
    content = await readTextFile(file, "config file");
  } else {
    throw new CliError("no config given — pass a file path, --stdin, or --repo <owner/repo>");
  }

  return {
    input: buildPipelineInput({
      fileName,
      content,
      presetAuth: auth,
      globalConfig,
      inheritedConfig,
      platform: stringOption(args, "platform"),
      endpoint: stringOption(args, "endpoint"),
      platformOverride: boolOption(args, "platform-override"),
    }),
    notes,
  };
}

interface InjectionSpec {
  preset: string;
  path: string;
}

/** `--inject 'github>org/repo=./preset.json'`, split at the LAST `=` so a
 *  parameterized preset string (`preset(key=value)`) survives. */
function parseInjectionSpec(raw: string): InjectionSpec {
  const at = raw.lastIndexOf("=");
  if (at <= 0) {
    throw new CliError(`--inject needs <preset>=<file> (got "${raw}")`);
  }
  return { preset: raw.slice(0, at), path: raw.slice(at + 1) };
}

function collectNodes(node: PresetNode, into: PresetNode[]): PresetNode[] {
  into.push(node);
  for (const child of node.children) {
    collectNodes(child, into);
  }
  return into;
}

function treeNodes(result: TraceResult): PresetNode[] {
  return result.presetTree ? collectNodes(result.presetTree, []) : [];
}

/**
 * Maps `--inject` specs onto the engine's injection registry. The identity a
 * preset string resolves to is Renovate's business, not the CLI's — so the
 * run happens once WITHOUT injections, the named preset is looked up in the
 * resulting tree, and its own `source` produces the key, exactly as the web
 * app's "provide content" action does. No preset-string parser here.
 */
async function withInjections(
  result: TraceResult,
  input: PipelineInput,
  specs: InjectionSpec[],
  notes: string[],
): Promise<TraceResult> {
  const nodes = treeNodes(result);
  const injectedPresets: Record<string, Record<string, unknown>> = {};
  for (const spec of specs) {
    const node = nodes.find((n) => n.name === spec.preset || n.source?.raw === spec.preset);
    if (!node?.source?.presetSource) {
      const candidates = nodes
        .filter((n) => n.state === "error")
        .map((n) => n.name)
        .join(", ");
      throw new CliError(
        `--inject: this run never resolved a preset named "${spec.preset}"` +
          (candidates ? ` (presets that failed: ${candidates})` : ""),
      );
    }
    const text = await readTextFile(spec.path, `--inject content for "${spec.preset}"`);
    let content: Record<string, unknown>;
    try {
      content = parseInjectedPreset(text);
    } catch (err) {
      throw new CliError(`--inject content "${spec.path}": ${errorMessage(err)}`);
    }
    injectedPresets[
      presetInjectionKey({ ...node.source, presetSource: node.source.presetSource })
    ] = content;
  }
  notes.push(`re-ran with ${specs.length} injected preset(s)`);
  return runPipeline({ ...input, injectedPresets });
}

export interface RunOutcome {
  result: TraceResult;
  input: PipelineInput;
  /** Positionals left after the config file was taken. */
  rest: string[];
  notes: string[];
}

/** Resolves ONE config (from `file`, stdin or `--repo`), runs the pipeline,
 *  and applies `--inject` if asked. */
export async function runOne(
  args: ParsedArgs,
  io: CliIo,
  file: string | undefined,
): Promise<Omit<RunOutcome, "rest">> {
  const { input, notes } = await loadPipelineInput(args, io, file);
  let result = await runPipeline(input);
  const specs = listOption(args, "inject").map(parseInjectionSpec);
  if (specs.length > 0) {
    result = await withInjections(result, input, specs, notes);
  }
  return { result, input, notes };
}

/** {@link runOne} for the config named by the flags, plus the positionals the
 *  subcommand still owns. */
export async function runFromArgs(args: ParsedArgs, io: CliIo): Promise<RunOutcome> {
  const { file, rest } = takeInputFile(args);
  return { ...(await runOne(args, io, file)), rest };
}

/**
 * Renovate would refuse this config: the validate stage failed, or the parse
 * before it did. The single source of the `2` exit code.
 */
export function wouldRefuse(result: TraceResult): boolean {
  return result.stageStatus.validate === "error" || result.stageStatus.parse === "error";
}

/**
 * Roadmap 062 (2026-07 persona study): `simulate` (and, then, `compare`) exit
 * 2 whenever an INPUT config would be refused — which says nothing about the
 * answer those commands just gave. Two personas hit the bare `2` with no hint
 * in the output; one ran a control experiment to work out where it came from.
 * So every command whose exit code can be 2 for a reason other than its own
 * answer says which input caused it, in words, on the same output.
 *
 * `simulate`/`group` keep the `2` (their subject is one config, and the
 * contract is documented and hook-relied-upon) and take the default `tail`.
 * `compare` names the same inputs and then says the opposite about its exit
 * code — replay-04 showed its `2` overruling its own "no behavioral change"
 * verdict — so it passes its own tail rather than a second copy of the
 * sentence that names them.
 */
export function refusalNote(
  refused: readonly string[],
  tail = "exit code 2 reflects that, not this command's answer. `rcd validate` lists the messages.",
): string | undefined {
  if (refused.length === 0) {
    return undefined;
  }
  const subject = refused.length === 1 ? refused[0] : refused.join(" and ");
  const verb = refused.length === 1 ? "would be" : "would both be";
  return `note: ${subject} ${verb} refused by Renovate (the parse or validate stage failed) — ${tail}`;
}
