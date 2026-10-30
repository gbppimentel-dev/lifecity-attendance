/// <reference types="vite/client" />
// Change ID: LC-P08E-v1 — Vite environment types; no secret values belong here.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_APP_MODE?: 'demo' | 'live'
  readonly VITE_ORIGINAL_SITE_URL?: string
}
