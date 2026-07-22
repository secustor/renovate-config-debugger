/**
 * Browser shim for renovate/dist/logger/index.js.
 * Severs bunyan/fs/node:crypto AND doubles as the engine's instrumentation
 * channel: every Renovate log call is forwarded to the active TraceCollector.
 */
import { emitLog } from "../trace/collector";
import type { LogLevel } from "../trace/model";

type LogFn = (p1: unknown, p2?: string) => void;

function makeLevel(level: LogLevel): LogFn {
  return (p1, p2) => {
    if (typeof p1 === "string") {
      emitLog(level, undefined, p1);
    } else {
      emitLog(level, p1, p2);
    }
  };
}

const base = {
  trace: makeLevel("trace"),
  debug: makeLevel("debug"),
  info: makeLevel("info"),
  warn: makeLevel("warn"),
  error: makeLevel("error"),
  fatal: makeLevel("fatal"),
};

// `once` deliberately does NOT dedupe: for tracing we want every occurrence.
export const logger = {
  ...base,
  once: Object.assign({ ...base }, { reset: (): void => {} }),
};

export function init(): Promise<void> {
  return Promise.resolve();
}

export const levels: readonly string[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export function logLevel(): string {
  return "trace";
}

export function getProblems(): unknown[] {
  return [];
}

export function clearProblems(): void {}

export function getContext(): unknown {
  return undefined;
}

export function setContext(_value: unknown): void {}

export function setMeta(_obj: Record<string, unknown>): void {}

export function addMeta(_obj: Record<string, unknown>): void {}

export function removeMeta(_fields: string[]): void {}

export function withMeta<T>(_obj: Record<string, unknown>, cb: () => T): T {
  return cb();
}

export function addStream(_stream: unknown): void {}
