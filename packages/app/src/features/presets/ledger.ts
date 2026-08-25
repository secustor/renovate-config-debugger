import type { PresetNode } from "@renovate-config-debugger/engine";
import { plural } from "@/lib/format";
import {
  computeTreeStats,
  isRealOptionKey,
  type TreeStats,
  type TreeSummary,
} from "@/lib/preset-tree-stats";
import { summarizeRuleSelectors } from "@/lib/rule-selectors";
import { valuePreview } from "@/lib/value-preview";
import { githubAuthFailure } from "@/lib/github-failure";
import { isPlainObject } from "@/lib/input-schemas";

/**
 * Roadmap 075 (iteration 5b): the Presets LEDGER — what `extends` actually
 * brought in, one card per top-level source, instead of dropping the reader
 * into a 1,100-row inventory.
 *
 * Everything here is derived from the SAME single walk the tree renders from
 * (`computeTreeStats`): no second pass over the trace, no re-resolution, no
 * provenance recomputation. What the ledger adds is aggregation per top-level
 * `extends` entry — which family of presets a source is mostly made of, which
 * option keys its subtree set and which preset in it had the last word.
 *
 * Pure and DOM-free, so the whole model is unit-testable (`ledger.test.ts`).
 */

/** Which section of an expanded card a mosaic tile highlights. */
export type LedgerSection = "options" | "rules";

export interface LedgerTile {
  /** Stable within a source — the React key and the selection identity. */
  id: string;
  kind: "family" | "options" | "rules" | "routers";
  label: string;
  /** The muted second line: what the tile's number counts. */
  detail: string;
  /** What the tile is SIZED by (presets, or rules for the rules tile). */
  count: number;
  /** The preset node a family tile stands for; null for the aggregates. */
  nodeId: string | null;
  /** The section this tile selects — null for tiles that only account. */
  section: LedgerSection | null;
}

export interface LedgerOption {
  key: string;
  /** One line standing in for the value the winning preset set. */
  value: string;
  /** The preset whose value survives the merge — see `mergeOrder`. */
  setterId: string;
  setterName: string;
  /** The setter sits deeper than a direct child of this source. */
  nested: boolean;
  /** Presets in the same subtree that set this key EARLIER (and thus lost). */
  alsoSetBy: number;
}

export interface LedgerFamily {
  nodeId: string;
  name: string;
  /** Plain-language note for the well-known families; null when unknown. */
  note: string | null;
  presets: number;
  rules: number;
  /** First few child presets, as a sample of what the family contains. */
  samples: { nodeId: string; name: string }[];
}

/** One `packageRules` entry a source declares ITSELF, as one line. */
export interface LedgerRule {
  index: number;
  selectors: string;
}

export interface LedgerSource {
  nodeId: string;
  name: string;
  /** `internal` (Renovate's own) or the fetch kind — github, npm, local, … */
  kind: string;
  builtIn: boolean;
  /** This `extends` entry did not resolve at all. */
  failed: boolean;
  error: string | null;
  /** Presets this source brought in, itself included. */
  presets: number;
  /** Distinct behaviour-changing option keys its subtree set. */
  optionKeys: number;
  /** packageRules entries in its subtree. */
  rules: number;
  docsUrl: string;
  /** The mosaic, already split into the rows it renders as. */
  tileRows: LedgerTile[][];
  options: LedgerOption[];
  families: LedgerFamily[];
  ownRules: LedgerRule[];
}

/**
 * Roadmap 082: one failed preset, as the health box lists it. Every node the
 * run's own summary counts as an error gets a row — `summary.errors` is
 * literally "non-root nodes in state `error`", so the rows and the headline
 * count are the same walk seen twice and cannot disagree.
 */
export interface LedgerErrorRow {
  nodeId: string;
  name: string;
  message: string;
  /**
   * How the reference got into the run — and therefore whose it is to fix.
   *
   * `config` = the node is a DIRECT child of the root, i.e. an entry the reader
   * typed into their own `extends`. That case comes first and overrides
   * everything else: a mistyped `config:recomended` is the single commonest
   * one-error run there is, and telling its author it "arrived through a
   * preset's own extends" would be flatly false.
   *
   * Below the top level the design's two phrasings apply, decided by which
   * top-level entry the failure sits under: `own` = a preset the reader hosts
   * (github/gitlab/local/npm/…) pulled it in; `extends` = a Renovate built-in
   * did, several levels from anything the reader wrote.
   */
  via: "config" | "own" | "extends";
  /** Roadmap 009: signing in is the likely fix for this one. */
  authFixable: boolean;
  /** …and specifically because the unauthenticated rate limit was hit. */
  rateLimited: boolean;
}

export interface PresetLedgerModel {
  sources: LedgerSource[];
  /** Roadmap 082: one row per failed preset, in tree order. */
  errors: LedgerErrorRow[];
  /** The run's own totals — never recounted here (see `TreeSummary`). */
  summary: TreeSummary;
}

/** The DOM id of a source's card, spelled once — the card's stable anchor.
 *  (Until 082 the summary strip's tokens scrolled to it; the strip is counts
 *  only now, and the cards are the list.) */
export function ledgerCardId(nodeId: string): string {
  return `ledger-${nodeId}`;
}

/** At most this many family tiles; the rest are represented by the aggregates. */
const FAMILY_MAX = 6;
/** A source with no more direct children than this gives each one a tile. */
const FAMILY_ALL_BELOW = FAMILY_MAX;
/** How many child names a family row samples. */
const SAMPLE_MAX = 5;

/**
 * The preset groups docs.renovatebot.com publishes a page for, spelled exactly
 * as the URL segment (`presets-mergeConfidence/`, case included). An allowlist
 * rather than a formula: a link that 404s is worse than one that lands on the
 * general presets page, and the groups only change when Renovate adds one.
 */
const DOC_GROUPS = new Set([
  "abandonments",
  "config",
  "customManagers",
  "default",
  "docker",
  "global",
  "group",
  "helpers",
  "mergeConfidence",
  "monorepo",
  "packages",
  "preview",
  "replacements",
  "schedule",
  "security",
  "workarounds",
]);

/** Renovate's own page on what a preset IS — the health box's `docs ↗`, and
 *  the fallback for every reference no docs page describes. */
export const CONFIG_PRESETS_DOCS = "https://docs.renovatebot.com/config-presets/";

/**
 * Where a source is documented. Internal presets have their own anchor on
 * their group's page — the heading IS the preset name, and the anchor is that
 * name lowercased with the colon removed (`group:monorepos` →
 * `presets-group/#groupmonorepos`, `:dependencyDashboard` →
 * `presets-default/#dependencydashboard`). Everything fetched is somebody
 * else's repository, which no docs page describes — those get the page that
 * explains what a hosted preset IS.
 */
export function presetDocsUrl(name: string, kind: string): string {
  if (kind !== "internal") {
    return CONFIG_PRESETS_DOCS;
  }
  // Parameters (`group:foo(bar)`) are an instance, not a preset name.
  const bare = name.split("(")[0] ?? name;
  const match = /^([A-Za-z][A-Za-z0-9]*)?:([A-Za-z0-9-]+)$/.exec(bare);
  if (!match) {
    return CONFIG_PRESETS_DOCS;
  }
  const group = match[1] ?? "default";
  if (!DOC_GROUPS.has(group)) {
    return CONFIG_PRESETS_DOCS;
  }
  return `https://docs.renovatebot.com/presets-${group}/#${bare.replace(":", "").toLowerCase()}`;
}

/**
 * What a well-known preset family is FOR, in one clause. Deliberately short
 * and generic: these are the four or five names a reader meets on every run,
 * and anything more specific would be a claim about presets whose contents
 * this module never reads. Unknown families get no note at all rather than a
 * guess.
 */
const FAMILY_NOTES: Record<string, string> = {
  group: "groups related packages into one pull request",
  monorepo: "groups packages released together from one repository",
  replacements: "renames packages that moved, merged or were replaced",
  workarounds: "fixes for known upstream packaging quirks",
  helpers: "small fixes for specific ecosystems",
  packages: "package lists other presets match against",
  schedule: "when Renovate is allowed to open pull requests",
  security: "vulnerability-driven update behaviour",
};

export function familyNote(name: string): string | null {
  const group = name.split(":")[0];
  return group ? (FAMILY_NOTES[group] ?? null) : null;
}

function subtreePresets(node: PresetNode, stats: TreeStats): number {
  const st = stats.statsById.get(node.id);
  return (st?.descResolved ?? 0) + (node.state === "resolved" ? 1 : 0);
}

function subtreeRules(node: PresetNode, stats: TreeStats): number {
  const st = stats.statsById.get(node.id);
  return (st?.ownRules ?? 0) + (st?.descRules ?? 0);
}

/**
 * The subtree in MERGE order — the order Renovate's own resolution writes its
 * values in, which is what decides who had the last word about a key.
 * `resolveConfigPresets` merges a config's resolved `extends` left to right and
 * then merges the config's OWN keys on top, so a node writes after all of its
 * descendants and after its earlier siblings: post-order, exactly.
 *
 * (Pre-order would invert the one case that matters most — a preset overriding
 * something the preset it extends had set.)
 */
export function mergeOrder(root: PresetNode): PresetNode[] {
  const out: PresetNode[] = [];
  const visit = (node: PresetNode) => {
    for (const child of node.children) {
      visit(child);
    }
    out.push(node);
  };
  visit(root);
  return out;
}

function optionRows(source: PresetNode, stats: TreeStats, order: PresetNode[]): LedgerOption[] {
  const sourceDepth = stats.statsById.get(source.id)?.depth ?? 1;
  const setters = new Map<string, PresetNode[]>();
  for (const node of order) {
    if (node.state !== "resolved") {
      continue;
    }
    const st = stats.statsById.get(node.id);
    if (!st) {
      continue;
    }
    for (const key of st.optionKeys) {
      if (!isRealOptionKey(key)) {
        continue;
      }
      const list = setters.get(key);
      if (list) {
        list.push(node);
      } else {
        setters.set(key, [node]);
      }
    }
  }
  const rows: LedgerOption[] = [];
  for (const [key, nodes] of setters) {
    // Last in merge order = the value that survives into the merged config.
    const winner = nodes[nodes.length - 1];
    if (!winner) {
      continue;
    }
    const input = winner.input;
    const depth = stats.statsById.get(winner.id)?.depth ?? sourceDepth;
    rows.push({
      key,
      value: valuePreview(isPlainObject(input) ? input[key] : undefined),
      setterId: winner.id,
      setterName: winner.name,
      nested: depth > sourceDepth + 1,
      alsoSetBy: nodes.length - 1,
    });
  }
  return rows.toSorted((a, b) => a.key.localeCompare(b.key));
}

function familyRows(source: PresetNode, stats: TreeStats): LedgerFamily[] {
  const kids = source.children.filter((child) => child.state === "resolved");
  // A source with a handful of children is fully described by them; a source
  // with fifteen (config:recommended) is described by the ones that brought a
  // whole family, and its single-preset children are counted by the aggregate
  // tiles instead.
  const candidates =
    kids.length <= FAMILY_ALL_BELOW ? kids : kids.filter((c) => subtreePresets(c, stats) > 1);
  return candidates
    .map((child) => ({
      nodeId: child.id,
      name: child.name,
      note: familyNote(child.name),
      presets: subtreePresets(child, stats),
      rules: subtreeRules(child, stats),
      samples: child.children.slice(0, SAMPLE_MAX).map((n) => ({ nodeId: n.id, name: n.name })),
    }))
    .toSorted((a, b) => b.presets - a.presets)
    .slice(0, FAMILY_MAX);
}

function ownRuleRows(source: PresetNode): LedgerRule[] {
  const input = source.input;
  const rules = isPlainObject(input) ? input.packageRules : undefined;
  if (!Array.isArray(rules)) {
    return [];
  }
  return rules.map((rule, index) => ({ index, selectors: summarizeRuleSelectors(rule) }));
}

function countRouters(order: PresetNode[], stats: TreeStats): number {
  let routers = 0;
  for (const node of order) {
    if (node.state === "resolved" && stats.statsById.get(node.id)?.zero) {
      routers++;
    }
  }
  return routers;
}

/**
 * The mosaic, as the rows it renders as: the families on their own row (they
 * are the source's structure), the aggregates on a second (they are what the
 * structure ADDS UP TO). A source with no families keeps everything on one row
 * — there is no structure to separate from.
 */
function tileRowsFor(families: LedgerFamily[], aggregates: LedgerTile[]): LedgerTile[][] {
  const familyTiles: LedgerTile[] = families.map((family) => ({
    id: `family:${family.nodeId}`,
    kind: "family",
    label: family.name,
    detail: plural(family.presets, "preset"),
    count: family.presets,
    nodeId: family.nodeId,
    section: "rules",
  }));
  if (familyTiles.length === 0) {
    return aggregates.length > 0 ? [aggregates] : [];
  }
  return aggregates.length > 0 ? [familyTiles, aggregates] : [familyTiles];
}

function ledgerSource(source: PresetNode, stats: TreeStats): LedgerSource {
  const kind = source.source?.presetSource ?? "internal";
  const builtIn = kind === "internal";
  const order = mergeOrder(source);
  const options = optionRows(source, stats, order);
  const families = familyRows(source, stats);
  const presets = subtreePresets(source, stats);
  const rules = subtreeRules(source, stats);
  const optionSetting = order.filter(
    (node) =>
      node.state === "resolved" &&
      (stats.statsById.get(node.id)?.optionKeys ?? []).some(isRealOptionKey),
  ).length;
  const familyRuleTotal = families.reduce((sum, family) => sum + family.rules, 0);
  const looseRules = Math.max(rules - familyRuleTotal, 0);
  const routers = countRouters(order, stats);

  const aggregates: LedgerTile[] = [];
  if (options.length > 0) {
    aggregates.push({
      id: "options",
      kind: "options",
      label: "sets options",
      detail: `${plural(optionSetting, "preset")} · ${plural(options.length, "key")}`,
      count: Math.max(optionSetting, 1),
      nodeId: null,
      section: "options",
    });
  }
  if (looseRules > 0) {
    aggregates.push({
      id: "rules",
      kind: "rules",
      label: "grouping rules",
      detail: plural(looseRules, "rule"),
      count: looseRules,
      nodeId: null,
      section: "rules",
    });
  }
  if (routers > 0) {
    aggregates.push({
      id: "routers",
      kind: "routers",
      label: "routers ∅",
      detail: `${plural(routers, "preset")} · pure extends`,
      count: routers,
      nodeId: null,
      section: null,
    });
  }

  return {
    nodeId: source.id,
    name: source.name,
    kind,
    builtIn,
    failed: source.state !== "resolved",
    error: source.error?.message ?? null,
    presets,
    optionKeys: options.length,
    rules,
    docsUrl: presetDocsUrl(source.name, kind),
    tileRows: tileRowsFor(families, aggregates),
    options,
    families,
    ownRules: ownRuleRows(source),
  };
}

/**
 * Roadmap 082: every failed preset in the run, in tree order, each one told
 * where it came from.
 *
 * The "via" answer is the only thing here that is not already on the node, and
 * it is deliberately the coarsest honest one. A DIRECT child of the root is an
 * entry the reader typed, whatever its source kind — that case wins outright.
 * Below the top level, what decides the phrasing is which top-level entry the
 * failure sits under: a fetched one (github, gitlab, local, npm, http, …) is a
 * preset the reader hosts, so anything failing inside it is theirs to fix; a
 * built-in one means the failing reference was written by a preset, not by
 * them. Nothing finer is claimed — the tree knows the exact chain, and the tree
 * is one click away.
 */
function errorRows(root: PresetNode): LedgerErrorRow[] {
  const rows: LedgerErrorRow[] = [];
  const visit = (node: PresetNode, depth: number, deep: "own" | "extends") => {
    if (node.state === "error") {
      const auth = githubAuthFailure(node);
      rows.push({
        nodeId: node.id,
        name: node.name,
        message: node.error?.message ?? "could not be resolved",
        via: depth === 0 ? "config" : deep,
        authFixable: auth.match,
        rateLimited: auth.rateLimited,
      });
    }
    for (const child of node.children) {
      visit(child, depth + 1, deep);
    }
  };
  for (const source of root.children) {
    // The top-level entry's KIND only names the failures BELOW it; the entry
    // itself is always something the reader wrote.
    const deep = (source.source?.presetSource ?? "internal") === "internal" ? "extends" : "own";
    visit(source, 0, deep);
  }
  return rows;
}

/**
 * Roadmap 032's contract, kept: one derivation per RESULT. The tree object is
 * immutable once a run produced it, so the ledger is cached on it exactly as
 * `computeTreeStats` caches its walk — typing in the editor can never pay for
 * this again.
 */
const ledgerCache = new WeakMap<PresetNode, PresetLedgerModel>();

export function computePresetLedger(root: PresetNode): PresetLedgerModel {
  const cached = ledgerCache.get(root);
  if (cached) {
    return cached;
  }
  const stats = computeTreeStats(root);
  const sources = root.children.map((child) => ledgerSource(child, stats));
  const model: PresetLedgerModel = { sources, errors: errorRows(root), summary: stats.summary };
  ledgerCache.set(root, model);
  return model;
}

/**
 * Tile widths: proportional to the counts, with a floor so a family of twenty
 * presets next to one of nine hundred is still a target the reader can hit.
 * Returns fractions summing to 1 (fed straight to `grid-template-columns`).
 */
export function tileFractions(counts: number[], minShare = 0.12): number[] {
  const n = counts.length;
  if (n === 0) {
    return [];
  }
  const floor = Math.min(minShare, 1 / n);
  const total = counts.reduce((sum, c) => sum + Math.max(c, 0), 0);
  if (total <= 0) {
    return counts.map(() => 1 / n);
  }
  const free = 1 - floor * n;
  return counts.map((c) => floor + (Math.max(c, 0) / total) * free);
}

/**
 * Which of the three purple strengths a tile paints in. Discrete, not
 * continuous: the fill has to come from a design token (`--accent-purple`
 * through `color-mix`), and three classes say "bigger" as legibly as a
 * computed alpha would while keeping every colour in the stylesheet.
 */
export function tileStrength(fraction: number): 1 | 2 | 3 {
  if (fraction >= 0.35) {
    return 3;
  }
  return fraction >= 0.18 ? 2 : 1;
}
