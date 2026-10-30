import CountUp from './CountUp';
import RubberSegment from './RubberSegment';
import GlideSelect from './GlideSelect';
import { ResponsiveSelect } from './CompactMobile';
import FoldText from './FoldText';
import MagicBento from './MagicBento';
import BorderGlow from './BorderGlow';
import WhatsNew from './WhatsNew';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Sparkles,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWorkspaceCache } from '../lib/workspaceCache';

type AttendanceEvent = {
  id: string;
  name: string;
  starts_at: string;
  location: string | null;
  admin_note: string | null;
  is_sunday_service: boolean;
  archived_at: string | null;
};

type DashboardProps = {
  audience: 'admin' | 'owner';
  activeScannerEventId: string;
  onOpenScanner: () => void;
  onViewRecords: () => void;
};

type DashboardPeriod = 'all' | 'month' | 'year';

type CheckIn = {
  id: string;
  event_id: string;
  checked_in_at: string;
  members: {
    first_name: string;
    last_name: string;
    member_number: string;
  } | null;
  events: {
    name: string;
  } | null;
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCheckInTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function eventPostcardDate(value: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      year: 'numeric',
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return { month: parts.month, day: parts.day, weekday: parts.weekday, year: parts.year };
}

function CalendarBadge({
  value,
  tone = 'recent',
}: {
  value: string;
  tone?: 'recent' | 'upcoming' | 'current';
}) {
  const date = eventPostcardDate(value);
  return (
    <time
      className={`dashboard-calendar dashboard-calendar-${tone}`}
      dateTime={value}
      aria-label={formatEventDate(value)}
    >
      <span className="dashboard-calendar-binding" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="dashboard-calendar-month" aria-hidden="true">
        {date.month}
        <small>{date.year}</small>
      </span>
      <strong className="dashboard-calendar-day" aria-hidden="true">
        {date.day}
      </strong>
      <small className="dashboard-calendar-weekday" aria-hidden="true">
        {date.weekday}
      </small>
    </time>
  );
}

function EventDetails({ event }: { event: AttendanceEvent }) {
  return (
    <div className="dashboard-event-details">
      <p>
        <Clock3 size={14} aria-hidden="true" />
        <time dateTime={event.starts_at}>{formatEventDate(event.starts_at)}</time>
      </p>
      {event.location && (
        <p>
          <MapPin size={14} aria-hidden="true" />
          <span>{event.location}</span>
        </p>
      )}
    </div>
  );
}

type DashboardSnapshot = {
  period: DashboardPeriod;
  as_of: string;
  total_members: number;
  active_members: number;
  total_events: number;
  total_check_ins: number;
  latest_event: AttendanceEvent | null;
  latest_event_check_ins: number;
  latest_sunday_service: AttendanceEvent | null;
  latest_sunday_check_ins: number;
  upcoming_event: AttendanceEvent | null;
  active_scanner_event: AttendanceEvent | null;
  active_scanner_state: 'upcoming' | 'in-progress' | 'completed' | 'archived' | null;
  active_scanner_check_ins: number;
  recent_check_ins: CheckIn[];
};

function MobilePeriodPicker({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}) {
  return (
    <GlideSelect
      className="lcd-period-glide"
      ariaLabel="Dashboard period"
      size="sm"
      value={value}
      onChange={(next) => onChange(next as DashboardPeriod)}
      options={[
        { value: 'all', label: 'All Time' },
        { value: 'month', label: 'This Month' },
        { value: 'year', label: 'This Year' },
      ]}
    />
  );
}

function MobileCalendar({ value }: { value: string }) {
  const date = eventPostcardDate(value);
  return (
    <time className="lcd-mini-calendar" dateTime={value} aria-label={formatEventDate(value)}>
      <span aria-hidden="true">{date.month}</span>
      <strong aria-hidden="true">{date.day}</strong>
      <small aria-hidden="true">{date.weekday}</small>
    </time>
  );
}

export default function Dashboard({
  audience,
  activeScannerEventId,
  onOpenScanner,
  onViewRecords,
}: DashboardProps) {
  const cache = useWorkspaceCache();
  const initialKey = JSON.stringify(['all', activeScannerEventId]);
  const [mobileView, setMobileView] = useState<'next' | 'latest' | 'activity'>('next');
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(
    () => cache.get<DashboardSnapshot>(`dashboard:${initialKey}`) ?? null,
  );
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('all');
  const [finishedKey, setFinishedKey] = useState(() =>
    cache.get<DashboardSnapshot>(`dashboard:${initialKey}`) ? initialKey : '',
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const sequence = useRef(0);
  const key = JSON.stringify([dashboardPeriod, activeScannerEventId]);
  const currentRequest = useRef({ key, period: dashboardPeriod, scanner: activeScannerEventId });
  currentRequest.current = { key, period: dashboardPeriod, scanner: activeScannerEventId };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    void loadDashboard();
  }, [key]);
  useEffect(() => {
    let timer: number | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadDashboard(), 250);
    };
    const channel = supabase
      .channel('dashboard-attendance-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        scheduleRefresh,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, scheduleRefresh)
      .subscribe();

    const clock = window.setInterval(() => void loadDashboard(), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, []);

  async function loadDashboard() {
    if (!alive.current) return;
    const request = currentRequest.current;
    const id = ++sequence.current;
    const isCurrent = () =>
      alive.current && sequence.current === id && currentRequest.current.key === request.key;
    setRefreshing(true);
    try {
      const { data, error: failure } = await supabase.rpc('lc_dashboard_snapshot', {
        p_period: request.period,
        p_scanner_event_id: request.scanner || null,
      });
      if (!isCurrent()) return;
      if (failure) throw failure;
      if (
        !data ||
        data.period !== request.period ||
        !Array.isArray(data.recent_check_ins) ||
        typeof data.total_members !== 'number' ||
        typeof data.total_check_ins !== 'number'
      )
        throw new Error('Invalid dashboard response');
      cache.set(`dashboard:${request.key}`, data as DashboardSnapshot);
      setSnapshot(data as DashboardSnapshot);
      setError('');
    } catch {
      if (isCurrent()) {
        setSnapshot(null);
        setError('Could not load the dashboard. Please try again.');
      }
    } finally {
      if (isCurrent()) {
        setFinishedKey(request.key);
        setRefreshing(false);
      }
    }
  }

  const loading = !snapshot && !error;
  const snapshotPending = refreshing || finishedKey !== key;
  if (loading) {
    return (
      <section
        className="dashboard-loading-skeleton"
        aria-label="Loading Dashboard"
        aria-busy="true"
      >
        <div className="dashboard-skeleton-hero">
          <span className="dashboard-skeleton-kicker" />
          <span className="dashboard-skeleton-title" />
          <span className="dashboard-skeleton-copy" />
          <span className="dashboard-skeleton-copy short" />
        </div>
        <div className="dashboard-skeleton-metrics">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (error || !snapshot) {
    return (
      <section className="dashboard-card empty-state" role="alert">
        <h2>Dashboard Unavailable</h2>
        <p>{error || 'Please try loading the dashboard again.'}</p>
        <button
          type="button"
          className="secondary-button"
          disabled={refreshing}
          onClick={() => void loadDashboard()}
        >
          <RefreshCw size={16} />
          {refreshing ? 'Loading…' : 'Try Again'}
        </button>
      </section>
    );
  }

  const activeMemberCount = snapshot.active_members;
  const totalMemberCount = snapshot.total_members;
  const periodEventCount = snapshot.total_events;
  const periodCheckInCount = snapshot.total_check_ins;
  const latestEvent = snapshot.latest_event;
  const latestEventCount = snapshot.latest_event_check_ins;
  const latestSundayService = snapshot.latest_sunday_service;
  const latestSundayCount = snapshot.latest_sunday_check_ins;
  const upcomingEvent = snapshot.upcoming_event;
  const recentCheckIns = snapshot.recent_check_ins;
  const activeScannerEvent = snapshot.active_scanner_event;
  const activeScannerCount = snapshot.active_scanner_check_ins;
  const showActiveCheckIn =
    snapshot.active_scanner_state === 'upcoming' || snapshot.active_scanner_state === 'in-progress';
  const attendanceRate = activeMemberCount
    ? Math.round((latestSundayCount / activeMemberCount) * 100)
    : 0;
  const latestEventRate = activeMemberCount
    ? Math.round((latestEventCount / activeMemberCount) * 100)
    : 0;

  return (
    <>
      <style>{`
        @media (min-width: 901px) {
          body .lc-mobile-workspace > .content:has(.lc-dashboard-footer) {
            padding-bottom: 8px;
          }
          body .lc-mobile-workspace:has(.lc-dashboard-footer) {
            padding-bottom: 0;
          }
        }

        body .dashboard-editorial-hero .dashboard-hero-caption {
          text-transform: none !important;
        }
        body .dashboard-editorial-hero .dashboard-refresh,
        body .recent-checkins-card .recent-checkin-total {
          transform: none !important;
          rotate: none !important;
        }
        body .lc-dashboard-footer {
          width: 100%; margin: 36px auto 0; padding: 20px 16px 12px;
          display: grid; justify-items: center; gap: 5px;
          text-align: center; color: #858392;
        }
        body .lc-dashboard-footer .lc-dashboard-credit {
          margin: 0; font-size: 12px; font-weight: 400; line-height: 1.5;
        }
        body .lc-dashboard-footer .lc-dashboard-verse {
          max-width: 850px; margin: 0; font-size: 11px;
          font-weight: 400; font-style: italic; line-height: 1.6;
          color: #9693a3; text-wrap: balance;
        }
        body .lc-dashboard-footer .lc-dashboard-tech {
          min-height: 28px; margin: 2px 0 0; padding: 4px 12px;
          border: 0; background: transparent; color: #858392;
          font: inherit; font-size: 10px; line-height: 1.5;
          opacity: 1; cursor: default; transform: none; box-shadow: none;
        }
      `}</style>
      <section className="lcd-mobile" aria-label="Mobile Dashboard" aria-busy={snapshotPending}>
        <header className="lcd-head">
          <span className="lcd-header-art" aria-hidden="true">
            <span />
            <Sparkles size={21} />
          </span>
          <div>
            <p>Attendance Overview</p>
            <h1>
              <FoldText text="Dashboard" />
            </h1>
          </div>
          <button
            type="button"
            className="lcd-icon-button"
            onClick={() => void loadDashboard()}
            disabled={refreshing}
            aria-busy={refreshing}
            aria-label={refreshing ? 'Refreshing Dashboard' : 'Refresh Dashboard'}
          >
            <RefreshCw size={18} className={refreshing ? 'lc-auth-spin' : ''} />
          </button>
        </header>
        <div className="lcd-toolbar">
          <div className="lcd-period-control">
            <span>Showing</span>
            <MobilePeriodPicker value={dashboardPeriod} onChange={setDashboardPeriod} />
          </div>
          <p className="lcd-checkin-summary" aria-live="polite">
            <strong>{periodCheckInCount.toLocaleString('en-PH')}</strong>
            <span>Check-Ins</span>
          </p>
        </div>
        <div className="lcd-actions">
          <button type="button" onClick={onOpenScanner}>
            <Camera size={18} aria-hidden="true" />
            Open Scanner
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button type="button" onClick={onViewRecords}>
            <ArrowRight size={17} aria-hidden="true" />
            Records
          </button>
        </div>
        {showActiveCheckIn && activeScannerEvent && (
          <section className="lcd-live" aria-label="Current Check-In">
            <div>
              <span className="lcd-kicker">
                <i aria-hidden="true" />
                Checking In Now
              </span>
              <h2>{activeScannerEvent.name}</h2>
              <p>
                {formatEventDate(activeScannerEvent.starts_at)}
                {activeScannerEvent.location ? ` · ${activeScannerEvent.location}` : ''}
              </p>
            </div>
            <strong>
              {activeScannerCount.toLocaleString('en-PH')}
              <small>Check-Ins</small>
            </strong>
          </section>
        )}
        <section className="lcd-metrics" aria-label="Attendance Overview">
          <article className="lcd-metric-members">
            <span>
              <Users size={16} aria-hidden="true" />
              Members
            </span>
            <strong>
              <CountUp to={totalMemberCount} duration={1.1} separator="," />
            </strong>
            <small>{activeMemberCount.toLocaleString('en-PH')} Active</small>
          </article>
          <article className="lcd-metric-services">
            <span>
              <CalendarDays size={16} aria-hidden="true" />
              Services
            </span>
            <strong>
              <CountUp to={periodEventCount} duration={1.1} separator="," />
            </strong>
            <small>
              {dashboardPeriod === 'all'
                ? 'All Time'
                : dashboardPeriod === 'month'
                  ? 'This Month'
                  : 'This Year'}
            </small>
          </article>
          <article className="lcd-metric-latest">
            <span>
              <CheckCircle2 size={16} aria-hidden="true" />
              Latest Service
            </span>
            <strong>
              <CountUp to={latestEventCount} duration={1.1} separator="," />
            </strong>
            <small>Check-Ins</small>
          </article>
          <article className="lcd-metric-sunday">
            <span>
              <Clock3 size={16} aria-hidden="true" />
              Latest Sunday
            </span>
            <strong>
              {latestSundayService ? (
                <CountUp to={attendanceRate} duration={1.1} suffix="%" />
              ) : (
                '—'
              )}
            </strong>
            <small>
              {latestSundayService
                ? `${latestSundayCount.toLocaleString('en-PH')} of ${activeMemberCount.toLocaleString('en-PH')} Active`
                : 'No Sunday Yet'}
            </small>
          </article>
        </section>
        <section className="lcd-focus">
          <RubberSegment
            className="lcd-switch"
            variant="group"
            ariaLabel="Dashboard Details"
            value={mobileView}
            onChange={(value) => setMobileView(value as 'next' | 'latest' | 'activity')}
            equalSlots
            size="md"
            draggable
            items={[
              { value: 'next', label: 'Up Next', controls: 'lcd-detail' },
              { value: 'latest', label: 'Latest', controls: 'lcd-detail' },
              { value: 'activity', label: 'Activity', controls: 'lcd-detail' },
            ]}
          />
          <div id="lcd-detail" className="lcd-detail">
            <div className="lcd-detail-content" key={mobileView}>
              {mobileView === 'activity' ? (
                <>
                  <div className="lcd-activity-heading">
                    <h2>Recent Check-Ins</h2>
                    <button type="button" onClick={onViewRecords}>
                      Records <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {recentCheckIns.length === 0 ? (
                    <p className="lcd-empty">No check-ins yet.</p>
                  ) : (
                    <>
                      <div className="lcd-activity">
                        {recentCheckIns.slice(0, showAllActivity ? undefined : 3).map((checkIn) => (
                          <button type="button" key={checkIn.id} onClick={onViewRecords}>
                            <i className="lcd-activity-avatar" aria-hidden="true">
                              {checkIn.members
                                ? `${checkIn.members.first_name?.[0] ?? ''}${checkIn.members.last_name?.[0] ?? ''}`
                                : '?'}
                            </i>
                            <span>
                              <strong>
                                {checkIn.members
                                  ? `${checkIn.members.first_name} ${checkIn.members.last_name}`
                                  : 'Unknown Member'}
                              </strong>
                              <small>{checkIn.events?.name ?? 'Unknown Service'}</small>
                            </span>
                            <time dateTime={checkIn.checked_in_at}>
                              {formatCheckInTime(checkIn.checked_in_at)}
                            </time>
                          </button>
                        ))}
                      </div>
                      {recentCheckIns.length > 3 && (
                        <button
                          type="button"
                          className="lcd-more"
                          aria-expanded={showAllActivity}
                          onClick={() => setShowAllActivity((v) => !v)}
                        >
                          {showAllActivity ? 'Show Less' : `Show All ${recentCheckIns.length}`}
                        </button>
                      )}
                    </>
                  )}
                </>
              ) : (
                (() => {
                  const event = mobileView === 'next' ? upcomingEvent : latestEvent;
                  return event ? (
                    <>
                      <div className="lcd-event-heading">
                        <MobileCalendar value={event.starts_at} />
                        <div>
                          <span className="lcd-kicker">
                            {mobileView === 'next'
                              ? 'Upcoming Service'
                              : event.is_sunday_service
                                ? 'Most Recent Sunday'
                                : 'Most Recent Service'}
                          </span>
                          <h2>{event.name}</h2>
                        </div>
                      </div>
                      <div className="lcd-event-meta">
                        <p className="lcd-event-date">
                          <Clock3 size={15} aria-hidden="true" />
                          <time dateTime={event.starts_at}>{formatEventDate(event.starts_at)}</time>
                        </p>
                        {event.location && (
                          <p>
                            <MapPin size={15} aria-hidden="true" />
                            <span>{event.location}</span>
                          </p>
                        )}
                      </div>
                      {mobileView === 'latest' && (
                        <p className="lcd-event-total">
                          <strong>{latestEventCount.toLocaleString('en-PH')}</strong>
                          <span>
                            Check-Ins
                            {event.is_sunday_service
                              ? ` · ${activeMemberCount.toLocaleString('en-PH')} Active Members`
                              : ''}
                          </span>
                        </p>
                      )}
                      {mobileView === 'latest' && event.is_sunday_service && (
                        <div
                          className="lcd-progress"
                          role="progressbar"
                          aria-label="Latest Event Attendance"
                          aria-valuenow={Math.max(0, Math.min(latestEventRate, 100))}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuetext={`${latestEventRate}% attendance`}
                        >
                          <span
                            style={{ width: `${Math.max(0, Math.min(latestEventRate, 100))}%` }}
                          />
                        </div>
                      )}
                      {event.admin_note && (
                        <details className="lcd-note" key={event.id}>
                          <summary>Service Note</summary>
                          <p>{event.admin_note}</p>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="lcd-empty">
                      {mobileView === 'next'
                        ? 'No upcoming services. Create one in Services.'
                        : 'No service attendance recorded yet.'}
                    </p>
                  );
                })()
              )}
            </div>
          </div>
        </section>
        <details className="lcd-news">
          <summary>
            What’s New <span>Updates &amp; History</span>
          </summary>
          <WhatsNew audience={audience} />
        </details>
      </section>
      <div className="lcd-desktop" aria-busy={snapshotPending}>
        <BorderGlow as="section" className="dashboard-editorial-hero" borderRadius={18} animated>
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Overview</p>
            <h1>
              <FoldText text="Dashboard" />
            </h1>
            <p>A quick view of your LifeCity attendance activity.</p>
            <span className="dashboard-hero-caption">
              {activeMemberCount} Active Members · {periodCheckInCount} check-ins in this view
            </span>
          </div>

          <div className="dashboard-hero-utilities">
            <label className="dashboard-period-select">
              <span>Showing</span>
              <ResponsiveSelect
                value={dashboardPeriod}
                onChange={(event) => setDashboardPeriod(event.target.value as DashboardPeriod)}
                aria-label="Dashboard Date Range"
              >
                <option value="all">All Time</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </ResponsiveSelect>
            </label>

            <button
              type="button"
              className="dashboard-refresh"
              data-refreshing={snapshotPending}
              disabled={snapshotPending}
              aria-busy={snapshotPending}
              aria-label={snapshotPending ? 'Refreshing Dashboard Snapshot' : 'Refresh Snapshot'}
              onClick={() => void loadDashboard()}
            >
              <span className="dashboard-refresh-icons" aria-hidden="true">
                <RefreshCw className="dashboard-refresh-ready" size={16} />
                <LoaderCircle className="dashboard-refresh-busy" size={16} />
              </span>
              <span className="dashboard-refresh-labels" aria-hidden="true">
                <span className="dashboard-refresh-ready">Refresh Snapshot</span>
                <span className="dashboard-refresh-busy">Refreshing…</span>
              </span>
            </button>
          </div>

          <span className="dashboard-hero-orbit" aria-hidden="true" />
          <span className="dashboard-hero-spark dashboard-hero-spark-one" aria-hidden="true">
            ✦
          </span>
          <span className="dashboard-hero-spark dashboard-hero-spark-two" aria-hidden="true">
            ✦
          </span>
        </BorderGlow>

        {showActiveCheckIn && activeScannerEvent && (
          <section className="active-checkin-panel" aria-label="Current Check-In">
            <CalendarBadge value={activeScannerEvent.starts_at} tone="current" />
            <div className="active-checkin-copy">
              <p className="card-kicker">Currently Checking in</p>
              <h2>{activeScannerEvent.name}</h2>
              <EventDetails event={activeScannerEvent} />
            </div>

            <div className="active-checkin-total">
              <strong>{activeScannerCount}</strong>
              <span>Check-In{activeScannerCount === 1 ? '' : 's'} So Far</span>
            </div>

            <button className="primary-button active-checkin-button" onClick={onOpenScanner}>
              <Camera size={17} />
              Open Scanner
            </button>
          </section>
        )}

        <MagicBento
          as="section"
          className="dashboard-stats lc-dashboard-metrics"
          aria-label="Attendance Overview"
          columns={4}
          rowHeight="auto"
          gap={18}
          radius={16}
          theme="light"
          enableBorderGlow
          enableSpotlight
          clickEffect
          intro
          enableStars
          particleCount={12}
          items={[
            {
              id: 'members',
              title: 'Total Members',
              colSpan: 1,
              className: 'dashboard-stat-card dashboard-metric-card metric-members',
              content: (
                <>
                  <div className="dashboard-metric-copy">
                    <p className="lc-v3-metric-title">Total Members</p>
                    <small>
                      {activeMemberCount} Active Member{activeMemberCount === 1 ? '' : 's'}
                    </small>
                  </div>
                  <strong>
                    <CountUp to={totalMemberCount} duration={1.1} separator="," />
                  </strong>
                  <span className="dashboard-stat-icon members">
                    <Users size={20} />
                  </span>
                </>
              ),
            },
            {
              id: 'events',
              title: 'Events Created',
              colSpan: 1,
              className: 'dashboard-stat-card dashboard-metric-card metric-events',
              content: (
                <>
                  <div className="dashboard-metric-copy">
                    <p className="lc-v3-metric-title">Events Created</p>
                    <small>
                      {upcomingEvent ? `Next: ${upcomingEvent.name}` : 'No Upcoming Event'}
                    </small>
                  </div>
                  <strong>
                    <CountUp to={periodEventCount} duration={1.1} separator="," />
                  </strong>
                  <span className="dashboard-stat-icon events">
                    <CalendarDays size={20} />
                  </span>
                </>
              ),
            },
            {
              id: 'attendance',
              title: 'Latest Event Attendance',
              colSpan: 1,
              className: 'dashboard-stat-card dashboard-metric-card metric-attendance',
              content: (
                <>
                  <div className="dashboard-metric-copy">
                    <p className="lc-v3-metric-title">Latest Event Attendance</p>
                    <small>{latestEvent ? latestEvent.name : 'No Event Recorded Yet'}</small>
                  </div>
                  <strong>
                    <CountUp to={latestEventCount} duration={1.1} separator="," />
                  </strong>
                  <span className="dashboard-stat-icon attendance">
                    <CheckCircle2 size={20} />
                  </span>
                </>
              ),
            },
            {
              id: 'rate',
              title: 'Latest Sunday Attendance',
              colSpan: 1,
              className: 'dashboard-stat-card dashboard-metric-card metric-rate',
              content: (
                <>
                  <div className="dashboard-metric-copy">
                    <p className="lc-v3-metric-title">Latest Sunday Attendance</p>
                    <small>
                      {latestSundayService
                        ? `${latestSundayCount} of ${activeMemberCount} Active Members`
                        : 'No Sunday Service Recorded Yet'}
                    </small>
                  </div>
                  <strong>
                    {latestSundayService ? (
                      <CountUp to={attendanceRate} duration={1.1} suffix="%" />
                    ) : (
                      '—'
                    )}
                  </strong>
                  <span className="dashboard-stat-icon rate">
                    <Clock3 size={20} />
                  </span>
                </>
              ),
            },
          ]}
        />

        <MagicBento
          as="section"
          className="dashboard-grid lc-dashboard-bento"
          aria-label="Gatherings and Recent Check-Ins"
          columns={4}
          rowHeight="auto"
          gap={18}
          radius={16}
          theme="light"
          enableBorderGlow
          enableSpotlight
          clickEffect
          intro
          enableStars
          particleCount={12}
          items={[
            {
              id: 'latest',
              title: 'Most Recent Gathering',
              colSpan: 2,
              className: `dashboard-card latest-event-card event-postcard event-postcard-recent${latestEvent ? ' has-date' : ''}`,
              content: (
                <>
                  <span className="event-postcard-spark" aria-hidden="true">
                    ✦
                  </span>
                  <div className="dashboard-event-heading">
                    {latestEvent && <CalendarBadge value={latestEvent.starts_at} />}
                    <div className="dashboard-event-heading-copy">
                      <div className="dashboard-event-eyebrow">
                        <p className="card-kicker">
                          {latestEvent?.is_sunday_service
                            ? 'Most Recent Sunday Service'
                            : 'Most Recent Event'}
                        </p>
                        {latestEvent && (
                          <span className="status active">
                            {latestEventCount} Check-In{latestEventCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <h2>{latestEvent?.name ?? 'No Events Yet'}</h2>
                    </div>
                  </div>

                  {latestEvent ? (
                    <>
                      <EventDetails event={latestEvent} />
                      {latestEvent.admin_note && (
                        <p className="dashboard-service-note">
                          <span>Service Note</span>
                          {latestEvent.admin_note}
                        </p>
                      )}
                      {latestEvent.is_sunday_service ? (
                        <>
                          <div className="dashboard-attendance-summary">
                            <p className="latest-event-summary">
                              <strong>{latestEventCount}</strong> of {activeMemberCount} Active
                              Members Checked In
                            </p>
                            <span className="dashboard-attendance-rate">{latestEventRate}%</span>
                            <div
                              className="attendance-progress"
                              role="progressbar"
                              aria-label="Latest Event Attendance"
                              aria-valuenow={Math.max(0, Math.min(latestEventRate, 100))}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuetext={`${latestEventRate}% attendance`}
                            >
                              <span
                                style={{ width: `${Math.max(0, Math.min(latestEventRate, 100))}%` }}
                              />
                            </div>
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <p className="muted">Create an event to start tracking attendance here.</p>
                  )}
                </>
              ),
            },
            {
              id: 'next',
              title: 'Next Event',
              colSpan: 2,
              className: `dashboard-card next-event-card event-postcard event-postcard-upcoming${upcomingEvent ? ' has-date' : ''}`,
              content: (
                <>
                  <span className="event-postcard-spark" aria-hidden="true">
                    ✦
                  </span>
                  <div className="dashboard-event-heading">
                    {upcomingEvent && (
                      <CalendarBadge value={upcomingEvent.starts_at} tone="upcoming" />
                    )}
                    <div className="dashboard-event-heading-copy">
                      <p className="card-kicker">Next Event</p>
                      <h2>{upcomingEvent?.name ?? 'Nothing Scheduled'}</h2>
                    </div>
                  </div>
                  {upcomingEvent ? (
                    <EventDetails event={upcomingEvent} />
                  ) : (
                    <p className="muted">Create an event when your next service is confirmed.</p>
                  )}
                  {upcomingEvent?.admin_note && (
                    <p className="dashboard-service-note dashboard-upcoming-note">
                      <span>Service Note</span>
                      {upcomingEvent.admin_note}
                    </p>
                  )}
                </>
              ),
            },
            {
              id: 'recent',
              title: 'Recent Check-Ins',
              colSpan: 4,
              className: 'dashboard-card recent-checkins-card',
              content: (
                <>
                  <div className="dashboard-card-heading">
                    <div>
                      <p className="card-kicker">Live Activity</p>
                      <h2>Recent Check-Ins</h2>
                    </div>
                    <div className="recent-checkin-actions">
                      <span className="recent-checkin-total">{periodCheckInCount} Total</span>
                      <button
                        type="button"
                        className="dashboard-records-link"
                        onClick={onViewRecords}
                      >
                        View All Records
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>

                  {recentCheckIns.length === 0 ? (
                    <p className="dashboard-empty">Recent QR scans will appear here.</p>
                  ) : (
                    <div className="recent-checkin-list">
                      {recentCheckIns.map((checkIn, index) => (
                        <button
                          type="button"
                          className={`recent-checkin-row${index === 0 ? ' is-fresh' : ''}`}
                          key={checkIn.id}
                          onClick={onViewRecords}
                          aria-label={`View Attendance Records After ${checkIn.members ? `${checkIn.members.first_name} ${checkIn.members.last_name}` : 'This Check-In'}`}
                        >
                          <div className="avatar">
                            {checkIn.members
                              ? `${checkIn.members.first_name?.[0] ?? ''}${checkIn.members.last_name?.[0] ?? ''}`
                              : '?'}
                          </div>
                          <div className="recent-checkin-surface">
                            <div className="recent-checkin-copy">
                              <strong>
                                {checkIn.members
                                  ? `${checkIn.members.first_name} ${checkIn.members.last_name}`
                                  : 'Unknown Member'}
                              </strong>
                              <span>{checkIn.events?.name ?? 'Unknown Event'}</span>
                              {index === 0 && <em>Latest</em>}
                            </div>
                            <time
                              dateTime={checkIn.checked_in_at}
                              title={formatEventDate(checkIn.checked_in_at)}
                            >
                              {formatCheckInTime(checkIn.checked_in_at)}
                            </time>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ),
            },
          ]}
        />

        <WhatsNew audience={audience} />
      </div>
    </>
  );
}
