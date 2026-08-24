import { compare, type Operation } from "fast-json-patch";

export function computeDelta(before: unknown, after: unknown): Operation[] {
  return compare(
    (before ?? {}) as Record<string, unknown>,
    (after ?? {}) as Record<string, unknown>,
  );
}

/** Best-effort conversion of logger meta into something structured-cloneable. */
export function toSerializable(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(
        JSON.stringify(value, (_k, v: unknown) =>
          v instanceof Error ? { name: v.name, message: v.message } : v,
        ),
      );
    } catch {
      return String(value);
    }
  }
}
