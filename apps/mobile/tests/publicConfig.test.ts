import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicConfig } from '../src/lib/publicConfig.ts';
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
test('only HTTPS and public keys can configure the compiled client', () => {
  assert.equal(isPublicConfig('https://example.supabase.co', jwt('anon')), true);
  assert.equal(isPublicConfig('https://example.supabase.co', 'sb_publishable_public-key'), true);
  for (const key of [undefined, 'sb_secret_private-key', jwt('service_role'), jwt('authenticated'), 'garbage']) assert.equal(isPublicConfig('https://example.supabase.co', key), false);
  for (const url of [undefined, '', 'http://example.supabase.co', 'not-a-url']) assert.equal(isPublicConfig(url, jwt('anon')), false);
});
