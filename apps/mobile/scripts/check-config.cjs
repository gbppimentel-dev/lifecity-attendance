const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw Error('Set MOBILE_SUPABASE_URL and MOBILE_SUPABASE_PUBLISHABLE_KEY in GitHub Actions secrets.');
const endpoint = new URL(url);
if (endpoint.protocol !== 'https:') throw Error('Supabase URL must use HTTPS.');
if (key.startsWith('sb_secret_')) throw Error('Use the public publishable key, never a Supabase secret key.');
if (key.split('.').length === 3) {
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (payload.role !== 'anon') throw Error('Use a public anon/publishable key, never a service role token.');
} else if (!key.startsWith('sb_publishable_')) throw Error('The public Supabase key format is not recognized.');
console.log('Public Supabase configuration is present.');
