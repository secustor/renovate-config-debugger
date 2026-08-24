/**
 * Google Analytics (GA4), opt-in per deployment. Pure logic + one injector.
 *
 * The measurement id follows the same dual-source rule as the OAuth config
 * (roadmap 043): the deployment-time `globalThis.__RCD_ANALYTICS__` (what the
 * Docker entrypoint writes into `/rcd-config.js`) wins over the build-time
 * `VITE_GA_MEASUREMENT_ID` var (what the Pages build inlines). With no usable
 * id from either source gtag.js is never loaded — `vite dev`, previews and
 * unconfigured self-hosts send nothing.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * GA4 measurement ids are `G-` plus alphanumerics. The id ends up in the
 * gtag.js script URL, so anything else — including a UA-era id — reads as
 * "not configured" instead of reaching the DOM.
 */
const MEASUREMENT_ID = /^G-[A-Z0-9]+$/;

function toMeasurementId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const id = value.trim();
  return MEASUREMENT_ID.test(id) ? id : null;
}

function runtimeMeasurementId(): string | null {
  const raw = globalThis.__RCD_ANALYTICS__;
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  return toMeasurementId((raw as Record<string, unknown>).measurementId);
}

/**
 * Hostnames that serve a development, test or preview copy rather than a
 * deployment: the loopback names plus the reserved `.localhost` TLD, and the
 * empty hostname a `file://` page reports. Matched exactly or as a dot-suffix,
 * never as a substring — `localhost-mirror.example.com` is somebody's real
 * host. IPv6 literals arrive from `location.hostname` bracketed.
 */
const LOCAL_HOSTNAMES = new Set(["", "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** Whether a hostname is a real deployment, i.e. worth reporting traffic for. */
export function isTrackableHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return !LOCAL_HOSTNAMES.has(host) && !host.endsWith(".localhost");
}

/** The measurement id to track with, or null when analytics is off. */
export function getMeasurementId(hostname: string): string | null {
  const runtime = runtimeMeasurementId();
  if (runtime) {
    return runtime;
  }
  if (!isTrackableHostname(hostname)) {
    return null;
  }
  return toMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID);
}

/** Loads gtag.js and sends the initial page_view — a no-op without an id. */
export function initAnalytics(): void {
  const id = getMeasurementId(window.location.hostname);
  if (!id) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.append(script);

  const dataLayer = (window.dataLayer ??= []);
  // gtag.js dispatches on `arguments` objects, not arrays — pushing an array
  // is silently ignored, hence no rest parameters here.
  function gtag(..._args: unknown[]): void {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", id);
}
