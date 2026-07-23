/**
 * Exact, dependency-free copies of the two Renovate transitive deps the forked
 * `migrateConfig` (shims/migration.ts) needs: `dequal` (dequal@2.0.3) and the
 * handful of `@sindresorhus/is@8.1.0` predicates. They live under renovate's
 * own node_modules and are not resolvable from this package, and the fork's
 * fixed-point / gating logic must match their behavior byte-for-byte, so they
 * are vendored verbatim rather than re-implemented. Re-check on a renovate bump
 * if either dependency's version changes.
 */

const has = Object.prototype.hasOwnProperty;

/** Verbatim dequal@2.0.3. */
export function dequal(foo: unknown, bar: unknown): boolean {
  let ctor: unknown;
  let len: number;
  if (foo === bar) {
    return true;
  }
  if (
    foo &&
    bar &&
    typeof foo === "object" &&
    typeof bar === "object" &&
    (ctor = (foo as { constructor: unknown }).constructor) ===
      (bar as { constructor: unknown }).constructor
  ) {
    if (ctor === Date) {
      return (foo as Date).getTime() === (bar as Date).getTime();
    }
    if (ctor === RegExp) {
      return foo.toString() === bar.toString();
    }
    if (ctor === Array) {
      if ((len = (foo as unknown[]).length) === (bar as unknown[]).length) {
        while (len-- && dequal((foo as unknown[])[len], (bar as unknown[])[len]));
      }
      return len === -1;
    }
    if (!ctor || typeof foo === "object") {
      len = 0;
      for (const key in foo as Record<string, unknown>) {
        if (has.call(foo, key) && ++len && !has.call(bar, key)) {
          return false;
        }
        if (
          !(key in (bar as Record<string, unknown>)) ||
          !dequal((foo as Record<string, unknown>)[key], (bar as Record<string, unknown>)[key])
        ) {
          return false;
        }
      }
      return Object.keys(bar as Record<string, unknown>).length === len;
    }
  }
  return foo !== foo && bar !== bar;
}

// @sindresorhus/is@8.1.0 predicates (Date/RegExp/Map/Set/typed-array branches
// of the upstream copies are irrelevant to JSON config values but preserved so
// behavior is identical).
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function isFunction(value: unknown): boolean {
  return typeof value === "function";
}

export function isArray(value: unknown): value is any[] {
  return Array.isArray(value);
}

export function isObject(value: unknown): boolean {
  return value !== null && (typeof value === "object" || isFunction(value));
}

function getObjectType(value: unknown): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function isMap(value: unknown): boolean {
  return getObjectType(value) === "Map";
}

function isSet(value: unknown): boolean {
  return getObjectType(value) === "Set";
}

export function isNonEmptyArray(value: unknown): value is any[] {
  return isArray(value) && value.length > 0;
}

export function isNonEmptyObject(value: unknown): boolean {
  return (
    isObject(value) &&
    !isFunction(value) &&
    !isArray(value) &&
    !isMap(value) &&
    !isSet(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}
