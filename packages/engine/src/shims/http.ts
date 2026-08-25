/**
 * Browser stub for renovate's got-backed http stack (roadmap 078): mapped over
 * util/http/got.js, util/http/http.js, util/http/index.js AND
 * util/http/gitlab.js. Manager extract files import datasource CLASSES just to
 * read their static `.id`, and those classes reach `Http`/`HttpBase`/
 * `RequestError` at module scope — without this stub any manager import drags
 * the Node-only `got` stack (and its node:stream/timers deps) into the graph.
 *
 * Extraction never performs a request; every method that would throws.
 */

function unavailable(): never {
  throw new Error("http requests are not available in the browser engine");
}

export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestError";
  }
}

export class HttpBase {
  protected hostType: string;
  /** The real base class stores its options; unshimmed subclasses
   *  (GithubHttp, GiteaHttp, …) read them through `this`. */
  protected options: unknown;

  constructor(hostType: string, options?: unknown) {
    this.hostType = hostType;
    this.options = options ?? {};
  }

  // The members the real HttpBase exposes beyond the leaf verbs — unshimmed
  // subclasses load over this class and call them via `super`/`this` at
  // request time. Each fails with the stub's diagnosable message instead of
  // an opaque "not a function".
  protected get baseUrl(): string | undefined {
    return undefined;
  }
  extraOptions(): never {
    unavailable();
  }
  protected processOptions(): never {
    unavailable();
  }
  protected _normalizeOptions(): never {
    unavailable();
  }
  protected handleError(): never {
    unavailable();
  }
  protected resolveUrl(): never {
    unavailable();
  }
  protected calculateRetryDelay(): never {
    unavailable();
  }
  protected resolveArgs(): never {
    unavailable();
  }
  request(): never {
    unavailable();
  }
  requestJson(): never {
    unavailable();
  }
  requestJsonUnsafe(): never {
    unavailable();
  }
  getBuffer(): never {
    unavailable();
  }
  getJsonSafe(): never {
    unavailable();
  }
  getYamlUnchecked(): never {
    unavailable();
  }
  headJson(): never {
    unavailable();
  }

  get(): never {
    unavailable();
  }
  getText(): never {
    unavailable();
  }
  getJson(): never {
    unavailable();
  }
  getJsonUnchecked(): never {
    unavailable();
  }
  getYaml(): never {
    unavailable();
  }
  getYamlSafe(): never {
    unavailable();
  }
  getToml(): never {
    unavailable();
  }
  getPlain(): never {
    unavailable();
  }
  head(): never {
    unavailable();
  }
  postJson(): never {
    unavailable();
  }
  putJson(): never {
    unavailable();
  }
  patchJson(): never {
    unavailable();
  }
  deleteJson(): never {
    unavailable();
  }
  stream(): never {
    unavailable();
  }
}

export class Http extends HttpBase {}

export class GitlabHttp extends HttpBase {
  constructor(type = "gitlab", options?: unknown) {
    super(type, options);
  }
}

export function setBaseUrl(_url: string): void {}

export function applyDefaultHeaders(_options: unknown): void {}

export function configureRejectUnauth(_options?: unknown): void {}

export function fetch(): never {
  unavailable();
}

export function normalize(): never {
  unavailable();
}

export function stream(): never {
  unavailable();
}

/** `util/http/keep-alive.js` builds Node keep-alive agents (agentkeepalive) at
 *  module scope; the browser's fetch stack manages its own connections. */
export const keepAliveAgents: Record<string, never> = {};
