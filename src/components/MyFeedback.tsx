import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  MessageSquare,
  RefreshCw,
  Send,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { feedbackError } from './FeedbackWidget';
import { revealWorkspaceRegion } from '../lib/workspaceViewport';
import './member-activity.css';

type Ticket = {
  id: string;
  subject: string;
  status: string;
  updated_at: string;
  status_revision: number;
  unread: boolean;
};
type Result = { rows: Ticket[]; total: number; unread: number; page: number };
const labels: Record<string, string> = {
  new: 'New',
  reviewing: 'In Progress',
  resolved: 'Completed',
  closed: 'Considered',
};
const descriptions: Record<string, string> = {
  new: 'Received and waiting for review.',
  reviewing: 'Your feedback is being reviewed.',
  resolved: 'This ticket has been completed.',
  closed: 'Reviewed and saved for future consideration.',
};
const stamp = (value: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
export default function MyFeedback() {
  const section = useRef<HTMLElement>(null),
    scrollPending = useRef(false),
    alive = useRef(true),
    sequence = useRef(0),
    readLock = useRef(false);
  const [data, setData] = useState<Result | null>(null),
    [loadedPage, setLoadedPage] = useState(0),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function load() {
      if (inFlight || readLock.current) return;
      inFlight = true;
      const request = ++sequence.current;
      setLoading(true);
      try {
        const { data: next, error: failure } = await supabase.rpc('lc_my_feedback', {
          p_page: page,
        });
        if (failure) throw failure;
        if (!next || !Array.isArray(next.rows)) throw Error('Invalid Feedback Response');
        if (active && sequence.current === request) {
          setData(next as Result);
          setLoadedPage(page);
          setError('');
        }
      } catch (e) {
        if (active && sequence.current === request) {
          setData(null);
          setError(feedbackError(e));
        }
      } finally {
        inFlight = false;
        if (active && sequence.current === request) setLoading(false);
      }
    }
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('lc-feedback-sent', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('lc-feedback-sent', refresh);
    };
  }, [page, revision]);
  async function read(row: Ticket) {
    if (readLock.current || loading || !row.unread) return;
    readLock.current = true;
    setBusy(row.id);
    setError('');
    const request = sequence.current;
    try {
      const { error: failure } = await supabase.rpc('lc_read_feedback', {
        p_id: row.id,
        p_revision: row.status_revision,
      });
      if (failure) throw failure;
      if (alive.current && sequence.current === request) setRevision((v) => v + 1);
    } catch (e) {
      if (alive.current && sequence.current === request) {
        setData(null);
        setError(feedbackError(e));
      }
    } finally {
      readLock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  const snapshot = !!data && loadedPage === page,
    current = snapshot ? data.page : page,
    pages = Math.max(1, Math.ceil((snapshot ? data.total : 0) / 10)),
    blocked = loading || !!busy;
  function go(next: number) {
    scrollPending.current = true;
    setPage(next);
  }
  useEffect(() => {
    if (!loading && scrollPending.current) {
      scrollPending.current = false;
      revealWorkspaceRegion(section.current, 'start');
    }
  }, [loading, data, error]);
  return (
    <section
      ref={section}
      className="lc-my-feedback lmma-panel"
      aria-labelledby="lmma-feedback-title"
      aria-busy={blocked}
    >
      <header className="lmma-heading">
        <span className="lmma-heading-icon is-purple">
          <MessageSquare size={22} />
        </span>
        <div>
          <p className="eyebrow">App Feedback</p>
          <h2 id="lmma-feedback-title">Your Tickets</h2>
          <p>Track the status of your suggestions and reports.</p>
        </div>
        <div className="lmma-heading-actions">
          <button
            type="button"
            className="lmma-button lmma-primary"
            onClick={() => window.dispatchEvent(new Event('lc-open-feedback'))}
          >
            <Send size={15} />
            Send Feedback
          </button>
          <button
            type="button"
            className="lmma-button lmma-icon"
            aria-label="Refresh My Feedback"
            title="Refresh My Feedback"
            disabled={blocked}
            aria-busy={loading}
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </header>
      <div className="lmma-statusbar" role="status">
        <span>
          {snapshot ? `${data.total} ${data.total === 1 ? 'Ticket' : 'Tickets'}` : 'Your Tickets'}
        </span>
        <span className={snapshot && data.unread ? 'lmma-unread-count' : ''}>
          {snapshot && data.unread ? (
            <>
              <Bell size={13} />
              {data.unread} {data.unread === 1 ? 'Update' : 'Updates'}
            </>
          ) : (
            'All times in Manila'
          )}
        </span>
        {loading && snapshot && (
          <span className="lmma-refreshing">
            <RefreshCw size={13} />
            Updating…
          </span>
        )}
      </div>
      {error && (
        <div className="lmma-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="lmma-button"
            disabled={blocked}
            onClick={() => setRevision((v) => v + 1)}
          >
            Try Again
          </button>
        </div>
      )}
      {!snapshot && loading ? (
        <div className="lmma-loading" role="status">
          <RefreshCw size={18} />
          Loading your tickets…
        </div>
      ) : (
        !error &&
        snapshot &&
        (!data.rows.length ? (
          <div className="lmma-empty">
            <MessageSquare size={29} />
            <div>
              <h3>No Feedback Tickets</h3>
              <p>Send a suggestion or report a problem with the app.</p>
            </div>
            <button
              type="button"
              className="lmma-button"
              onClick={() => window.dispatchEvent(new Event('lc-open-feedback'))}
            >
              Send Feedback
              <Send size={14} />
            </button>
          </div>
        ) : (
          <div className="lc-my-ticket-list lmma-ticket-list">
            {data.rows.map((row) => (
              <article
                key={row.id}
                className={'lmma-ticket ' + row.status + (row.unread ? ' is-unread' : '')}
              >
                <div className="lmma-ticket-top">
                  <span className={'lmma-ticket-status ' + row.status}>
                    {labels[row.status] ?? row.status}
                  </span>
                  <small>#{row.id.slice(0, 8).toUpperCase()}</small>
                  {row.unread && (
                    <span className="lmma-update-tag">
                      <i />
                      New Update
                    </span>
                  )}
                </div>
                <h3>{row.subject}</h3>
                <p>{descriptions[row.status] || 'Your ticket status has changed.'}</p>
                <div className="lmma-ticket-bottom">
                  <time dateTime={row.updated_at}>{stamp(row.updated_at)}</time>
                  {row.unread ? (
                    <button
                      type="button"
                      className="lmma-button lmma-read-action"
                      disabled={blocked}
                      onClick={() => void read(row)}
                    >
                      <Check size={14} />
                      {busy === row.id ? 'Saving…' : 'Mark as Read'}
                    </button>
                  ) : (
                    <span className="lmma-read">
                      <CheckCircle2 size={14} />
                      Read
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ))
      )}
      {snapshot && !!data.total && !error && (
        <footer className="lmma-pagination">
          <span>
            {data.total} Tickets · Page {current} of {pages}
          </span>
          <nav aria-label="My Feedback Pages">
            {[
              { label: 'First Page', Icon: ChevronsLeft, n: 1, off: current === 1 },
              { label: 'Previous Page', Icon: ChevronLeft, n: current - 1, off: current === 1 },
              { label: 'Next Page', Icon: ChevronRight, n: current + 1, off: current >= pages },
              { label: 'Last Page', Icon: ChevronsRight, n: pages, off: current >= pages },
            ].map(({ label, Icon, n, off }) => (
              <button
                key={label}
                type="button"
                className="lmma-button lmma-icon"
                aria-label={label}
                title={label}
                disabled={blocked || off}
                onClick={() => go(n)}
              >
                <Icon size={17} />
              </button>
            ))}
          </nav>
        </footer>
      )}
    </section>
  );
}
