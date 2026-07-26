/**
 * Roadmap 043 — the same Worker, under Node, for self-hosters.
 *
 * `handleRequest` in `src/index.ts` is a pure `(Request, Env) => Response`
 * precisely so it does not need Cloudflare; this file is the thinnest possible
 * `node:http` adapter around it. It adds no policy of its own: headers (the
 * `Origin` the allow-list check depends on) and bodies are copied verbatim in
 * both directions, so the Worker's CORS/origin boundary — the security
 * boundary — behaves identically here and on Cloudflare.
 *
 * The `.ts` import is served by Node's built-in type stripping: the Worker
 * source is erasable-syntax-only, so the container needs no build step.
 */
import { createServer } from "node:http";
import { handleRequest } from "./src/index.ts";

const PORT = Number(process.env.PORT ?? 8788) || 8788;

/** Cloudflare's `env` binding, read from the process environment instead. */
const env = {
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "",
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? "",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "",
};

/** Bodies here are OAuth JSON (a few hundred bytes), so buffering is fine. */
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function toRequest(req, body) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (typeof one === "string") {
        headers.append(name, one);
      }
    }
  }
  // Only the pathname is read downstream; a malformed Host must not 500.
  let url;
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  } catch {
    url = new URL(req.url ?? "/", "http://localhost");
  }
  return new Request(url, { method: req.method, headers, body });
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const body = await readBody(req);
      const response = await handleRequest(toRequest(req, body), env);
      for (const [name, value] of response.headers) {
        res.setHeader(name, value);
      }
      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      // Never echo the cause: this process handles client secrets.
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"internal_error"}');
    }
  })();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`oauth-proxy listening on 0.0.0.0:${PORT}`);
});
