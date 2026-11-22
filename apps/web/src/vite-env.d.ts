/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** Public address used in invitation links; defaults to the address the app is opened from. */
  readonly VITE_APP_URL?: string;
}

declare const __BUILD_TIME__: string;
declare const __BUILD_SHA__: string;
