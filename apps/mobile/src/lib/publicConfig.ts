// Configuration mistake guard; authorization is still enforced by Supabase RLS.
// Decode only a public legacy key's role, without Buffer/browser dependencies.
function publicRole(segment: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0, value = 0, decoded = '';
  for (const char of segment.replace(/-/g, '+').replace(/_/g, '/')) {
    value = (value << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; decoded += String.fromCharCode((value >> bits) & 255); }
  }
  try { return JSON.parse(decoded).role ?? null; } catch { return null; }
}
export function isPublicConfig(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key || key.startsWith('sb_secret_')) return false;
  try { if (new URL(url).protocol !== 'https:') return false; } catch { return false; }
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split('.');
  return parts.length === 3 && publicRole(parts[1]) === 'anon';
}
