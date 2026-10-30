/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_APP_MODE?: 'demo' | 'live';
  readonly VITE_ORIGINAL_SITE_URL?: string;
}
