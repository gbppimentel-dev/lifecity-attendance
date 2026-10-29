import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Chunk session JSON to avoid platform keychain value-size limits. The manifest
// switches only after all new chunks are written, so interrupted saves fail closed.
const preview = new Map<string, string>();
const read = (key: string) => Platform.OS === 'web' ? Promise.resolve(preview.get(key) ?? null) : SecureStore.getItemAsync(key);
const write = (key: string, value: string) => Platform.OS === 'web' ? Promise.resolve(void preview.set(key, value)) : SecureStore.setItemAsync(key, value);
const remove = (key: string) => Platform.OS === 'web' ? Promise.resolve(void preview.delete(key)) : SecureStore.deleteItemAsync(key);
type Manifest = { revision: string; count: number };
const safeKey = (key: string) => 'lc.' + key.replace(/[^a-zA-Z0-9._-]/g, '_');
async function manifest(key: string): Promise<Manifest | null> {
  const raw = await read(key);
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Manifest;
    return /^[a-zA-Z0-9-]+$/.test(m.revision) && Number.isInteger(m.count) && m.count > 0 && m.count <= 200 ? m : null;
  } catch { return null; }
}
async function clean(key: string, m: Manifest | null) {
  if (m) await Promise.all(Array.from({ length: m.count }, (_, i) => remove(`${key}.${m.revision}.${i}`)));
}
export const sessionStorage = {
  async getItem(input: string) {
    const key = safeKey(input), m = await manifest(key);
    if (!m) return null;
    const chunks = await Promise.all(Array.from({ length: m.count }, (_, i) => read(`${key}.${m.revision}.${i}`)));
    return chunks.some(c => c === null) ? null : chunks.join('');
  },
  async setItem(input: string, value: string) {
    const key = safeKey(input), old = await manifest(key);
    const next = { revision: Crypto.randomUUID(), count: Math.max(1, Math.ceil(value.length / 500)) };
    if (next.count > 200) throw Error('Sign-in session is too large to store securely.');
    try {
      await Promise.all(Array.from({ length: next.count }, (_, i) => write(`${key}.${next.revision}.${i}`, value.slice(i * 500, (i + 1) * 500))));
      await write(key, JSON.stringify(next));
    } catch (error) { await clean(key, next).catch(() => undefined); throw error; }
    await clean(key, old).catch(() => undefined);
  },
  async removeItem(input: string) {
    const key = safeKey(input), old = await manifest(key);
    await remove(key);
    await clean(key, old);
  },
};
