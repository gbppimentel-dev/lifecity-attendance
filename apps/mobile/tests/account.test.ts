import test from 'node:test';
import assert from 'node:assert/strict';
import { authCodeFromUrl, isStaff, validatedAccount } from '../src/lib/account.ts';
const owner = { user_id: 'owner', member_id: null, member_name: null, role: 'owner', status: 'active', email: null, display_name: 'Owner', foundation_version: 'LC-P01-02-v1' };
test('protected access rejects a different user, unknown backend, role or status', () => {
  assert.equal(isStaff(validatedAccount(owner, 'owner')), true);
  for (const bad of [null, { ...owner, user_id: 'someone-else' }, { ...owner, foundation_version: 'other' }, { ...owner, role: 'superadmin' }, { ...owner, status: 'unknown' }]) assert.throws(() => validatedAccount(bad, 'owner'));
  assert.equal(isStaff(validatedAccount({ ...owner, status: 'suspended' }, 'owner')), false);
});
test('only the native callback accepts PKCE codes; access tokens are never imported from URLs', () => {
  assert.equal(authCodeFromUrl('lifecity://auth/callback?code=one-use-code'), 'one-use-code');
  for (const url of ['https://example.com/auth/callback?code=x', 'lifecity://other/callback?code=x', 'lifecity://auth/else?code=x', 'lifecity://auth/callback#access_token=x']) assert.equal(authCodeFromUrl(url), null);
  assert.throws(() => authCodeFromUrl('lifecity://auth/callback?error=access_denied'));
});
