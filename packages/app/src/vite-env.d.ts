/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GitHub App client id — enables "Sign in with GitHub" when set (009). */
  readonly VITE_GITHUB_CLIENT_ID?: string;
  /** Token-exchange Worker base URL — required alongside the client id (009). */
  readonly VITE_OAUTH_WORKER_URL?: string;
  /** GitHub App slug — optional; enables a direct install/manage link (009). */
  readonly VITE_GITHUB_APP_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
