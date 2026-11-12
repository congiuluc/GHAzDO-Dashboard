/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated https origins the dashboard may send tokens to. Empty disables backend mode. */
  readonly VITE_BACKEND_ALLOWLIST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
