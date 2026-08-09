/**
 * The one JSON document every MCP tool answers with — and its size budget.
 *
 * Two economics, one module. A model consumer pays for every byte, and the
 * host truncates what it cannot fit (Claude Code caps tool output at 25k
 * tokens by default), so:
 *
 * - small answers are pretty-printed, because a human reads them in the
 *   transcript; large ones are compact, because indentation on a 100 kB
 *   payload is pure token overhead;
 * - an answer that would blow the budget is elided STRUCTURALLY — never cut
 *   mid-JSON — and says so, with the parameter that narrows the question.
 *   Silent truncation is the failure mode worth avoiding: an agent cannot
 *   tell a short list from a shortened one.
 */

/** Above this, indentation stops paying for itself. */
const PRETTY_LIMIT_BYTES = 4_000;

/** The most any single tool result may carry. */
export const RESULT_BUDGET_BYTES = 100_000;

/** Elide to slightly under, so the wrapper keys still fit. */
const ELISION_TARGET_BYTES = RESULT_BUDGET_BYTES - 2_000;

const MAX_ELISION_ROUNDS = 500;

const DEFAULT_HINT =
  "this answer was elided to fit the tool-output budget — ask a narrower question " +
  "(one key, one node, a smaller depth) and call again.";

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function stringify(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The biggest array anywhere in the payload that is still worth shrinking —
 *  `skip` holds the ones a round could not shrink any further. */
function largestArray(value: unknown, skip: Set<unknown[]>): unknown[] | null {
  let best: unknown[] | null = null;
  let bestSize = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      const size = byteLength(stringify(node));
      if (node.length > 1 && size > bestSize && !skip.has(node)) {
        best = node;
        bestSize = size;
      }
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (isRecord(node)) {
      for (const item of Object.values(node)) {
        visit(item);
      }
    }
  };
  visit(value);
  return best;
}

/** Rewrites every shortened array into a self-describing wrapper, so the
 *  omission is a fact in the document rather than a missing element. */
function applyElisions(value: unknown, elided: Map<unknown[], number>): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => applyElisions(item, elided));
    const omitted = elided.get(value);
    return omitted ? { truncated: true, shown: items.length, omitted, items } : items;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, applyElisions(item, elided)]),
    );
  }
  return value;
}

/**
 * Drops whole top-level keys, biggest first — the last resort for a payload
 * with no array big enough to elide (one enormous object).
 *
 * It measures against the hard cap, not the elision target: the array pass
 * aims a little under, and a key is far too blunt an instrument to reach for
 * over the few hundred bytes the wrapper adds.
 */
function dropLargestKeys(payload: Record<string, unknown>): string[] {
  const dropped: string[] = [];
  while (byteLength(stringify(payload)) > RESULT_BUDGET_BYTES - 1_000) {
    const entries = Object.entries(payload);
    if (entries.length === 0) {
      break;
    }
    const [key] = entries.reduce((a, b) =>
      byteLength(stringify(a[1])) >= byteLength(stringify(b[1])) ? a : b,
    );
    delete payload[key];
    dropped.push(key);
  }
  return dropped;
}

/**
 * Keeps the longest leading run of elements that fits in `allowance`, and at
 * least one — the shape of an answer is part of the answer.
 *
 * Measured, not counted: an array's bytes are never spread evenly across it,
 * so "keep half" either throws away a document to save nothing (a preset
 * tree's fat child is last) or saves nothing at all (it is first). Returns how
 * many elements went.
 */
function shrinkArray(array: unknown[], allowance: number): number {
  let used = 0;
  let keep = 0;
  for (const item of array) {
    const size = byteLength(stringify(item)) + 1;
    if (keep > 0 && used + size > allowance) {
      // An element that alone blows the whole allowance IS the answer — a
      // preset tree is one enormous child next to a dozen small ones. Keep it
      // and let the next round elide inside it, rather than returning the
      // twelve leaves and dropping the trunk.
      if (size > allowance) {
        keep += 1;
      }
      break;
    }
    used += size;
    keep += 1;
  }
  const removed = array.length - keep;
  array.length = keep;
  return removed;
}

function elideToBudget(compact: string, hint: string | undefined): Record<string, unknown> {
  const clone = JSON.parse(compact) as unknown;
  const elided = new Map<unknown[], number>();
  // Arrays that cannot give anything back — one oversized element is all they
  // hold. The next round looks inside it instead.
  const exhausted = new Set<unknown[]>();
  for (let round = 0; round < MAX_ELISION_ROUNDS; round += 1) {
    const size = byteLength(stringify(clone));
    if (size <= ELISION_TARGET_BYTES) {
      break;
    }
    const largest = largestArray(clone, exhausted);
    if (!largest) {
      break;
    }
    // What this array may still weigh once the payload fits.
    const allowance = byteLength(stringify(largest)) - (size - ELISION_TARGET_BYTES);
    const removed = shrinkArray(largest, allowance);
    if (removed === 0) {
      exhausted.add(largest);
      continue;
    }
    elided.set(largest, (elided.get(largest) ?? 0) + removed);
  }
  const body = applyElisions(clone, elided);
  const payload = isRecord(body) ? { ...body } : { result: body };
  const droppedKeys = dropLargestKeys(payload);
  return {
    truncated: true,
    hint: hint ?? DEFAULT_HINT,
    ...(droppedKeys.length > 0 ? { omittedKeys: droppedKeys } : {}),
    ...payload,
  };
}

/**
 * `hint` is the narrowing a caller should apply if this particular tool's
 * answer had to be elided — naming the parameter beats "output truncated".
 */
export function serializeResult(payload: unknown, hint?: string): string {
  const compact = stringify(payload);
  const size = byteLength(compact);
  if (size <= PRETTY_LIMIT_BYTES) {
    return JSON.stringify(payload, null, 2) ?? "null";
  }
  if (size <= RESULT_BUDGET_BYTES) {
    return compact;
  }
  return stringify(elideToBudget(compact, hint));
}

/** Deliberately un-annotated: an interface here would not satisfy the SDK's
 *  `CallToolResult` index signature, an inferred object type does. */
export function textResult(payload: unknown, hint?: string) {
  return { content: [{ type: "text" as const, text: serializeResult(payload, hint) }] };
}
