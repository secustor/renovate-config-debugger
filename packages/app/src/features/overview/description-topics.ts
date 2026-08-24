/**
 * Roadmap 083 — the Overview tab's topic classifier.
 *
 * 069's digest groups the resolved `description` sentences by the `extends`
 * entry that pulled each one in, which answers *which preset do I remove to
 * stop doing that*. The Overview asks the beginner's question instead — *what
 * does this config actually do* — and the design's answer is to sort the same
 * sentences by SUBJECT: pull requests, grouping, automerge, safety.
 *
 * There is no subject in the data. Renovate's `description` is free prose and
 * nothing upstream tags it, so the only honest classifier is a keyword match
 * over the sentence text, and this module is deliberately nothing more than
 * that: five topics, one documented regex each, case-insensitive, first match
 * wins. It is a reading aid, not a claim about semantics.
 *
 * Two properties make that safe to show a beginner:
 *
 * - **Nothing is dropped.** A sentence matching no topic lands in
 *   `Everything else`, which the card reveals behind one toggle. The reader
 *   never has to wonder whether a sentence was filed somewhere they did not
 *   look, or filed nowhere at all.
 * - **The buckets are about wording, not about options.** A sentence saying
 *   "monorepo" is filed under Grouping because it SAYS monorepo — the classifier
 *   never inspects the config, so it can never contradict what the Effective
 *   config reports.
 *
 * Pure and DOM-free (`lib/`), and generic over the row: the card's row shape is
 * a view concern, so the classifier asks only for `text`.
 */

export type TopicId = "prs" | "grouping" | "automerge" | "safety" | "other";

/** The unmatched tail. Named because the card's one toggle is about this group
 *  specifically, and the copy quotes its title. */
export const OTHER_TOPIC_ID = "other" satisfies TopicId;

interface TopicDefinition {
  id: TopicId;
  title: string;
  match: RegExp;
}

/**
 * The four keyword buckets, and what each regex is trying to catch.
 *
 * The patterns are written against real Renovate preset prose, not invented
 * vocabulary — every alternative below appears in a shipped `description`
 * (`:prHourlyLimit2`, `:prConcurrent10`, `:dependencyDashboard`,
 * `group:monorepos`, `:automergePatch`, `workarounds:all`,
 * `replacements:all`, `:ignoreModulesAndTests`).
 */
const TOPIC_DEFINITIONS: Record<Exclude<TopicId, "other">, TopicDefinition> = {
  // Volume and timing: how many PRs, how often, and where they are listed.
  // `pr titles` is deliberately NOT here — a sentence about commit-message
  // formatting is not a sentence about PR volume, and the design's own artboard
  // files "Use semantic prefixes for commit messages and PR titles." under
  // Everything else.
  prs: {
    id: "prs",
    title: "Pull requests & noise",
    match:
      /\b(rate[ -]?limits?|pr creation|pr limits?|open prs?|concurrent\w*|per hour|hourly|dependency dashboard|dashboards?|schedul\w+|noise|pull requests?)\b/i,
  },
  // Anything that says several updates should travel together.
  grouping: {
    id: "grouping",
    title: "Grouping",
    match: /\b(group\w*|monorepo\w*)\b/i,
  },
  automerge: {
    id: "automerge",
    title: "Automerge",
    match: /\b(automerge\w*|auto-merge\w*|automatically merges?)\b/i,
  },
  // The maintenance chores: crowd-sourced fixes, paths not to look in, and
  // pinning. `ignore` on its own is NOT a keyword — half of `workarounds:all`
  // is "Ignore <some broken release>", which is a fact about one package, not
  // about how this repo is maintained, and the artboard leaves those in
  // Everything else.
  safety: {
    id: "safety",
    title: "Safety & housekeeping",
    match:
      /\b(workarounds?|replacements?|node_modules|bower_components|vendor\w*|pins?|pinn(?:ed|ing)|ignore ?paths?|securit\w+|vulnerab\w+)\b/i,
  },
};

/**
 * The order the card RENDERS the topics in — the design's, and the order a
 * reader meets the questions in: how noisy is this, what travels together, what
 * merges itself, what keeps it safe.
 *
 * A `Record` rather than a bare list so the module's one promise — every row
 * comes back in exactly one group — is structural: a future `TopicId` missing
 * a rank here fails to compile instead of silently deleting its rows from
 * `groupByTopic`.
 */
const TOPIC_RANK: Record<TopicId, number> = {
  prs: 0,
  grouping: 1,
  automerge: 2,
  safety: 3,
  [OTHER_TOPIC_ID]: 4,
};

export const TOPIC_ORDER: readonly TopicId[] = (Object.keys(TOPIC_RANK) as TopicId[]).toSorted(
  (a, b) => TOPIC_RANK[a] - TOPIC_RANK[b],
);

/**
 * The order the classifier TESTS the topics in, which is not the display order.
 *
 * Sentences routinely name more than one subject ("Weekly automerge schedule on
 * early Monday mornings" is both an automerge sentence and a schedule
 * sentence), so first-match-wins needs the specific buckets asked first and the
 * broad one last. `Pull requests & noise` is the broad one — `schedul*`,
 * `dashboard` and `limit` show up in sentences whose real subject is one of the
 * other three — so it is tested last even though it is displayed first.
 */
const MATCH_ORDER: readonly Exclude<TopicId, "other">[] = [
  "automerge",
  "grouping",
  "safety",
  "prs",
];

/** The topic title as the card prints it (uppercased by CSS, not here). */
export function topicTitle(id: TopicId): string {
  return id === OTHER_TOPIC_ID ? "Everything else" : TOPIC_DEFINITIONS[id].title;
}

/** Which bucket one sentence falls in. `other` when no keyword matched — which
 *  is a real answer, not a failure. */
export function topicForDescription(text: string): TopicId {
  for (const id of MATCH_ORDER) {
    if (TOPIC_DEFINITIONS[id].match.test(text)) {
      return id;
    }
  }
  return OTHER_TOPIC_ID;
}

export interface TopicGroup<Row> {
  id: TopicId;
  title: string;
  rows: Row[];
}

/**
 * The sentences, bucketed and returned in {@link TOPIC_ORDER}. Groups that
 * matched nothing are omitted — an empty `AUTOMERGE` heading would tell the
 * reader that this config has an automerge story and then show them none.
 *
 * Order WITHIN a group is the order the rows arrived in, which is the digest's,
 * which is Renovate's own merge order. Nothing is sorted and nothing is
 * dropped: every input row comes back in exactly one group.
 */
export function groupByTopic<Row extends { text: string }>(
  rows: readonly Row[],
): TopicGroup<Row>[] {
  const buckets = new Map<TopicId, Row[]>();
  for (const row of rows) {
    const id = topicForDescription(row.text);
    const bucket = buckets.get(id);
    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(id, [row]);
    }
  }
  const groups: TopicGroup<Row>[] = [];
  for (const id of TOPIC_ORDER) {
    const bucket = buckets.get(id);
    if (bucket && bucket.length > 0) {
      groups.push({ id, title: topicTitle(id), rows: bucket });
    }
  }
  return groups;
}
