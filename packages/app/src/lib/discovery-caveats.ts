import { plural } from "@/lib/format";
import type { RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090's honest accounting, derived ONCE from the per-file ledger.
 *
 * Three surfaces report the same discovery — the Dependencies footnote, the
 * From-repository footnote and the Extract phase's notes — and each used to
 * run its own arithmetic over its own pick of counters, which let two tabs
 * print two different "files not read" totals for one walk. Everything here
 * is one pass over `view.files`, so a count shown on one surface can never
 * disagree with the same count on another. Lives in `lib/` because the three
 * surfaces are three feature slices, and features may not import each other.
 */
export interface DiscoveryTally {
  /** Files whose extraction contributed rows — the "across N package files". */
  extracted: number;
  /** Read fine, held no dependencies. */
  empty: number;
  /** Never fetched — the fetch cap. */
  notRead: number;
  /** Fetched, but the content could not be read. */
  unreadable: number;
  /** Read, but the extractor itself failed. */
  errored: number;
}

export function tallyDiscovery(view: RepoDepsView): DiscoveryTally {
  const tally: DiscoveryTally = { extracted: 0, empty: 0, notRead: 0, unreadable: 0, errored: 0 };
  for (const file of view.files) {
    if (file.outcome === "extracted") {
      tally.extracted += 1;
    } else if (file.outcome === "no-deps") {
      tally.empty += 1;
    } else if (file.outcome === "not-read") {
      tally.notRead += 1;
    } else if (file.outcome === "unreadable") {
      tally.unreadable += 1;
    } else {
      tally.errored += 1;
    }
  }
  return tally;
}

/**
 * The caveat clauses — what the walk honestly did NOT turn into an answer.
 * Lowercase and unpunctuated so a footnote can join them with " · " and a
 * notes list can sentence-case them; every surface says the same numbers in
 * the same words. Empty when the walk answered for every matched file.
 */
export function discoveryCaveats(view: RepoDepsView): string[] {
  const tally = tallyDiscovery(view);
  const parts: string[] = [];
  if (tally.notRead > 0) {
    parts.push(
      `${plural(tally.notRead, "matched file")} not read — discovery caps how many files it fetches`,
    );
  }
  if (tally.unreadable > 0) {
    parts.push(`${plural(tally.unreadable, "matched file")} could not be read`);
  }
  if (tally.errored > 0) {
    parts.push(`extraction failed for ${plural(tally.errored, "matched file")}`);
  }
  if (view.truncated) {
    parts.push("the repository’s file listing was truncated — the walk did not see every file");
  }
  return parts;
}
