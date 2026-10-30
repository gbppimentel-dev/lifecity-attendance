import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from '../demo/client';
import { isDemoMode } from '../demo/mode';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function appClient(): SupabaseClient {
  if (isDemoMode()) return createDemoClient() as unknown as SupabaseClient;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase settings. Check your .env.local file.');
  }
  return createClient(supabaseUrl, supabaseKey);
}

export const supabase = appClient();
