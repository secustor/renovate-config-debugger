/**
 * "Who overrode this key, after this stop?" — the merge walk both the pin card
 * and the rule-evidence popover do.
 *
 * They had it twice, over `MergeStep` and `MergeStop`, which are different
 * types that happen to share the one field the walk reads. `pin-outcome.ts`'s
 * comment already said it was "the same walk `rule-evidence.ts` does".
 *
 * Sharing it is not tidiness: the popover and the pin card must AGREE on which
 * step won a key. Two copies is two chances to fix a rule in one and miss it in
 * the other, and the failure mode is the two views quietly contradicting each
 * other about the same run.
 */

/** The only shape the walk needs — satisfied by both `MergeStep` and
 *  `MergeStop`, whose `merged` arrays carry richer entries than this. */
interface KeyedStop {
  merged?: readonly { key: string }[];
}

/**
 * The index of the first stop AFTER `stopIndex` that writes `key`, or
 * `undefined` when nothing later touches it — i.e. when the write survived.
 *
 * Only the FIRST later stop matters: past that point the value on the table is
 * no longer the one this rule wrote, so who touches it afterwards says nothing
 * about this rule's write.
 */
export function overridingStopIndex(
  stops: readonly KeyedStop[],
  stopIndex: number,
  key: string,
): number | undefined {
  for (let i = stopIndex + 1; i < stops.length; i += 1) {
    if (stops[i]?.merged?.some((entry) => entry.key === key)) {
      return i;
    }
  }
  return undefined;
}
