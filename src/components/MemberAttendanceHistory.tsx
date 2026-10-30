import { ResponsiveSelect } from './CompactMobile';
import { uiMessage } from '../lib/uiText';
import { useEffect, useId, useRef, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  MapPin,
  ScanLine,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { revealWorkspaceRegion } from '../lib/workspaceViewport';
import ServiceDatePicker from './ServiceDatePicker';
import './member-activity.css';

type Entry = {
  id: string;
  event_id: string;
  checked_in_at: string;
  service_name: string;
  service_date: string | null;
  service_location: string | null;
  archived: boolean;
};
type History = {
  member_id: string;
  total: number;
  services: number;
  latest: string | null;
  page: number;
  page_size: number;
  rows: Entry[];
};
const format = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', ...options }).format(new Date(value));
const date = (value: string) => format(value, { dateStyle: 'medium' });
const clock = (value: string) => format(value, { hour: 'numeric', minute: '2-digit' });
const stamp = (value: string) => format(value, { dateStyle: 'medium', timeStyle: 'short' });
function manilaDay() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((k) => parts.find((p) => p.type === k)?.value).join('-');
}
export default function MemberAttendanceHistory({ memberId }: { memberId: string }) {
  const id = useId(),
    section = useRef<HTMLElement>(null),
    scrollPending = useRef(false);
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [range, setRange] = useState('all'),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [order, setOrder] = useState('newest'),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<History | null>(null),
    [loadedKey, setLoadedKey] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const day = manilaDay(),
    from =
      range === 'month'
        ? day.slice(0, 7) + '-01'
        : range === 'today'
          ? day
          : range === 'custom'
            ? start
            : '',
    to = range === 'month' || range === 'today' ? day : range === 'custom' ? end : '';
  const invalid = !!from && !!to && from > to,
    searching = search.trim() !== query;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const viewKey = JSON.stringify([memberId, query, from, to, page, order]);
  useEffect(() => {
    let active = true;
    if (invalid) {
      setData(null);
      setLoading(false);
      setError('Start date must be on or before end date.');
      return;
    }
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data: result, error: failure } = await supabase.rpc('lc_my_attendance_history', {
          p_search: query,
          p_start: from || null,
          p_end: to || null,
          p_page: page,
          p_order: order,
        });
        if (failure) throw failure;
        if (result?.member_id !== memberId || !Array.isArray(result.rows))
          throw new Error('Member Connection Changed');
        if (active) {
          setData(result as History);
          setLoadedKey(viewKey);
        }
      } catch (e) {
        if (active) {
          setData(null);
          const code = (e as { code?: string }).code;
          setError(
            code === 'PGRST202'
              ? 'Attendance history is unavailable. Ask the Owner to check database setup.'
              : 'Could not load your attendance. Refresh access if your account or member connection changed.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [memberId, query, from, to, page, order, revision, invalid, viewKey]);
  const filtered = !!search || range !== 'all' || order !== 'newest',
    busy = loading || searching,
    snapshot = !!data && loadedKey === viewKey && !searching;
  const pages = Math.max(1, Math.ceil((snapshot ? data.total : 0) / (data?.page_size || 20)));
  function clear() {
    setSearch('');
    setQuery('');
    setRange('all');
    setStart('');
    setEnd('');
    setOrder('newest');
    setPage(1);
  }
  function changePage(next: number) {
    scrollPending.current = true;
    setPage(next);
  }
  useEffect(() => {
    if (!busy && scrollPending.current) {
      scrollPending.current = false;
      revealWorkspaceRegion(section.current, 'start');
    }
  }, [busy, data, error]);
  return (
    <section
      className="lmh-panel lmma-panel"
      ref={section}
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
    >
      <header className="lmma-heading">
        <span className="lmma-heading-icon">
          <ScanLine size={22} />
        </span>
        <div>
          <p className="eyebrow">Attendance</p>
          <h2 id={`${id}-title`}>Your Check-In History</h2>
          <p>Saved attendance from completed and archived services.</p>
        </div>
        <button
          type="button"
          className="lmma-button lmma-refresh"
          aria-label="Refresh Attendance History"
          disabled={busy}
          aria-busy={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </header>
      <div className="lmh-filters">
        <label className="lmh-search-label">
          <span>Find a Service</span>
          <div className="lmh-search">
            <Search size={17} />
            <input
              type="search"
              value={search}
              maxLength={150}
              placeholder="Service name"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </label>
        <label>
          <span>Check-In Dates</span>
          <ResponsiveSelect
            value={range}
            onChange={(e) => {
              setRange(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </ResponsiveSelect>
        </label>
        <label>
          <span>Order</span>
          <ResponsiveSelect
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </ResponsiveSelect>
        </label>
        {range === 'custom' && (
          <div className="lmh-dates">
            <div>
              <label htmlFor={`${id}-from`}>From</label>
              <ServiceDatePicker
                id={`${id}-from`}
                value={start}
                onChange={(value) => {
                  setStart(value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label htmlFor={`${id}-to`}>To</label>
              <ServiceDatePicker
                id={`${id}-to`}
                value={end}
                onChange={(value) => {
                  setEnd(value);
                  setPage(1);
                }}
              />
            </div>
            <span>Either date can be left blank.</span>
          </div>
        )}
        <div className="lmh-filter-footer">
          <span>All times in Manila</span>
          <button
            type="button"
            className="lmma-button lmma-reset"
            disabled={!filtered}
            onClick={clear}
          >
            <RotateCcw size={13} />
            Reset Filters
          </button>
        </div>
      </div>
      {error && (
        <div className="lmma-error" role="alert">
          <p>{uiMessage(error)}</p>
          {!invalid && (
            <button
              type="button"
              className="lmma-button"
              disabled={busy}
              onClick={() => setRevision((v) => v + 1)}
            >
              Try Again
            </button>
          )}
        </div>
      )}
      {!snapshot && busy ? (
        <div className="lmma-loading" role="status">
          <RefreshCw size={18} />
          Loading your check-ins…
        </div>
      ) : (
        !error &&
        snapshot && (
          <>
            <div className="lmh-summary">
              <div>
                <span className="lmh-summary-icon">
                  <ScanLine size={18} />
                </span>
                <div>
                  <strong>{data.total.toLocaleString()}</strong>
                  <span>Matching Check-Ins</span>
                </div>
              </div>
              <div>
                <span className="lmh-summary-icon">
                  <CalendarDays size={18} />
                </span>
                <div>
                  <strong>{data.services.toLocaleString()}</strong>
                  <span>Services Attended</span>
                </div>
              </div>
              <div>
                <span className="lmh-summary-icon">
                  <Clock3 size={18} />
                </span>
                <div>
                  <strong className="lmh-latest">{data.latest ? date(data.latest) : '—'}</strong>
                  <span>
                    {data.latest ? `Latest · ${clock(data.latest)}` : 'No Matching Check-In'}
                  </span>
                </div>
              </div>
            </div>
            {loading && (
              <div className="lmma-updating-line" role="status">
                <span className="lmma-sr-only">Updating attendance…</span>
              </div>
            )}
            {!data.rows.length ? (
              <div className="lmma-empty">
                <CalendarDays size={28} />
                <div>
                  <h3>{filtered ? 'No Matching Check-Ins' : 'No Attendance Recorded'}</h3>
                  <p>
                    {filtered
                      ? 'Try another service name or reset your filters.'
                      : 'Your check-ins will appear here after you attend a service.'}
                  </p>
                </div>
                {filtered && (
                  <button type="button" className="lmma-button" onClick={clear}>
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="lmh-table-wrap">
                <table className="lmh-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Check-In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Service">
                          <div className="lmh-service">
                            <time
                              className="lmh-calendar"
                              dateTime={r.service_date || r.checked_in_at}
                              aria-label={date(r.service_date || r.checked_in_at)}
                            >
                              <span>
                                {format(r.service_date || r.checked_in_at, { month: 'short' })}
                              </span>
                              <strong>
                                {format(r.service_date || r.checked_in_at, { day: 'numeric' })}
                              </strong>
                            </time>
                            <div>
                              <strong>{r.service_name}</strong>
                              <div className="lmh-service-meta">
                                {r.service_date && (
                                  <span>
                                    <CalendarDays size={13} />
                                    {stamp(r.service_date)}
                                  </span>
                                )}
                                {r.service_location && (
                                  <span>
                                    <MapPin size={13} />
                                    {r.service_location}
                                  </span>
                                )}
                              </div>
                              {r.archived && <span className="lmh-archived">Archived Service</span>}
                            </div>
                          </div>
                        </td>
                        <td data-label="Check-In">
                          <time className="lmh-checkin" dateTime={r.checked_in_at}>
                            <strong>{clock(r.checked_in_at)}</strong>
                            <span>{date(r.checked_in_at)}</span>
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <footer className="lmma-pagination">
              <span>
                {data.total
                  ? (data.page - 1) * (data.page_size || 20) +
                    1 +
                    '–' +
                    Math.min(data.page * (data.page_size || 20), data.total) +
                    ' of ' +
                    data.total
                  : '0 Check-Ins'}{' '}
                · {data.page_size || 20} Per Page
              </span>
              <nav aria-label="Attendance History Pages">
                <button
                  type="button"
                  className="lmma-button lmma-icon"
                  aria-label="First Page"
                  disabled={busy || data.page === 1}
                  onClick={() => changePage(1)}
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  type="button"
                  className="lmma-button lmma-icon"
                  aria-label="Previous Page"
                  disabled={busy || data.page === 1}
                  onClick={() => changePage(data.page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  {data.page} / {pages}
                </span>
                <button
                  type="button"
                  className="lmma-button lmma-icon"
                  aria-label="Next Page"
                  disabled={busy || data.page >= pages}
                  onClick={() => changePage(data.page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  className="lmma-button lmma-icon"
                  aria-label="Last Page"
                  disabled={busy || data.page >= pages}
                  onClick={() => changePage(pages)}
                >
                  <ChevronsRight size={16} />
                </button>
              </nav>
            </footer>
          </>
        )
      )}
      <p className="lmh-note">
        Details are saved at check-in. Contact the church team if a record needs correction.
      </p>
    </section>
  );
}
