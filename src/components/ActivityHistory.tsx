import FoldText from './FoldText';
import { useNoticeToast } from '../lib/useNoticeToast';
import { ResponsiveSelect } from './CompactMobile';

import { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileSearch,
  Search,
  RefreshCw,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { csvCell } from '../lib/memberCsv';
import './settings-panels.css';
type Entry = {
  id: string;
  actor_id: string | null;
  target_id: string | null;
  category: string;
  action: string;
  created_at: string;
  actor_name: string;
  actor_email: string | null;
  target_name: string;
  target_email: string | null;
  target_member_number?: string | null;
  before_value: Record<string, unknown>;
  after_value: Record<string, unknown>;
};
type Result = { rows: Entry[]; total: number; page: number; page_size: number };
const titles: Record<string, string> = {
  church_assigned: 'Church Assigned',
  church_removed: 'Church Removed',
  ministry_assigned: 'Ministry Assigned',
  ministry_removed: 'Ministry Removed',
  attendance_insert: 'Check-In Recorded',
  attendance_update: 'Check-In Updated',
  attendance_delete: 'Check-In Removed',
  member_insert: 'Member Created',
  member_update: 'Member Updated',
  member_delete: 'Member Deleted',
  service_insert: 'Service Created',
  service_update: 'Service Updated',
  service_delete: 'Service Deleted',
  service_archived: 'Service Archived',
  service_restored: 'Service Restored',
  mobile_updated: 'Mobile Number Updated',
  profile_request_approved: 'Profile Request Approved',
  grant_admin: 'Admin Access Granted',
  revoke_admin: 'Admin Access Removed',
  suspend: 'Access Suspended',
  reactivate: 'Access Reactivated',
  link_member: 'Member Linked',
  unlink_member: 'Member Unlinked',
  restore_defaults: 'Default Colors Restored',
  save_appearance: 'Appearance Saved',
};
const stamp = (s: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(s));
const value = (v: unknown): string =>
  v === null || v === undefined || v === ''
    ? 'Not Provided'
    : Array.isArray(v)
      ? v.length
        ? v.map(value).join(', ')
        : 'None'
      : typeof v === 'boolean'
        ? v
          ? 'Yes'
          : 'No'
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
function changedFields(r: Entry) {
  return [...new Set([...Object.keys(r.before_value), ...Object.keys(r.after_value)])].filter(
    (k) => JSON.stringify(r.before_value[k]) !== JSON.stringify(r.after_value[k]),
  );
}
const showValue = (key: string, v: unknown) =>
  key === 'Member ID' && (v === null || v === undefined)
    ? 'Not Linked'
    : ['Starts At', 'Ends At', 'Archived At', 'Check-In Time'].includes(key) &&
        typeof v === 'string' &&
        !Number.isNaN(Date.parse(v))
      ? stamp(v)
      : value(v);
const categories: Record<string, string> = {
  access: 'Account Access',
  links: 'Member Linking',
  appearance: 'Appearance',
  profiles: 'Member Profiles',
  directory: 'Member Directory',
  services: 'Services',
  assignments: 'Churches & Ministries',
  attendance: 'Attendance',
};
export function activityCsv(rows: Entry[], detailed: boolean, asOf: string) {
  const headings = [
    'Time (Manila)',
    'Category',
    'Activity',
    'Changed By',
    'Changed By Email',
    'Affected',
    'Member Number',
  ];
  if (detailed)
    headings.push(
      'Activity ID',
      'Time (UTC)',
      'Actor ID',
      'Target Account ID',
      'Before',
      'After',
      'Exported At (UTC)',
    );
  const label = (k: string) => (k === 'VIP' ? 'Starred' : k);
  const lines = [
    headings,
    ...rows.map((r) => {
      const row = [
        stamp(r.created_at),
        categories[r.category] ?? r.category,
        titles[r.action] ?? r.action,
        r.actor_name,
        r.actor_email ?? '',
        r.target_name,
        r.target_member_number ?? '',
      ];
      if (detailed) {
        const keys = changedFields(r);
        row.push(
          r.id,
          new Date(r.created_at).toISOString(),
          r.actor_id ?? '',
          r.target_id ?? '',
          keys.map((k) => `${label(k)}: ${showValue(k, r.before_value[k])}`).join('\n'),
          keys.map((k) => `${label(k)}: ${showValue(k, r.after_value[k])}`).join('\n'),
          new Date(asOf).toISOString(),
        );
      }
      return row;
    }),
  ];
  return '\uFEFF' + lines.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export default function ActivityHistory() {
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('all'),
    [days, setDays] = useState(30),
    [size, setSize] = useState(25),
    [oldest, setOldest] = useState(false),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<Result | null>(null),
    [loadedKey, setLoadedKey] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [exporting, setExporting] = useState(false),
    [exportMessage, setExportMessage] = useState(''),
    [exportError, setExportError] = useState('');
  useNoticeToast(exportMessage);
  useNoticeToast(exportError, 'error');
  const exportLock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function exportHistory(detailed: boolean) {
    if (exportLock.current || busy || error) return;
    exportLock.current = true;
    setExporting(true);
    setExportMessage('');
    setExportError('');
    try {
      const { data: result, error: failure } = await supabase.rpc('lc_export_activity', {
        p_search: query,
        p_category: category,
        p_days: days,
        p_oldest: oldest,
        p_detailed: detailed,
      });
      if (failure) throw failure;
      if (!mounted.current) return;
      if (!result || !Array.isArray(result.rows) || typeof result.as_of !== 'string')
        throw new Error('Invalid export response');
      if (!result.rows.length) {
        setExportMessage('No activities match these filters.');
        return;
      }
      const content = activityCsv(result.rows as Entry[], detailed, result.as_of);
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `LifeCity-Activity-${detailed ? 'Detailed' : 'Quick'}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      setExportMessage(
        `CSV prepared with ${result.rows.length.toLocaleString()} matching activities across all pages.`,
      );
    } catch (failure) {
      if (mounted.current)
        setExportError(
          (failure as { code?: string }).code === 'P0001'
            ? (failure as { message: string }).message
            : 'Could not export activity. Check database setup and your Owner access, then try again.',
        );
    } finally {
      exportLock.current = false;
      if (mounted.current) setExporting(false);
    }
  }
  const top = useRef<HTMLElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const viewKey = JSON.stringify([query, category, days, page, size, oldest]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data: result, error: failure } = await supabase.rpc('lc_owner_activity', {
          p_search: query,
          p_category: category,
          p_days: days,
          p_page: page,
          p_size: size,
          p_oldest: oldest,
        });
        if (failure) throw failure;
        if (!result || !Array.isArray(result.rows)) throw Error('Invalid history response');
        if (alive) {
          setData(result as Result);
          setLoadedKey(viewKey);
        }
      } catch {
        if (alive)
          setError(
            'Could not load history. Confirm the activity-history SQL updates are installed and your Owner access is active, then select Refresh.',
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [query, category, days, page, size, oldest, revision, viewKey]);
  const busy = loading || search.trim() !== query,
    hasSnapshot = !!data && loadedKey === viewKey,
    current = hasSnapshot ? data.page : page,
    pages = Math.max(1, Math.ceil((hasSnapshot ? data.total : 0) / size));
  const visibleRows = hasSnapshot ? data.rows : [],
    total = hasSnapshot ? data.total : 0;
  function go(n: number) {
    setPage(n);
    top.current?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  function clear() {
    setSearch('');
    setQuery('');
    setCategory('all');
    setDays(30);
    setSize(25);
    setOldest(false);
    setPage(1);
  }
  return (
    <section className="lch-panel lcsp-panel" ref={top} aria-labelledby="lch-title">
      <header className="lch-heading lcsp-heading">
        <div>
          <p className="eyebrow">Settings · Owner History</p>
          <h1 id="lch-title">
            <FoldText text="Activity History" />
          </h1>
          <p>Review saved changes to accounts, members, services, attendance, and appearance.</p>
        </div>
        <div className="lcsp-heading-aside">
          <span className="lcsp-label-chip">
            <ShieldCheck size={15} />
            Owner Only
          </span>
          <button
            type="button"
            className="lc-refresh-icon"
            aria-label="Refresh activity"
            title="Refresh activity"
            aria-busy={busy}
            onClick={() => setRevision((v) => v + 1)}
            disabled={busy}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </header>
      <div className="lch-filters">
        <label className="lch-search">
          <span>Find Activity</span>
          <div>
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Person, Email, or Action"
            />
          </div>
        </label>
        <label>
          <span>Category</span>
          <ResponsiveSelect
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Categories</option>
            <option value="access">Account Access</option>
            <option value="links">Member Linking</option>
            <option value="appearance">Appearance</option>
            <option value="profiles">Member Profiles</option>
            <option value="directory">Member Directory</option>
            <option value="services">Services</option>
            <option value="assignments">Churches &amp; Ministries</option>
            <option value="attendance">Attendance</option>
          </ResponsiveSelect>
        </label>
        <label>
          <span>Period</span>
          <ResponsiveSelect
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
            <option value={0}>All Time</option>
          </ResponsiveSelect>
        </label>
        <label>
          <span>Order</span>
          <ResponsiveSelect
            value={oldest ? 'oldest' : 'newest'}
            onChange={(e) => {
              setOldest(e.target.value === 'oldest');
              setPage(1);
            }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </ResponsiveSelect>
        </label>
      </div>
      <div className="lch-context">
        <span role="status">
          <span className="lcsp-context-count">
            {!hasSnapshot && busy
              ? 'Loading…'
              : `${total.toLocaleString()} ${total === 1 ? 'Entry' : 'Entries'}`}
          </span>
          <span className="lcsp-context-note">Manila Time</span>
        </span>
        {busy && hasSnapshot ? (
          <span className="lcsp-updating" role="status">
            <RefreshCw size={12} />
            Updating…
          </span>
        ) : (
          <button type="button" onClick={clear}>
            Reset Filters
          </button>
        )}
      </div>
      <details className="lch-help">
        <summary>About These Records</summary>
        <p>
          Directory and service history starts with Phase 6D and preserves names at the time of each
          change. Earlier categories use current account and affiliation labels. A profile approval
          may also have a matching directory update. Assignment and attendance logging starts with
          Phase 6E. Replacing an assignment can create removal and addition entries. Failed or
          rolled-back changes are not included.
        </p>
      </details>
      <details className="lcmx-export">
        <summary className="lcsp-export-summary">
          <Download size={17} />
          <span>Export Activity</span>
          <small>Current filters · All pages</small>
          <ChevronRight className="lcsp-disclosure-arrow" size={16} />
        </summary>
        <div className="lcmx-body">
          <p>Export matching records in the selected order. Up to 10,000 activities per file.</p>
          <div className="lcmx-options">
            <button
              type="button"
              disabled={exporting || busy || !!error}
              onClick={() => void exportHistory(false)}
            >
              <Download size={20} />
              <span>
                <strong>Quick CSV</strong>
                <small>Time, category, change, and the people involved.</small>
              </span>
            </button>
            <button
              type="button"
              disabled={exporting || busy || !!error}
              onClick={() => void exportHistory(true)}
            >
              <FileSearch size={20} />
              <span>
                <strong>Detailed CSV</strong>
                <small>
                  Adds audit IDs, timestamps, and before-and-after values. May include private notes
                  and contact details.
                </small>
              </span>
            </button>
          </div>
          {exporting && <p role="status">Preparing activity export…</p>}
          {exportMessage && (
            <p className="lcmx-success" role="status">
              {exportMessage}
            </p>
          )}
          {exportError && (
            <p className="lcmx-error" role="alert">
              {exportError}
            </p>
          )}
        </div>
      </details>
      {error && (
        <p role="alert" className="lch-error">
          {error}
        </p>
      )}
      {!hasSnapshot && busy ? (
        <div role="status" className="lcsp-loading">
          <RefreshCw size={18} />
          Loading activity…
        </div>
      ) : !error && !visibleRows.length ? (
        <div className="lch-empty">
          <History size={28} />
          <h2>No Matching Activity</h2>
          <p>Try another period, category, or search.</p>
        </div>
      ) : (
        <div className="lch-list" aria-busy={busy}>
          {visibleRows.map((r) => {
            const fields = changedFields(r);
            return (
              <article className="lch-entry" key={r.id} data-category={r.category}>
                <div className="lch-entry-head">
                  <div className="lch-entry-title">
                    <strong>{titles[r.action] ?? r.action}</strong>
                    <span className="lch-category-tag">{categories[r.category] ?? r.category}</span>
                  </div>
                  <time dateTime={r.created_at}>{stamp(r.created_at)}</time>
                </div>
                <dl className="lch-people">
                  <div>
                    <dt>Changed By</dt>
                    <dd>
                      {r.actor_name}
                      {r.actor_email && r.actor_email !== r.actor_name && (
                        <small>{r.actor_email}</small>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Affected</dt>
                    <dd>
                      {r.target_name}
                      {r.target_member_number && <small>{r.target_member_number}</small>}
                      {r.target_email && r.target_email !== r.target_name && (
                        <small>{r.target_email}</small>
                      )}
                    </dd>
                  </div>
                </dl>
                <details>
                  <summary>
                    <ChevronRight size={14} />
                    View Changes
                    <small>
                      {fields.length} {fields.length === 1 ? 'Field' : 'Fields'}
                    </small>
                  </summary>
                  <div className="lch-changes">
                    {!fields.length && <p>No field differences were recorded.</p>}
                    {fields.map((k) => (
                      <div key={k}>
                        <strong>{k === 'VIP' ? 'Starred' : k}</strong>
                        <span>
                          <small>Before</small>
                          {showValue(k, r.before_value[k])}
                        </span>
                        <span>
                          <small>After</small>
                          {showValue(k, r.after_value[k])}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="lch-id">Activity ID: {r.id}</p>
                </details>
              </article>
            );
          })}
        </div>
      )}
      <footer className="lch-pagination">
        <label>
          <span>Rows per Page</span>
          <ResponsiveSelect
            aria-label="Activity rows per page"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </ResponsiveSelect>
        </label>
        <nav aria-label="Activity Pages">
          <button
            type="button"
            aria-label="First Page"
            disabled={busy || !!error || current === 1}
            onClick={() => go(1)}
          >
            <ChevronsLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Previous Page"
            disabled={busy || !!error || current === 1}
            onClick={() => go(current - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            type="button"
            aria-label="Next Page"
            disabled={busy || !!error || current >= pages}
            onClick={() => go(current + 1)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            aria-label="Last Page"
            disabled={busy || !!error || current >= pages}
            onClick={() => go(pages)}
          >
            <ChevronsRight size={17} />
          </button>
        </nav>
      </footer>
    </section>
  );
}
