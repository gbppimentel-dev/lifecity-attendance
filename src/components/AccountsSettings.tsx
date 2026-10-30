import './settings-accounts.css';
import { revealWorkspaceRegion } from '../lib/workspaceViewport';
import BorderGlow from './BorderGlow';
import FoldText from './FoldText';
import { useNoticeToast } from '../lib/useNoticeToast';
import { ResponsiveSelect } from './CompactMobile';

import { uiMessage, uiStatus } from '../lib/uiText';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Search,
  ShieldCheck,
  RefreshCw,
  UsersRound,
  Link2,
  Unlink,
  ShieldPlus,
  ShieldMinus,
  Pause,
  Play,
  Inbox,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { OwnerProfileRequests } from './ProfileChanges';
import MemberLinkRequests from './MemberLinkRequests';
import { supabase } from '../lib/supabase';

type Account = {
  user_id: string;
  email: string | null;
  display_name: string;
  role: 'owner' | 'admin' | 'user';
  status: 'active' | 'suspended';
  member_id: string | null;
  member_name: string | null;
  member_number?: string | null;
  updated_at: string;
};
type Action = 'grant_admin' | 'revoke_admin' | 'suspend' | 'reactivate';
type Result = { rows: Account[]; total: number; page: number; page_size: number };
const labels: Record<Action, string> = {
  grant_admin: 'Grant Admin',
  revoke_admin: 'Remove Admin',
  suspend: 'Suspend Access',
  reactivate: 'Reactivate Access',
};
const roleName = (role: Account['role']) =>
  role === 'user' ? 'User' : role === 'admin' ? 'Admin' : 'Owner';

export default function AccountsSettings({
  currentUserId,
  onLinkChanged,
}: {
  currentUserId: string;
  onLinkChanged: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ role: 'all', status: 'all', link: 'all' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const viewKey = JSON.stringify([
    query,
    page,
    filters.role,
    filters.status,
    filters.link,
    pageSize,
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useNoticeToast(notice);
  const [pending, setPending] = useState<{ account: Account; action: Action } | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkTarget, setLinkTarget] = useState<Account | null>(null);
  useEffect(() => {
    const leave = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string; page?: string }>).detail;
      if (
        (event.type === 'lifecity-settings-activate' && detail?.tab !== 'accounts') ||
        (event.type === 'lifecity-workspace-activate' && detail?.page !== 'settings')
      ) {
        setPending(null);
        setLinkTarget(null);
      }
    };
    window.addEventListener('lifecity-settings-activate', leave);
    window.addEventListener('lifecity-workspace-activate', leave);
    return () => {
      window.removeEventListener('lifecity-settings-activate', leave);
      window.removeEventListener('lifecity-workspace-activate', leave);
    };
  }, []);
  const listRef = useRef<HTMLElement>(null);
  const writeLock = useRef(false);
  const requestId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
      setPending(null);
      setLinkTarget(null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    setPending(null);
    setLinkTarget(null);
    void (async () => {
      try {
        const { data: result, error: failure } = await supabase.rpc('lc_owner_accounts_page', {
          p_search: query,
          p_page: page,
          p_role: filters.role,
          p_status: filters.status,
          p_link: filters.link,
          p_size: pageSize,
        });
        if (failure) throw failure;
        if (active && id === requestId.current) {
          setData(result as Result);
          setLoadedKey(viewKey);
        }
      } catch (failure) {
        if (active && id === requestId.current) {
          setData(null);
          setError(
            (failure as { code?: string }).code === 'PGRST202'
              ? 'Account management is unavailable. Check database setup, then refresh Accounts.'
              : 'Could not load accounts. Check your Owner access and try Refresh.',
          );
        }
      } finally {
        if (active && id === requestId.current) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [query, page, refresh, filters, pageSize, viewKey]);
  const searching = search.trim() !== query;
  const busy = loading || saving || searching;
  const hasCurrentData = !!data && loadedKey === viewKey && !searching;
  const currentPage = data?.page ?? page;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? pageSize)));
  const hasFilters = Boolean(
    search || filters.role !== 'all' || filters.status !== 'all' || filters.link !== 'all',
  );
  function changeFilter(key: 'role' | 'status' | 'link', value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
    setPending(null);
    setLinkTarget(null);
    setNotice('');
  }
  function clearFilters() {
    setSearch('');
    setQuery('');
    setFilters({ role: 'all', status: 'all', link: 'all' });
    setPage(1);
    setPending(null);
    setLinkTarget(null);
    setNotice('');
  }
  function go(next: number) {
    setPending(null);
    setLinkTarget(null);
    setPage(next);
    revealWorkspaceRegion(listRef.current, 'start');
  }
  async function apply() {
    if (!pending || writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    const target = pending;
    try {
      const { error: failure } = await supabase.rpc('lc_owner_change_access', {
        p_user_id: target.account.user_id,
        p_action: target.action,
        p_expected_updated_at: target.account.updated_at,
      });
      if (failure) throw failure;
      if (mounted.current) {
        setNotice(
          labels[target.action] +
            ' completed for ' +
            (target.account.email || target.account.display_name) +
            '.',
        );
        setPending(null);
        setRefresh((v) => v + 1);
      }
    } catch (failure) {
      if (mounted.current) {
        const code = (failure as { code?: string }).code;
        setError(
          code === 'P0001'
            ? (failure as { message: string }).message
            : 'Could not confirm the change. Refresh Accounts to check its current state before trying again.',
        );
        setPending(null);
        setData(null);
      }
    } finally {
      writeLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  function confirmation() {
    if (!pending) return '';
    const a = pending.account;
    if (pending.action === 'grant_admin')
      return 'This gives access to members, services, the scanner, attendance records and CSV exports. Account management remains Owner-only.';
    if (pending.action === 'revoke_admin')
      return 'This removes admin workspace access. The login and any linked member record remain.';
    if (pending.action === 'suspend')
      return 'This pauses app access, including admin data access. It does not delete the login, member record or attendance.';
    return (
      'This restores app access with the ' +
      roleName(a.role) +
      ' role' +
      (a.role === 'admin' ? ', including the admin workspace.' : '.')
    );
  }
  return (
    <div className="lc-accounts lcsa-workspace">
      <BorderGlow as="section" className="lca-hero lcsa-hero" borderRadius={22} animated>
        <div>
          <p className="eyebrow">Settings · Access Management</p>
          <h1>
            <FoldText text="Accounts & Access" />
          </h1>
          <p>Manage logins, member connections and profile requests.</p>
        </div>
        <div className="lca-owner">
          <span className="lcsa-owner-icon">
            <ShieldCheck size={23} />
          </span>
          <span>
            <strong>Owner Controls</strong>
            <small>Your access is protected</small>
          </span>
        </div>
      </BorderGlow>
      <OwnerProfileRequests />
      <MemberLinkRequests
        owner
        onChanged={() => {
          setRefresh((v) => v + 1);
          onLinkChanged();
        }}
      />
      <section className="lca-panel" ref={listRef} aria-labelledby="lca-heading" aria-busy={busy}>
        <header className="lca-heading">
          <span className="lcsa-section-icon">
            <UsersRound size={21} />
          </span>
          <div className="lcsa-heading-copy">
            <p className="eyebrow">Login Accounts</p>
            <h2 id="lca-heading">
              Accounts <span className="lcsa-count">{data?.total ?? '—'}</span>
            </h2>
            <p>Access is separate from a member’s Active / Inactive status.</p>
          </div>
          <button
            type="button"
            className="secondary-button lc-refresh-icon"
            aria-label="Refresh accounts"
            title="Refresh accounts"
            aria-busy={loading}
            disabled={saving || loading}
            onClick={() => {
              setRefresh((v) => v + 1);
              setNotice('');
            }}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="lca-toolbar lca-filter-toolbar">
          <div className="lca-filter-top">
            <label>
              <span>Search Accounts</span>
              <div className="lca-search">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="Search Accounts"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPending(null);
                    setLinkTarget(null);
                  }}
                  placeholder="Name, email, member or account ID"
                  disabled={saving}
                />
              </div>
            </label>
            <div className="lca-filter-tools">
              <span aria-live="polite">
                {busy
                  ? 'Updating…'
                  : (data?.total ?? 0) + ' ' + ((data?.total ?? 0) === 1 ? 'Account' : 'Accounts')}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={!hasFilters || saving}
                onClick={clearFilters}
              >
                Reset Filters
              </button>
            </div>
          </div>
          <div className="lca-filter-fields">
            <label>
              <span>Role</span>
              <ResponsiveSelect
                value={filters.role}
                disabled={saving}
                onChange={(e) => changeFilter('role', e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </ResponsiveSelect>
            </label>
            <label>
              <span>Access</span>
              <ResponsiveSelect
                value={filters.status}
                disabled={saving}
                onChange={(e) => changeFilter('status', e.target.value)}
              >
                <option value="all">All Access</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </ResponsiveSelect>
            </label>
            <label>
              <span>Member Link</span>
              <ResponsiveSelect
                value={filters.link}
                disabled={saving}
                onChange={(e) => changeFilter('link', e.target.value)}
              >
                <option value="all">All Accounts</option>
                <option value="linked">Linked Members</option>
                <option value="unlinked">Not Linked</option>
              </ResponsiveSelect>
            </label>
          </div>
        </div>
        <div className="lcsa-update-line" data-loading={loading || searching} aria-hidden="true" />
        {notice && (
          <p className="lca-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="lca-error" role="alert">
            {uiMessage(error)}
          </p>
        )}
        {!hasCurrentData && (loading || searching) ? (
          <div className="lca-loading lcsa-loading" role="status">
            <span />
            Loading accounts…
          </div>
        ) : (
          data &&
          hasCurrentData && (
            <>
              {data.rows.length === 0 ? (
                <div className="lca-empty lcsa-empty">
                  <Inbox size={25} aria-hidden="true" />
                  <div>
                    <h3>No Accounts Found</h3>
                    <p>Try another search or reset the filters.</p>
                  </div>
                  {hasFilters && (
                    <button className="secondary-button" onClick={clearFilters}>
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="lca-table-wrap">
                  <table className="lca-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Role</th>
                        <th>Access</th>
                        <th>Linked Member</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((a) => (
                        <Fragment key={a.user_id}>
                          <tr className={a.role === 'owner' ? 'is-owner' : ''}>
                            <td data-label="Account">
                              <div className="lcsa-account-identity">
                                <span className={'lcsa-avatar ' + a.role} aria-hidden="true">
                                  {a.display_name
                                    .trim()
                                    .split(/\s+/)
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join('')
                                    .toUpperCase() || '?'}
                                </span>
                                <div>
                                  <strong>
                                    {a.display_name}
                                    {a.user_id === currentUserId && (
                                      <small className="lcsa-you">You</small>
                                    )}
                                  </strong>
                                  <span>{a.email || 'No Email'}</span>
                                </div>
                              </div>
                            </td>
                            <td data-label="Role">
                              <span className={'lca-pill ' + a.role}>{roleName(a.role)}</span>
                            </td>
                            <td data-label="Access">
                              <span className={'lca-pill ' + a.status}>
                                <i aria-hidden="true" />
                                {a.status === 'active' ? 'Active' : 'Suspended'}
                              </span>
                            </td>
                            <td data-label="Linked Member">
                              <div className="lcb-member-cell">
                                <span>
                                  {a.member_name || 'Not Linked'}
                                  {a.member_number && (
                                    <small className="lcah-member-number">{a.member_number}</small>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td data-label="Actions">
                              <div className="lca-actions lca-unified-actions">
                                <button
                                  className={
                                    'lcb-link-trigger ' + (a.member_id ? 'is-unlink' : 'is-link')
                                  }
                                  disabled={busy}
                                  onClick={() => {
                                    setPending(null);
                                    setNotice('');
                                    setError('');
                                    setLinkTarget(a);
                                    requestAnimationFrame(() =>
                                      revealWorkspaceRegion(
                                        listRef.current?.querySelector<HTMLElement>('.lcb-panel') ??
                                          null,
                                      ),
                                    );
                                  }}
                                >
                                  {a.member_id ? <Unlink size={14} /> : <Link2 size={14} />}
                                  <span>{a.member_id ? 'Unlink' : 'Link Member'}</span>
                                </button>
                                {a.role === 'owner' || a.user_id === currentUserId ? (
                                  <span className="lca-protected">
                                    <ShieldCheck size={14} />
                                    Protected
                                  </span>
                                ) : (
                                  <>
                                    {(a.role === 'admin' || a.status === 'active') && (
                                      <button
                                        className={
                                          a.role === 'admin'
                                            ? 'lca-action-remove'
                                            : 'lca-action-grant'
                                        }
                                        disabled={busy}
                                        onClick={() => {
                                          setError('');
                                          setLinkTarget(null);
                                          setPending({
                                            account: a,
                                            action:
                                              a.role === 'admin' ? 'revoke_admin' : 'grant_admin',
                                          });
                                          requestAnimationFrame(() =>
                                            revealWorkspaceRegion(
                                              listRef.current?.querySelector<HTMLElement>(
                                                '.lca-confirm',
                                              ) ?? null,
                                            ),
                                          );
                                        }}
                                      >
                                        {a.role === 'admin' ? (
                                          <ShieldMinus size={14} />
                                        ) : (
                                          <ShieldPlus size={14} />
                                        )}
                                        <span>
                                          {a.role === 'admin' ? 'Remove Admin' : 'Grant Admin'}
                                        </span>
                                      </button>
                                    )}
                                    <button
                                      className={
                                        a.status === 'active'
                                          ? 'lca-action-suspend'
                                          : 'lca-action-reactivate'
                                      }
                                      disabled={busy}
                                      onClick={() => {
                                        setError('');
                                        setLinkTarget(null);
                                        setPending({
                                          account: a,
                                          action: a.status === 'active' ? 'suspend' : 'reactivate',
                                        });
                                        requestAnimationFrame(() =>
                                          revealWorkspaceRegion(
                                            listRef.current?.querySelector<HTMLElement>(
                                              '.lca-confirm',
                                            ) ?? null,
                                          ),
                                        );
                                      }}
                                    >
                                      {a.status === 'active' ? (
                                        <Pause size={14} />
                                      ) : (
                                        <Play size={14} />
                                      )}
                                      <span>
                                        {a.status === 'active' ? 'Suspend' : 'Reactivate'}
                                      </span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {linkTarget?.user_id === a.user_id && (
                            <tr className="lca-confirm-row">
                              <td colSpan={5}>
                                <MemberLinkPanel
                                  key={a.user_id + a.updated_at}
                                  account={linkTarget}
                                  onBusy={setSaving}
                                  onCancel={() => setLinkTarget(null)}
                                  onDone={() => {
                                    setLinkTarget(null);
                                    setNotice(
                                      a.member_id
                                        ? 'Member unlinked. Member data and attendance are preserved.'
                                        : 'Member linked successfully.',
                                    );
                                    setRefresh((v) => v + 1);
                                    onLinkChanged();
                                  }}
                                />
                              </td>
                            </tr>
                          )}
                          {pending?.account.user_id === a.user_id && (
                            <tr className="lca-confirm-row">
                              <td colSpan={5}>
                                <div
                                  className="lca-confirm"
                                  role="group"
                                  aria-label="Confirm Access Change"
                                >
                                  <div>
                                    <strong>
                                      {labels[pending.action]} for {a.email || a.display_name}?
                                    </strong>
                                    <p>{confirmation()}</p>
                                  </div>
                                  <div className="lca-actions">
                                    <button disabled={saving} onClick={() => setPending(null)}>
                                      Cancel
                                    </button>
                                    <button
                                      className="lca-confirm-button"
                                      disabled={saving}
                                      onClick={() => void apply()}
                                    >
                                      {saving ? 'Saving…' : 'Confirm ' + labels[pending.action]}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        )}
        <footer className="lca-pagination lcah-pagination">
          <div className="lcah-page-summary">
            <span>
              {(data?.total ?? 0)
                ? (currentPage - 1) * (data?.page_size ?? pageSize) +
                  1 +
                  '–' +
                  Math.min(currentPage * (data?.page_size ?? pageSize), data?.total ?? 0) +
                  ' of ' +
                  (data?.total ?? 0) +
                  ' Accounts'
                : '0 Accounts'}
            </span>
            <label className="lcah-page-size">
              <span>Per Page</span>
              <span className="lcah-size-field">
                <ResponsiveSelect
                  aria-label="Accounts per Page"
                  value={pageSize}
                  disabled={busy}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                    setPending(null);
                    setLinkTarget(null);
                    setNotice('');
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </ResponsiveSelect>
              </span>
            </label>
          </div>
          <nav aria-label="Account Pages">
            <button
              aria-label="First Page"
              disabled={busy || !data || !!error || currentPage === 1}
              onClick={() => go(1)}
            >
              <ChevronsLeft size={17} />
            </button>
            <button
              aria-label="Previous Page"
              disabled={busy || !data || !!error || currentPage === 1}
              onClick={() => go(currentPage - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {currentPage} / {pages}
            </span>
            <button
              aria-label="Next Page"
              disabled={busy || !data || !!error || currentPage >= pages}
              onClick={() => go(currentPage + 1)}
            >
              <ChevronRight size={17} />
            </button>
            <button
              aria-label="Last Page"
              disabled={busy || !data || !!error || currentPage >= pages}
              onClick={() => go(pages)}
            >
              <ChevronsRight size={17} />
            </button>
          </nav>
        </footer>
      </section>
    </div>
  );
}

type MemberCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  member_number: string;
  email: string | null;
  mobile: string | null;
  status: string;
  updated_at: string;
  already_linked: boolean;
};
function MemberLinkPanel({
  account,
  onBusy,
  onCancel,
  onDone,
}: {
  account: Account;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    rows: MemberCandidate[];
    total: number;
    page: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MemberCandidate | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (account.member_id || search.trim().length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setResult(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data, error: failure } = await supabase.rpc('lc_owner_member_candidates', {
            p_search: search.trim(),
            p_page: page,
          });
          if (failure) throw failure;
          if (active) setResult(data);
        } catch {
          if (active)
            setError(
              'Could not search members. Check database setup and your Owner access, then try again.',
            );
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, page, account.member_id]);
  async function save() {
    if (lock.current || (!account.member_id && !selected)) return;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError('');
    try {
      const { error: failure } = await supabase.rpc('lc_owner_set_member_link', {
        p_user_id: account.user_id,
        p_member_id: account.member_id ? null : selected!.id,
        p_expected_updated_at: account.updated_at,
        p_expected_member_updated_at: account.member_id ? null : selected!.updated_at,
      });
      if (failure) throw failure;
      if (alive.current) onDone();
    } catch (failure) {
      if (alive.current)
        setError(
          (failure as { code?: string }).code === 'P0001'
            ? (failure as { message: string }).message
            : 'Could not confirm this change. Close this panel and Refresh Accounts to check the current link before retrying.',
        );
    } finally {
      lock.current = false;
      onBusy(false);
      if (alive.current) setSaving(false);
    }
  }
  return (
    <section
      className="lcb-panel"
      aria-label={account.member_id ? 'Unlink Member Confirmation' : 'Link a Member'}
    >
      <header>
        <div>
          <p className="eyebrow">Member Connection</p>
          <h3>{account.member_id ? 'Unlink This Member?' : 'Link an Existing Member'}</h3>
        </div>
        <button disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </header>
      <div className="lcb-identities">
        <div>
          <small>Login Account</small>
          <strong>{account.display_name}</strong>
          <span>{account.email || 'No Email'}</span>
          <span>
            {roleName(account.role)} · {uiStatus(account.status)}
          </span>
        </div>
        <div>
          <small>{account.member_id ? 'Currently Linked Member' : 'Selected Member'}</small>
          <strong>
            {account.member_id
              ? account.member_name || 'Linked Member'
              : selected
                ? selected.first_name + ' ' + selected.last_name
                : 'Choose an Existing Profile Below'}
          </strong>
          {selected && (
            <>
              <span>
                {selected.member_number} · {uiStatus(selected.status)}
              </span>
              <span>
                {selected.email || 'No Email'} · {selected.mobile || 'No Mobile'}
              </span>
            </>
          )}
        </div>
      </div>
      {!account.member_id && (
        <>
          <label className="lcb-search-label">
            Search the Directory
            <input
              autoFocus
              type="search"
              disabled={saving}
              value={search}
              placeholder="Name, member ID, email or mobile — 2+ characters"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                setSelected(null);
                setResult(null);
                setError('');
              }}
            />
          </label>
          {loading ? (
            <p role="status">Searching Members…</p>
          ) : result ? (
            <>
              <div className="lcb-results">
                {result.rows.map((m) => (
                  <button
                    key={m.id}
                    disabled={saving || m.already_linked}
                    aria-pressed={selected?.id === m.id}
                    onClick={() => setSelected(m)}
                  >
                    <span>
                      <strong>
                        {m.first_name} {m.last_name}
                      </strong>
                      <small>
                        {m.member_number} · {uiStatus(m.status)}
                      </small>
                      <small>
                        {m.email || 'No Email'} · {m.mobile || 'No Mobile'}
                      </small>
                    </span>
                    <span>
                      {m.already_linked
                        ? 'Already Linked'
                        : selected?.id === m.id
                          ? 'Selected'
                          : 'Select'}
                    </span>
                  </button>
                ))}
              </div>
              {result.total === 0 && <p>No members match. Try their member ID or another name.</p>}
              {result.total > 25 && (
                <div className="lcb-pager">
                  <button
                    disabled={saving || result.page <= 1}
                    onClick={() => {
                      setPage(result.page - 1);
                      setSelected(null);
                    }}
                  >
                    Previous
                  </button>
                  <span>
                    Page {result.page} of {Math.ceil(result.total / 25)}
                  </span>
                  <button
                    disabled={saving || result.page * 25 >= result.total}
                    onClick={() => {
                      setPage(result.page + 1);
                      setSelected(null);
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <p>
              Search by an existing member’s details. Members without an email can be linked too.
            </p>
          )}
        </>
      )}
      <p className="lcb-helper">
        {account.member_id
          ? 'The login will no longer be connected to this member. Their QR ID, member profile and attendance remain intact. Account role and access status stay the same.'
          : 'Verify that the login belongs to this person before confirming. Matching names or emails alone do not prove identity. Linking does not overwrite contact details or change access roles.'}
      </p>
      {error && (
        <p className="lca-error" role="alert">
          {uiMessage(error)}
        </p>
      )}
      <footer>
        <button
          className="lcb-confirm"
          disabled={saving || (!account.member_id && !selected)}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : account.member_id ? 'Confirm Unlink' : 'Confirm Link'}
        </button>
      </footer>
    </section>
  );
}
