import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './supabase';
import { authCodeFromUrl, authRedirect, validatedAccount, type LifeCityAccount } from './account';
import { errorMessage } from './format';

WebBrowser.maybeCompleteAuthSession();
type Context = {
  session: Session | null; account: LifeCityAccount | null; loading: boolean;
  error: string; signingIn: boolean; signIn: () => Promise<void>;
  signOut: () => Promise<void>; refreshAccount: () => Promise<void>;
};
const SessionContext = createContext<Context | null>(null);
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw Error('SessionProvider is required.');
  return value;
}
export function SessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<LifeCityAccount | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const current = useRef<Session | null>(null), alive = useRef(true), generation = useRef(0);
  const authLock = useRef(false), callbackInFlight = useRef<Promise<void> | null>(null);
  const lastCode = useRef('');

  const refreshAccount = useCallback(async () => {
    const uid = current.current?.user.id, request = ++generation.current;
    if (!uid) { setAccount(null); setLoading(false); return; }
    try {
      const { data, error: failure } = await supabase.rpc('lc_my_account');
      if (failure) throw failure;
      const next = validatedAccount(data, uid);
      if (alive.current && request === generation.current && current.current?.user.id === uid) {
        setAccount(next); setError('');
      }
    } catch (failure) {
      if (alive.current && request === generation.current) { setAccount(null); setError(errorMessage(failure)); }
    } finally { if (alive.current && request === generation.current) setLoading(false); }
  }, []);

  const completeCallback = useCallback(async (url: string) => {
    const code = authCodeFromUrl(url);
    if (!code || code === lastCode.current) return;
    if (callbackInFlight.current) return callbackInFlight.current;
    callbackInFlight.current = (async () => {
      const { error: failure } = await supabase.auth.exchangeCodeForSession(code);
      if (failure) throw Error('Could not finish sign-in. Please start Google sign-in again.');
      lastCode.current = code;
    })();
    try { await callbackInFlight.current; } finally { callbackInFlight.current = null; }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!configured) { setLoading(false); return; }
    let observed = false;
    function apply(next: Session | null) {
      if (!alive.current) return;
      const changed = current.current?.user.id !== next?.user.id;
      current.current = next; setSession(next);
      if (changed || !next) { generation.current++; setAccount(null); setLoading(Boolean(next)); }
      // Keep network requests outside the auth callback's internal lock.
      if (next) setTimeout(() => { if (alive.current) void refreshAccount(); }, 0);
      else setLoading(false);
    }
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { observed = true; apply(next); });
    void supabase.auth.getSession().then(({ data, error: failure }) => {
      if (failure) throw failure;
      if (!observed) apply(data.session);
    }).catch(() => { if (alive.current) { setError('Your saved session could not be restored. Please sign in again.'); setLoading(false); } });
    const receive = (url: string) => { void completeCallback(url).catch(failure => { if (alive.current) setError(errorMessage(failure)); }); };
    const link = Linking.addEventListener('url', event => receive(event.url));
    void Linking.getInitialURL().then(url => { if (url && alive.current) receive(url); }).catch(() => { if (alive.current) setError('The sign-in link could not be opened. Please sign in again.'); });
    const activity = AppState.addEventListener('change', state => {
      if (state === 'active') { supabase.auth.startAutoRefresh(); void refreshAccount(); }
      else supabase.auth.stopAutoRefresh();
    });
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refreshAccount(); }, 30_000);
    return () => { alive.current = false; generation.current++; clearInterval(timer); activity.remove(); link.remove(); data.subscription.unsubscribe(); supabase.auth.stopAutoRefresh(); };
  }, [completeCallback, refreshAccount]);

  const signIn = useCallback(async () => {
    if (authLock.current || !configured) return;
    authLock.current = true; setSigningIn(true); setError('');
    try {
      const { data, error: failure } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: authRedirect, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' },
      } });
      if (failure) throw failure;
      if (!data.url) throw Error('Google sign-in is unavailable.');
      const response = await WebBrowser.openAuthSessionAsync(data.url, authRedirect);
      if (response.type === 'success') await completeCallback(response.url);
    } catch (failure) { if (alive.current) setError(errorMessage(failure)); }
    finally { authLock.current = false; if (alive.current) setSigningIn(false); }
  }, [completeCallback]);
  const signOut = useCallback(async () => {
    setError('');
    const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
    if (failure) { setError('Could not sign out. Please retry.'); throw failure; }
    generation.current++; current.current = null; setSession(null); setAccount(null); lastCode.current = '';
  }, []);
  return <SessionContext.Provider value={{ session, account, loading, error, signingIn, signIn, signOut, refreshAccount }}>{children}</SessionContext.Provider>;
}
