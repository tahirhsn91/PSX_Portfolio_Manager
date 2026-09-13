/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the dev banner's text; defaults to 'DEVELOPMENT ENVIRONMENT'. */
  readonly VITE_ENV_LABEL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
