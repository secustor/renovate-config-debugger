import type { DependencyDescriptor, SimulationResult } from "@renovate-config-debugger/engine";
import { plural } from "@renovate-config-debugger/app/headless";
import type { RunTransport } from "../run-input";

/**
 * Roadmap 074: the group-level answer over SEVERAL simulated updates.
 *
 * `simulate` is one-dependency-at-a-time by construction, so "would this group
 * actually reach its `minimumGroupSize`" was unanswerable — both replay-03
 * entry sessions on the 44529 scenario named exactly this gap, and their only
 * honest option was a hedge. This module is plain arithmetic over N existing
 * simulations: each update's per-dependency config names the group it lands in
 * and the threshold it carries; the tally states which groups form.
 *
 * Deliberately NOT a branch simulator: Renovate's branchifier splits by
 * branchName templates, `separateMajorMinor` and friends. The tally answers
 * the grouping question the rules decide — `groupName` membership and the
 * `minimumGroupSize` gate — and says so.
 */

/** One simulated update, as the tally identifies it back to the caller. */
export interface GroupMember {
  depName?: string;
  updateType?: string;
}

export interface GroupView {
  groupName: string;
  /** `groupSlug` when a member's config set one — branch names build on it. */
  groupSlug?: string;
  members: GroupMember[];
  size: number;
  /** The gate the verdict is measured against — the largest value any member
   *  carries, when they disagree (see `minimumGroupSizeValues`). */
  minimumGroupSize: number;
  /** Present only when members carry DIFFERENT values: rule-scoped
   *  `minimumGroupSize` makes the effective gate ordering-dependent inside
   *  Renovate, so the tally takes the conservative one and names the spread. */
  minimumGroupSizeValues?: number[];
  /** `size >= minimumGroupSize` — whether these updates alone meet the gate. */
  wouldForm: boolean;
  /** The claim in one citable sentence. */
  verdict: string;
}

export interface GroupTally {
  updates: number;
  groups: GroupView[];
  /** Updates no rule put in a group — each would get its own PR. */
  ungrouped: GroupMember[];
  notes: string[];
}

const SCOPE_NOTE =
  "This tally is over the updates YOU supplied — Renovate evaluates minimumGroupSize against " +
  "the repository's real pending updates at run time, so a group that would wait here can " +
  "still form when more updates are pending.";

const BRANCH_NOTE =
  "Membership is by groupName as the rules resolved it per update. Branch splitting " +
  "(separateMajorMinor, separateMultipleMajor, custom branchName templates) is not modeled.";

function memberOf(dep: DependencyDescriptor): GroupMember {
  return {
    ...(dep.depName ? { depName: dep.depName } : {}),
    ...(dep.updateType ? { updateType: dep.updateType } : {}),
  };
}

function minimumOf(config: Record<string, unknown>): number {
  const raw = config["minimumGroupSize"];
  // Renovate's default: no threshold — one update is enough.
  return typeof raw === "number" && raw >= 1 ? raw : 1;
}

function verdictOf(view: Omit<GroupView, "verdict">): string {
  const updates = view.size === 1 ? "1 update" : `${view.size} updates`;
  if (view.minimumGroupSize <= 1) {
    return `"${view.groupName}" forms from ${updates} — no minimumGroupSize gate.`;
  }
  return view.wouldForm
    ? `"${view.groupName}" meets its minimumGroupSize: ${view.size} of ${view.minimumGroupSize} required updates.`
    : `"${view.groupName}" would WAIT: ${updates} of the ${view.minimumGroupSize} its minimumGroupSize requires.`;
}

/** One update plus the slice of its simulation the tally reads — structural,
 *  so a test hands in the config without fabricating a whole result. */
export interface SimulatedUpdate {
  dep: DependencyDescriptor;
  sim: Pick<SimulationResult, "finalDependencyConfig">;
}

/**
 * The tally. Pure over what the simulations already computed: each entry is
 * one update and the `finalDependencyConfig` its matching rules produced.
 */
export function groupTally(simulated: readonly SimulatedUpdate[]): GroupTally {
  const byName = new Map<string, { members: GroupMember[]; minimums: number[]; slug?: string }>();
  const ungrouped: GroupMember[] = [];
  for (const { dep, sim } of simulated) {
    const config = sim.finalDependencyConfig;
    const groupName = config["groupName"];
    if (typeof groupName !== "string" || groupName.length === 0) {
      ungrouped.push(memberOf(dep));
      continue;
    }
    const entry = byName.get(groupName) ?? { members: [], minimums: [] };
    entry.members.push(memberOf(dep));
    entry.minimums.push(minimumOf(config));
    const slug = config["groupSlug"];
    if (typeof slug === "string" && slug.length > 0) {
      entry.slug = slug;
    }
    byName.set(groupName, entry);
  }
  const groups = [...byName.entries()].map(([groupName, entry]) => {
    const distinct = [...new Set(entry.minimums)].toSorted((a, b) => a - b);
    const minimumGroupSize = distinct.at(-1) ?? 1;
    const base = {
      groupName,
      ...(entry.slug ? { groupSlug: entry.slug } : {}),
      members: entry.members,
      size: entry.members.length,
      minimumGroupSize,
      ...(distinct.length > 1 ? { minimumGroupSizeValues: distinct } : {}),
      wouldForm: entry.members.length >= minimumGroupSize,
    };
    return { ...base, verdict: verdictOf(base) };
  });
  const disagreements = groups.filter((group) => group.minimumGroupSizeValues);
  return {
    updates: simulated.length,
    groups,
    ungrouped,
    notes: [
      SCOPE_NOTE,
      BRANCH_NOTE,
      ...disagreements.map(
        (group) =>
          `"${group.groupName}": its members carry different minimumGroupSize values ` +
          `(${group.minimumGroupSizeValues?.join(", ")}) — the verdict uses the largest.`,
      ),
    ],
  };
}

/** The slice of a simulation the gap notes read — structural, like
 *  {@link SimulatedUpdate}, so both transports hand in what they hold. */
export interface GapInput {
  dep: DependencyDescriptor;
  sim: Pick<SimulationResult, "missingInputs">;
}

/**
 * A member's input gap, per update, with the unset FIELDS named (replay-04:
 * "a field they read unset" sent the entry persona through a trial-and-error
 * loop that naming `sourceUrl` up front would have skipped). One shared
 * function — the CLI's and the MCP tool's wording used to be two near-copies.
 */
export function inputGaps(simulated: readonly GapInput[], transport: RunTransport): string[] {
  const spell = transport === "cli" ? "`rcd simulate`" : "simulate";
  return simulated.flatMap(({ dep, sim }, index) => {
    const count = sim.missingInputs.rules;
    if (count === 0) {
      return [];
    }
    const name = dep.depName ?? `update ${index + 1}`;
    const fields = [...new Set(sim.missingInputs.groups.map((group) => group.fieldList))];
    const named =
      fields.length > 0 ? `leaves ${fields.slice(0, 3).join(" / ")} unset` : "leaves fields unset";
    return [
      `${name}: ${count} rule${count === 1 ? "" : "s"} could not match because this update ` +
        `${named} — ${spell} that update to see which rules.`,
    ];
  });
}

/**
 * The headline correction for a blind tally: "0 groups" over updates whose
 * descriptors starved the matchers reads as "these updates just don't group",
 * when the honest reading is "the tally could not see". Returned for BOTH
 * transports to put first — the JSON notes array and the pretty headline must
 * make the same claim.
 */
export function blindTallyNote(tally: GroupTally, gapCount: number): string | undefined {
  if (tally.groups.length > 0 || gapCount === 0) {
    return undefined;
  }
  return (
    `No groups formed, but ${plural(gapCount, "update")} left fields unset that rules match ` +
    "on — this tally may be blind, not empty. Fill the named fields and re-run before " +
    "concluding these updates don't group."
  );
}

/** The tally as pretty output prints it; `gaps` is {@link inputGaps}'s answer,
 *  so a blind tally can correct itself right under the headline instead of in
 *  a footnote nobody reads before concluding "these updates don't group". */
export function groupTallyLines(tally: GroupTally, gaps: readonly string[] = []): string[] {
  const blind = blindTallyNote(tally, gaps.length);
  const headline =
    `${plural(tally.groups.length, "group")} over ${plural(tally.updates, "simulated update")}` +
    (tally.ungrouped.length > 0 ? ` (${plural(tally.ungrouped.length, "update")} ungrouped)` : "") +
    ".";
  const lines = [headline, ...(blind ? ["", `⚠ ${blind}`] : [])];
  for (const group of tally.groups) {
    lines.push("", `  ${group.verdict}`);
    for (const member of group.members) {
      lines.push(
        `      ${member.depName ?? "(unnamed dependency)"}` +
          (member.updateType ? ` (${member.updateType})` : ""),
      );
    }
  }
  if (tally.ungrouped.length > 0) {
    lines.push("", "  Ungrouped — each update gets its own PR:");
    for (const member of tally.ungrouped) {
      lines.push(
        `      ${member.depName ?? "(unnamed dependency)"}` +
          (member.updateType ? ` (${member.updateType})` : ""),
      );
    }
  }
  lines.push("", ...tally.notes.map((note) => note));
  return lines;
}
