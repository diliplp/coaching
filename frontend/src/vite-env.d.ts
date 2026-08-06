/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUBLIC_ASSET_BASE_URL?: string;
  readonly VITE_INSTITUTE_NAME?: string;
  readonly VITE_INSTITUTE_SHORT_NAME?: string;
  readonly VITE_LOGO_URL?: string;
  readonly VITE_INSTITUTE_TAGLINE?: string;
  readonly VITE_ADMISSION_LABEL?: string;
  readonly VITE_PRIMARY_COLOR?: string;
  readonly VITE_PRIMARY_COLOR_DARK?: string;
  readonly VITE_PRIMARY_COLOR_LIGHT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
