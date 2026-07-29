import { toSerializable } from "./delta";
import type {
  PlatformContext,
  PresetNode,
  PresetSourceRef,
  TraceEvent,
  ValidationMessage,
} from "./model";

/**
 * Signature of renovate's `parsePreset` (config/presets/parse.js), injected by
 * the pipeline to avoid an import cycle (logger shim → collector → this module
 * → renovate → logger shim).
 */
export type ParsePresetFn = (input: string) => {
  presetSource: string;
  repo?: string;
  presetPath?: string;
  presetName?: string;
  tag?: string;
  params?: string[];
  rawParams?: string;
};

type EmitFn = (event: Omit<TraceEvent, "id" | "stage">) => TraceEvent;

interface Frame {
  /** `existingPresets.length` of the resolveConfigPresets invocation */
  chainLen: number;
  node: PresetNode;
  /**
   * True for the invocation that resolves `node` itself; false for the extra
   * invocations renovate makes for nested object values (packageRules etc.),
   * which report to the same node.
   */
  isMain: boolean;
  /** Node created by the last "Resolving preset" log, awaiting its recursion */
  pendingChild?: PresetNode;
  /** Event id of the pending child's preset-fetch event */
  pendingFetchEventId?: string;
  fetchEventId?: string;
}

const RESOLVING_RE = /^Resolving preset "(.+)"$/;
const ALREADY_SEEN_RE = /^Already seen preset (.+) in \[.*\]$/;
const IGNORING_RE = /^Ignoring preset (.+) in \[.*\]$/;
const FOUND_RE = /^Found preset (.+)$/;
const PARAMS_RE = /^Applied params to preset (.+)$/;

/**
 * Rebuilds the `extends` resolution tree from renovate's own log stream.
 * `resolveConfigPresets` is strictly sequential (one awaited preset at a
 * time), so the entry trace (carrying `existingPresets`, the ancestor chain)
 * and the exit trace ("Resolved config") bracket each subtree exactly like a
 * call stack — which is what `frames` mirrors.
 */
export class PresetTreeBuilder {
  root?: PresetNode;
  private frames: Frame[] = [];
  private counter = 0;
  private seen = new Set<string>();
  private lastErrorNode?: PresetNode;

  constructor(
    private readonly emit: EmitFn,
    private readonly parsePreset?: ParsePresetFn,
    private readonly platformContext?: PlatformContext,
  ) {}

  /** Returns true when the log line was consumed as part of the preset tree. */
  onLog(meta: unknown, msg: string | undefined): boolean {
    if (!msg) {
      return false;
    }
    const metaObj = (meta ?? {}) as Record<string, unknown>;
    if (msg === "resolveConfigPresets") {
      this.onEnter(metaObj);
      return true;
    }
    if (msg === "Resolved config") {
      this.onExit(metaObj);
      return true;
    }
    if (msg === "Preset fetch error") {
      this.onFetchError(metaObj);
      return true;
    }
    if (msg === "Throwing preset error" && typeof metaObj.validationError === "string") {
      if (this.lastErrorNode?.error) {
        this.lastErrorNode.error.message = metaObj.validationError;
      }
      return true;
    }
    const resolving = RESOLVING_RE.exec(msg)?.[1];
    if (resolving !== undefined) {
      this.onResolving(resolving);
      return true;
    }
    const found = FOUND_RE.exec(msg);
    if (found && "presetConfig" in metaObj) {
      const pending = this.top()?.pendingChild;
      if (pending) {
        pending.fetched = toSerializable(metaObj.presetConfig);
      }
      return true;
    }
    const params = PARAMS_RE.exec(msg);
    if (params && "presetConfig" in metaObj) {
      const pending = this.top()?.pendingChild;
      // logged unconditionally by renovate; only meaningful with params
      if (pending?.source?.params?.length) {
        pending.afterParams = toSerializable(metaObj.presetConfig);
      }
      return true;
    }
    const alreadySeen = ALREADY_SEEN_RE.exec(msg)?.[1];
    if (alreadySeen !== undefined) {
      this.addLeaf(alreadySeen, "already-seen");
      return true;
    }
    const ignoring = IGNORING_RE.exec(msg)?.[1];
    if (ignoring !== undefined) {
      this.addLeaf(ignoring, "ignored");
      return true;
    }
    return false;
  }

  /**
   * Returns the tree. Nodes are created in the "aborted" state and upgraded
   * when their resolution completes, so after a thrown preset error everything
   * the abort cut short is still correctly labelled.
   */
  finalize(): PresetNode | undefined {
    this.frames = [];
    return this.root;
  }

  /**
   * The preset currently being fetched, if any. During the preset stage a
   * preset is migrated on fetch between its "Resolving preset" and its
   * `resolveConfigPresets` entry logs, so it is the top frame's `pendingChild`.
   */
  currentPresetName(): string | undefined {
    return this.top()?.pendingChild?.name;
  }

  private top(): Frame | undefined {
    return this.frames.at(-1);
  }

  private onEnter(meta: Record<string, unknown>): void {
    const chain = Array.isArray(meta.existingPresets) ? (meta.existingPresets as string[]) : [];
    const top = this.top();
    if (!top) {
      this.root = {
        id: "root",
        name: "(input config)",
        state: "aborted",
        input: toSerializable(meta.config),
        children: [],
      };
      this.frames.push({ chainLen: chain.length, node: this.root, isMain: true });
      return;
    }
    const pending = top.pendingChild;
    if (pending && chain.length === top.chainLen + 1 && chain.at(-1) === pending.name) {
      pending.input = toSerializable(meta.config);
      this.frames.push({
        chainLen: chain.length,
        node: pending,
        isMain: true,
        fetchEventId: top.pendingFetchEventId,
      });
      top.pendingChild = undefined;
      top.pendingFetchEventId = undefined;
      return;
    }
    // nested object value (packageRules entry etc.) of the same node
    this.frames.push({ chainLen: chain.length, node: top.node, isMain: false });
  }

  private onExit(meta: Record<string, unknown>): void {
    const frame = this.frames.pop();
    if (!frame?.isMain) {
      return;
    }
    frame.node.state = "resolved";
    frame.node.resolved = toSerializable(meta.config);
    if (frame.node !== this.root) {
      this.emit({
        kind: "preset-resolved",
        title: `Resolved preset "${frame.node.name}"`,
        source: frame.node.source,
        parentId: frame.fetchEventId,
        meta: { nodeId: frame.node.id },
      });
    }
  }

  private onResolving(name: string): void {
    const top = this.top();
    if (!top) {
      return;
    }
    const node = this.createNode(name, "aborted", !top.isMain);
    top.node.children.push(node);
    top.pendingChild = node;
    const event = this.emit({
      kind: "preset-fetch",
      title: `Resolving preset "${name}"`,
      source: node.source,
      parentId: top.fetchEventId,
      meta: { nodeId: node.id },
    });
    top.pendingFetchEventId = event.id;
  }

  private onFetchError(meta: Record<string, unknown>): void {
    const preset = typeof meta.preset === "string" ? meta.preset : "(unknown)";
    // Renovate wraps host failures in ExternalHostError, whose OWN message is
    // the constant "external-host-error" — the descriptive message (the one
    // the app's 009 auth-failure detection reads, e.g. "… rate limit or
    // missing token") lives on its `.err`. Unwrapped structurally, not by
    // class: the instance comes from renovate's bundle, not our import graph.
    const raw = meta.err;
    const inner = (raw as { err?: unknown } | undefined)?.err;
    const err = inner instanceof Error ? inner : raw;
    const errMsg = err instanceof Error ? err.message : String(err ?? "unknown error");
    const top = this.top();
    let node = top?.pendingChild;
    if (node?.name !== preset) {
      node = undefined;
    }
    if (!node && top) {
      node = this.createNode(preset, "aborted", !top.isMain);
      top.node.children.push(node);
    }
    const error: ValidationMessage = {
      topic: "Preset fetch error",
      message: `Failed to fetch preset "${preset}": ${errMsg}`,
    };
    if (node) {
      node.state = "error";
      node.error = error;
      this.lastErrorNode = node;
    }
    this.emit({
      kind: "preset-error",
      title: error.message,
      source: node?.source ?? { raw: preset },
      parentId: top?.fetchEventId,
      level: "error",
      messages: [error],
      meta: node ? { nodeId: node.id } : undefined,
    });
  }

  private addLeaf(name: string, state: "already-seen" | "ignored"): void {
    const top = this.top();
    if (!top) {
      return;
    }
    const node = this.createNode(name, state, !top.isMain);
    top.node.children.push(node);
  }

  private createNode(name: string, state: PresetNode["state"], nested: boolean): PresetNode {
    const node: PresetNode = {
      id: `p${++this.counter}`,
      name,
      state,
      source: this.parseSource(name),
      children: [],
    };
    if (nested) {
      node.nested = true;
    }
    if (this.seen.has(name)) {
      node.duplicate = true;
    }
    this.seen.add(name);
    return node;
  }

  private parseSource(raw: string): PresetSourceRef {
    if (!this.parsePreset) {
      return { raw };
    }
    try {
      const parsed = this.parsePreset(raw);
      const ref: PresetSourceRef = {
        raw,
        presetSource: parsed.presetSource as PresetSourceRef["presetSource"],
        repo: parsed.repo,
        presetPath: parsed.presetPath,
        presetName: parsed.presetName,
        tag: parsed.tag,
        params: parsed.params,
      };
      // `local>` (and bare owner/repo) resolves against the run's platform
      // context — record it so the tree can show "via gitlab @ endpoint".
      if (parsed.presetSource === "local" && this.platformContext) {
        ref.platform = this.platformContext.platform;
        ref.endpoint = this.platformContext.endpoint;
      }
      return ref;
    } catch {
      return { raw };
    }
  }
}
