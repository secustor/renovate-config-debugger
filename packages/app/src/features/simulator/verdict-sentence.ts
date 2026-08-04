import type { RuleAttribution, SimulationResult } from "@renovate-config-debugger/engine";

/** A config value in a plain-language sentence: `[a, b]`, `"x"`, `42`. */
function plainValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ")}]`;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/** Oxford-comma join for the verdict sentence's clause lists. */
function joinClauses(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** Renovate's default `schedule` value — "unrestricted", not a real limit
 *  (upstream `config/options/index.ts`: `default: ['at any time']`). It
 *  survives onto `finalDependencyConfig` whenever no rule set a real
 *  schedule, so treating it as one of the update's clauses would quote a
 *  no-op as if it were a restriction. */
function isNoopSchedule(schedule: unknown[]): boolean {
  return schedule.length === 1 && schedule[0] === "at any time";
}

/**
 * Roadmap 013/022: which matched rule turned `automerge: true` on inside a
 * given update-type block (e.g. `minor`), and — only when it's unambiguous —
 * the preset that rule came from, for the verdict sentence's "from
 * `:automergeMinor`" attribution. Best-effort from data the simulator and
 * `computeRuleProvenance` already compute; no new provenance tracking.
 */
function automergeScopeSource(
  sim: SimulationResult,
  updateType: string,
  ruleAttribution: RuleAttribution[] | null | undefined,
): string | undefined {
  const rule = sim.rules.find(
    (r) =>
      r.verdict === "matched" &&
      r.merged?.some(
        (m) =>
          m.key === updateType &&
          typeof m.after === "object" &&
          m.after !== null &&
          !Array.isArray(m.after) &&
          (m.after as Record<string, unknown>).automerge === true,
      ),
  );
  if (!rule) {
    return undefined;
  }
  const attribution = ruleAttribution?.find((a) => a.index === rule.index);
  return attribution?.layer.kind === "preset" ? attribution.layer.name : undefined;
}

/**
 * The plain-language outcome sentence (roadmap 012). Covers the high-signal
 * options — enabled/skipReason, automerge (with update-type scoping and,
 * when known, its source preset), labels, grouping, schedule — splitting
 * them into what the update WOULD and would NOT get, e.g. "This major update
 * WOULD get labels [deploy_pr] and auto-approval, but would NOT automerge
 * (automerge is scoped to minor/patch — from `:automergeMinor`)". Roadmap
 * 022: no-op clauses (an empty label list, the default unrestricted
 * schedule) are left out entirely rather than quoted as if they meant
 * something, so the sentence stays quotable verbatim.
 *
 * Roadmap 046: returned as SEGMENTS rather than one string, so the verdict
 * card can set the modal verbs — the single most information-bearing words the
 * simulator produces — as badges, while `verdictText` below keeps the plain
 * sentence for aria/exports.
 */
export type VerdictSegment = string | { modal: "would" | "would not" };

export function buildVerdictSegments(
  sim: SimulationResult,
  updateType: string | undefined,
  changedKeys: string[],
  ruleAttribution: RuleAttribution[] | null | undefined,
): VerdictSegment[] {
  const c = sim.finalDependencyConfig;
  const subject = `This ${updateType ? `${updateType} ` : ""}update`;
  const changed = new Set(changedKeys);
  const positives: string[] = [];
  const negatives: string[] = [];

  // Strongest signal first: will the PR even be raised?
  const skipReason = typeof c.skipReason === "string" ? c.skipReason : undefined;
  if (c.enabled === false || skipReason !== undefined) {
    negatives.push(
      skipReason ? `be raised at all (skipReason: ${skipReason})` : "be raised (disabled)",
    );
  }

  // automerge, aware of update-type scoping (the flattened blocks).
  const scopedAutomerge = Object.entries(sim.flattened.blocks)
    .filter(([, block]) => block?.automerge === true)
    .map(([type]) => type);
  if (c.automerge === true) {
    positives.push("automerge");
  } else if (scopedAutomerge.length > 0) {
    const sources = scopedAutomerge.map((type) => automergeScopeSource(sim, type, ruleAttribution));
    // Only cite a source when every scoped type traces to the SAME preset —
    // a mixed or unknown provenance is left uncredited rather than guessed.
    const source = sources.every((s) => s !== undefined && s === sources[0])
      ? sources[0]
      : undefined;
    negatives.push(
      `automerge (automerge is scoped to ${scopedAutomerge.join("/")}${source ? ` — from \`${source}\`` : ""})`,
    );
  } else if (c.automerge === false && changed.has("automerge")) {
    negatives.push("automerge");
  }

  if (Array.isArray(c.labels) && c.labels.length > 0) {
    positives.push(`get labels ${plainValue(c.labels)}`);
  }
  if (Array.isArray(c.addLabels) && c.addLabels.length > 0) {
    positives.push(`add labels ${plainValue(c.addLabels)}`);
  }
  if (c.autoApprove === true) {
    positives.push("auto-approval");
  }
  if (typeof c.groupName === "string" && c.groupName.length > 0) {
    positives.push(`be grouped as "${c.groupName}"`);
  }
  if (Array.isArray(c.schedule) && c.schedule.length > 0 && !isNoopSchedule(c.schedule)) {
    positives.push(`only run on schedule ${plainValue(c.schedule)}`);
  }

  if (positives.length === 0 && negatives.length === 0) {
    return [`${subject} gets no special handling from your matched rules — the defaults apply.`];
  }
  const segments: VerdictSegment[] = [`${subject} `];
  if (positives.length > 0) {
    segments.push({ modal: "would" }, ` ${joinClauses(positives)}`);
  }
  if (negatives.length > 0) {
    if (positives.length > 0) {
      segments.push(", but ");
    }
    segments.push({ modal: "would not" }, ` ${joinClauses(negatives)}`);
  }
  segments.push(".");
  return segments;
}
