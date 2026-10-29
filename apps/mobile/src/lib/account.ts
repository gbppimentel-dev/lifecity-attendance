export type LifeCityAccount = {
  user_id: string; member_id: string | null; member_name: string | null;
  role: 'owner' | 'admin' | 'user'; status: 'active' | 'suspended';
  email: string | null; display_name: string; foundation_version: string;
};

export function validatedAccount(value: unknown, userId: string): LifeCityAccount {
  const a = value as Partial<LifeCityAccount> | null;
  if (!a || a.user_id !== userId || a.foundation_version !== 'LC-P01-02-v1'
    || !['owner', 'admin', 'user'].includes(a.role ?? '')
    || !['active', 'suspended'].includes(a.status ?? '')
    || !(a.member_id === null || typeof a.member_id === 'string')
    || typeof a.display_name !== 'string') throw Error('Account access could not be verified. Please retry.');
  return a as LifeCityAccount;
}

export const isStaff = (a: LifeCityAccount | null) => a?.status === 'active' && (a.role === 'owner' || a.role === 'admin');

export const authRedirect = 'lifecity://auth/callback';
export function authCodeFromUrl(value: string): string | null {
  const url = new URL(value);
  if (url.protocol !== 'lifecity:' || url.hostname !== 'auth' || url.pathname !== '/callback') return null;
  if (url.searchParams.get('error')) throw Error('Google sign-in was not completed. Please try again.');
  const code = url.searchParams.get('code');
  return code?.trim() || null;
}
