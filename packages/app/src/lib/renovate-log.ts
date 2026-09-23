/**
 * Roadmap 095 — reads the JSON debug log of a Renovate run (LOG_LEVEL=debug
 * LOG_FORMAT=json) for the dependencies its extraction found. Pure and
 * DOM-free; the raw text is never kept, only what is returned here.
 */
import type { ExtractedPackageFile, PackageDependency } from "@renovate-config-debugger/engine";
import {
  isNonEmptyString,
  isPlainObject,
  isString,
  isStringArray,
} from "@renovate-config-debugger/engine/is";

type LogRecord = Record<string, unknown>;

export interface RenovateLog {
  /** The Renovate version that wrote the log. */
  renovateVersion: string | null;
  /** `owner/repo`; null when the log names none (platform=local logs "local"). */
  slug: string | null;
  /** The base branch the package files are from; null for the default branch. */
  baseBranch: string | null;
  /** Further base branches the log extracted, not returned here. */
  otherBaseBranches: string[];
  /** Further repositories the log covered (autodiscover), not returned here. */
  otherRepositories: string[];
  /** The managers the extraction stats name — only those that matched files. */
  managers: string[];
  packageFiles: ExtractedPackageFile[];
}

export type RenovateLogResult = { ok: true; log: RenovateLog } | { ok: false; error: string };

const PACKAGE_FILES_MSG = "packageFiles with updates";

/** One JSON object, or null. Tolerates a prefix before the `{` (CI timestamps). */
function parseRecord(line: string): LogRecord | null {
  const start = line.indexOf("{");
  if (start === -1) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(line.slice(start));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** A JSON array of log objects, else NDJSON with non-JSON lines skipped. */
function readRecords(text: string): LogRecord[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const value: unknown = JSON.parse(trimmed);
      if (Array.isArray(value)) {
        return value.filter(isPlainObject);
      }
    } catch {
      // Not one array — fall through to line-by-line.
    }
  }
  const records: LogRecord[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const record = parseRecord(line);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

function stringField(record: LogRecord, key: string): string | null {
  const value = record[key];
  return isString(value) ? value : null;
}

/** Only the fields the dependency rows read — lookup results are dropped. */
function toDependency(raw: LogRecord): PackageDependency {
  const dep: PackageDependency = {};
  for (const key of [
    "depName",
    "packageName",
    "currentValue",
    "currentVersion",
    "datasource",
    "depType",
    "versioning",
    "lockedVersion",
  ] as const) {
    const value = raw[key];
    if (isNonEmptyString(value)) {
      dep[key] = value;
    }
  }
  if (isStringArray(raw["registryUrls"])) {
    dep.registryUrls = raw["registryUrls"];
  }
  if (isNonEmptyString(raw["skipReason"])) {
    dep.skipReason = raw["skipReason"] as PackageDependency["skipReason"];
  }
  return dep;
}

function packageFilesOf(config: LogRecord): ExtractedPackageFile[] {
  const files: ExtractedPackageFile[] = [];
  for (const [manager, entries] of Object.entries(config)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (!isPlainObject(entry) || !isNonEmptyString(entry["packageFile"])) {
        continue;
      }
      const deps = Array.isArray(entry["deps"]) ? entry["deps"].filter(isPlainObject) : [];
      const file: ExtractedPackageFile = {
        manager,
        fileName: entry["packageFile"],
        deps: deps.map(toDependency),
      };
      if (isNonEmptyString(entry["packageFileVersion"])) {
        file.packageFileVersion = entry["packageFileVersion"];
      }
      if (isNonEmptyString(entry["datasource"])) {
        file.datasource = entry["datasource"];
      }
      files.push(file);
    }
  }
  return files;
}

/** Every value of `key` in first-seen order; a missing one counts as "". */
function distinct(records: readonly LogRecord[], key: string): string[] {
  const seen: string[] = [];
  for (const record of records) {
    const value = stringField(record, key) ?? "";
    if (!seen.includes(value)) {
      seen.push(value);
    }
  }
  return seen;
}

function findLast(records: readonly LogRecord[], test: (r: LogRecord) => boolean) {
  return records.findLast(test) ?? null;
}

function renovateVersionOf(records: readonly LogRecord[], repository: string): string | null {
  const repoStart = findLast(
    records,
    (r) => r["msg"] === "Repository started" && r["repository"] === repository,
  );
  const started = findLast(records, (r) => r["msg"] === "Renovate started");
  return (
    (repoStart && stringField(repoStart, "renovateVersion")) ??
    (started && stringField(started, "renovateVersion")) ??
    null
  );
}

function managersOf(records: readonly LogRecord[], repository: string, baseBranch: string) {
  const complete = findLast(
    records,
    (r) =>
      r["msg"] === "Dependency extraction complete" &&
      (stringField(r, "repository") ?? "") === repository &&
      (stringField(r, "baseBranch") ?? "") === baseBranch,
  );
  const stats = complete?.["stats"];
  const managers = isPlainObject(stats) ? stats["managers"] : undefined;
  return isPlainObject(managers) ? Object.keys(managers) : [];
}

export function parseRenovateLog(text: string): RenovateLogResult {
  const records = readRecords(text);
  if (records.length === 0) {
    return {
      ok: false,
      error: "No JSON log lines found. Run Renovate with LOG_FORMAT=json and LOG_LEVEL=debug.",
    };
  }
  const lines = records.filter((r) => r["msg"] === PACKAGE_FILES_MSG && isPlainObject(r["config"]));
  const [repository = "", ...otherRepositories] = distinct(lines, "repository");
  const repoLines = lines.filter((r) => (stringField(r, "repository") ?? "") === repository);
  const [baseBranch = "", ...otherBaseBranches] = distinct(repoLines, "baseBranch");
  const chosen = findLast(repoLines, (r) => (stringField(r, "baseBranch") ?? "") === baseBranch);
  const config = chosen?.["config"];
  if (!isPlainObject(config)) {
    return {
      ok: false,
      error:
        "This log has no “packageFiles with updates” line, which Renovate writes at debug level. " +
        "Run Renovate with LOG_LEVEL=debug and LOG_FORMAT=json.",
    };
  }
  return {
    ok: true,
    log: {
      renovateVersion: renovateVersionOf(records, repository),
      slug: repository === "" || repository === "local" ? null : repository,
      baseBranch: baseBranch === "" ? null : baseBranch,
      otherBaseBranches,
      otherRepositories,
      managers: managersOf(records, repository, baseBranch),
      packageFiles: packageFilesOf(config),
    },
  };
}
