import { createClient, processLock } from '@supabase/supabase-js';
import { sessionStorage } from './secureStorage';
import { isPublicConfig } from './publicConfig';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = isPublicConfig(url, key);
// A missing configuration opens a setup screen, never a different live project.
export const supabase = createClient(configured ? url! : 'https://unconfigured.invalid', configured ? key! : 'unconfigured', {
  auth: { storage: sessionStorage, autoRefreshToken: true, persistSession: true,
    detectSessionInUrl: false, flowType: 'pkce', lock: processLock },
});
