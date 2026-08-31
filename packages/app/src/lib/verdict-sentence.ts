import type { RuleAttribution, SimulationResult } from "@renovate-config-debugger/engine";
import { pluralWord } from "./format";
import { isFailingClause } from "./rule-verdict";

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
 * WOULD get labels [deploy_pr] and get auto-approval, but would NOT automerge
 * (your config enables automerge only for minor/patch updates — from
 * `:automergeMinor`)". Roadmap 022: no-op clauses (an empty label list, the
 * default unrestricted schedule) are left out entirely rather than quoted as
 * if they meant something, so the sentence stays quotable verbatim. Replay-02
 * N4: every positive is a verb phrase so the shared "would" distributes over
 * any ordering, and the automerge parenthetical attributes the scoping to
 * THIS config — `automerge` is a perfectly valid top-level option, and "is
 * scoped to" taught a false general rule when quoted.
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
      `automerge (your config enables automerge only for ${scopedAutomerge.join("/")} updates${source ? ` — from \`${source}\`` : ""})`,
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
    positives.push("get auto-approval");
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

/**
 * The segments as the card renders them — modals upper-cased, which is the
 * emphasis the sentence was written around. The one text for the transcript,
 * aria and the CLI, so a screenshot and `rcd simulate` never disagree.
 */
export function verdictText(segments: VerdictSegment[]): string {
  return segments.map((s) => (typeof s === "string" ? s : s.modal.toUpperCase())).join("");
}

/**
 * Replay-02 R3: the verdict card's honesty caveat. A rule from the user's own
 * config that reached "no match" SOLELY through fail-closed `no-input` clauses
 * lost to an empty simulator field, not to the user's data — without saying
 * so, the card manufactures a confident-looking "no match" that may not
 * reflect a real Renovate run. Field-agnostic by construction: it names
 * whatever `readFields` the deciding clauses consulted. Scoped to repo-config
 * rules (via `ruleAttribution`) because preset rules failing on unset
 * side-channel fields is the norm on every run, not a signal.
 */
export function buildNoInputCaveat(
  sim: SimulationResult,
  ruleAttribution: RuleAttribution[] | null | undefined,
): string | undefined {
  if (!ruleAttribution) {
    return undefined;
  }
  const repoRules = new Set(
    ruleAttribution.filter((a) => a.layer.kind === "repo").map((a) => a.index),
  );
  const fields = new Set<string>();
  let count = 0;
  for (const rule of sim.rules) {
    if (rule.verdict !== "no-match" || !repoRules.has(rule.index)) {
      continue;
    }
    const failing = rule.clauses.filter(isFailingClause);
    if (failing.length === 0 || !failing.every((c) => c.state === "no-input")) {
      continue;
    }
    count++;
    for (const clause of failing) {
      for (const field of clause.readFields) {
        fields.add(field);
      }
    }
  }
  if (count === 0) {
    return undefined;
  }
  const named = [...fields].join(", ");
  return `${count} of your ${pluralWord(count, "rule")} failed only because a field was left unset in this simulation (${named}) — this result may not reflect a real Renovate run.`;
}
