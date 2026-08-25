/**
 * Browser shim for renovate/dist/util/fs/index.js — the single fs choke point
 * every manager's extract path reads through (roadmap 078). Backing it with an
 * in-memory `{ path → content }` store severs fs-extra/find-up/node:stream
 * from the bundle AND sidesteps `ensureLocalPath`'s throw when
 * `GlobalConfig.localDir` is unset (plus its `../` escape guard, replicated
 * here as a plain prefix check).
 *
 * extract.ts seeds the store through upstream's own `writeLocalFile` import,
 * so the golden project (real fs, `localDir` pointing at a temp dir) and the
 * shimmed project (this map) run the same engine code — the byte-identity
 * proof stays honest.
 *
 * Contents are stored and returned as strings: the extract callers all pass
 * an encoding, and the browser has no Buffer to hand back for the ones that
 * do not.
 */
import { join, normalize, parse } from "pathe";

const files = new Map<string, string>();

function keyOf(fileName: string): string {
  return normalize(fileName).replace(/^\.\//, "");
}

/** Replicates upstream `isValidPath`: relative, no null bytes, no escape. */
export function isValidLocalPath(path: string): boolean {
  return !path.startsWith("/") && !path.includes("\0") && !normalize(path).startsWith("..");
}

export function resetLocalFiles(): void {
  files.clear();
}

/**
 * Upstream is `upath.parse(fileName).dir`, i.e. node's `path.posix.parse`,
 * which reports `""` for a path with no directory component ("package.json",
 * ".") — and upstream's walk-up loops until it sees exactly that. pathe
 * deviates and reports `"."` there, so returning it verbatim makes
 * `findLocalSiblingOrParent("package.json", ".npmrc")` spin forever (a busy
 * loop, not a stall — nothing yields, so no test timeout can interrupt it).
 * Mapping pathe's `"."` back to `""` restores node's contract for every caller.
 */
export function getParentDir(fileName: string): string {
  const dir = parse(fileName).dir;
  return dir === "." ? "" : dir;
}

export function getSiblingFileName(fileName: string, siblingName: string): string {
  return join(getParentDir(fileName), siblingName);
}

export function readLocalFile(fileName: string, _encoding?: string): Promise<string | null> {
  if (!isValidLocalPath(fileName)) {
    return Promise.resolve(null);
  }
  return Promise.resolve(files.get(keyOf(fileName)) ?? null);
}

export function writeLocalFile(fileName: string, fileContent: string): Promise<void> {
  files.set(keyOf(fileName), fileContent);
  return Promise.resolve();
}

export function deleteLocalFile(fileName: string): Promise<void> {
  files.delete(keyOf(fileName));
  return Promise.resolve();
}

export function localPathExists(pathName: string): Promise<boolean> {
  const key = keyOf(pathName);
  const asDir = `${key}/`;
  const exists = files.has(key) || [...files.keys()].some((k) => k.startsWith(asDir));
  return Promise.resolve(exists);
}

export function localPathIsFile(pathName: string): Promise<boolean> {
  return Promise.resolve(files.has(keyOf(pathName)));
}

export function localPathIsSymbolicLink(_pathName: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function readLocalSymlink(_fileName: string): Promise<string | null> {
  return Promise.resolve(null);
}

/** Upstream semantics: walk from the file's own directory up to the root. */
export async function findLocalSiblingOrParent(
  existingFileNameWithPath: string,
  otherFileName: string,
): Promise<string | null> {
  if (existingFileNameWithPath.startsWith("/") || otherFileName.startsWith("/")) {
    return null;
  }
  let current = existingFileNameWithPath;
  while (current !== "") {
    current = getParentDir(current);
    const candidate = join(current, otherFileName);
    if (await localPathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function findUpLocal(
  fileName: string | string[],
  cwd: string,
): Promise<string | null> {
  const names = Array.isArray(fileName) ? fileName : [fileName];
  let current = normalize(cwd);
  for (;;) {
    for (const name of names) {
      const candidate = current === "." || current === "" ? name : join(current, name);
      if (files.has(keyOf(candidate))) {
        return keyOf(candidate);
      }
    }
    if (current === "." || current === "") {
      return null;
    }
    current = getParentDir(current) || ".";
  }
}

export async function getLocalFiles(fileNames: string[]): Promise<Record<string, string | null>> {
  const fileContentMap: Record<string, string | null> = {};
  for (const fileName of fileNames) {
    fileContentMap[fileName] = await readLocalFile(fileName, "utf8");
  }
  return fileContentMap;
}

export function readLocalDirectory(path: string): Promise<string[]> {
  const prefix = `${keyOf(path)}/`;
  const names = new Set<string>();
  for (const key of files.keys()) {
    if (key.startsWith(prefix)) {
      const name = key.slice(prefix.length).split("/")[0];
      if (name !== undefined && name !== "") {
        names.add(name);
      }
    }
  }
  return Promise.resolve([...names]);
}

export function statLocalFile(_fileName: string): Promise<null> {
  return Promise.resolve(null);
}

export function renameLocalFile(_fromFile: string, _toFile: string): Promise<void> {
  return Promise.resolve();
}

export function chmodLocalFile(_fileName: string, _mode: number): Promise<void> {
  return Promise.resolve();
}

export function ensureDir(_dirName: string): Promise<void> {
  return Promise.resolve();
}

export function ensureLocalDir(dirName: string): Promise<string> {
  return Promise.resolve(keyOf(dirName));
}

// ---- cache-path surface: never exercised on the single-file extract path ---

export function privateCacheDir(): string {
  return "/__renovate-private-cache";
}

export function ensureCacheDir(name: string): Promise<string> {
  return Promise.resolve(`/__renovate-cache/others/${name}`);
}

export function readCacheFile(_fileName: string, _encoding?: string): Promise<null> {
  return Promise.resolve(null);
}

export function outputCacheFile(_file: string, _data: unknown): Promise<void> {
  return Promise.resolve();
}

export function cachePathExists(_pathName: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function statCacheFile(_pathName: string): Promise<null> {
  return Promise.resolve(null);
}

export function rmCache(_path: string): Promise<void> {
  return Promise.resolve();
}

export function renameCacheFile(_fromFile: string, _toFile: string): Promise<void> {
  return Promise.resolve();
}

export function createCacheWriteStream(_path: string): never {
  throw new Error("cache streams are not available in the browser");
}

export function createCacheReadStream(_path: string): never {
  throw new Error("cache streams are not available in the browser");
}

export function pipeline(..._streams: unknown[]): Promise<void> {
  return Promise.reject(new Error("stream pipelines are not available in the browser"));
}

export function readSystemFile(_fileName: string, _encoding?: string): Promise<null> {
  return Promise.resolve(null);
}

export function writeSystemFile(_fileName: string, _data: unknown): Promise<void> {
  return Promise.resolve();
}
