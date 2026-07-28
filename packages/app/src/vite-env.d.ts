/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GitHub App client id — enables "Sign in with GitHub" when set (009). */
  readonly VITE_GITHUB_CLIENT_ID?: string;
  /** Token-exchange Worker base URL — required alongside the client id (009). */
  readonly VITE_OAUTH_WORKER_URL?: string;
  /** GitHub App slug — optional; enables a direct install/manage link (009). */
  readonly VITE_GITHUB_APP_SLUG?: string;
  /** GA4 measurement id — enables Google Analytics when set (Pages build). */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Roadmap 043 — deployment-time OAuth config, set by the `/rcv-config.js`
 * script that ships in `public/`. Expected shape:
 * `{ clientId: string, workerUrl: string, appSlug?: string }`.
 *
 * Deliberately typed `unknown`: unlike the `VITE_*` vars this is not a
 * build-time constant but whatever a deployment wrote into a served file, so
 * `getOAuthConfig` must validate it. The stub in `public/` defines nothing —
 * only the Docker entrypoint (and equivalent self-host setups) fills it in.
 */
declare var __RCV_OAUTH__: unknown;

/**
 * Deployment-time analytics config, same mechanism and caveats as above.
 * Expected shape: `{ measurementId: string }` (a GA4 `G-…` id).
 */
declare var __RCV_ANALYTICS__: unknown;
