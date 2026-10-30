import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNoticeToast } from '../lib/useNoticeToast';
import {
  Bug,
  Check,
  CheckCircle2,
  Lightbulb,
  LoaderCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import './feedback-widget.css';

export const feedbackCategories = [
  { value: 'bug', label: 'Bug Report', icon: Bug },
  { value: 'idea', label: 'Feature Idea', icon: Lightbulb },
  { value: 'improvement', label: 'Improvement', icon: Sparkles },
  { value: 'other', label: 'Other', icon: MessageSquare },
] as const;
export function feedbackError(error: unknown) {
  const e = error as { code?: string; message?: string };
  return e.code === 'P0001'
    ? e.message || 'Please try again.'
    : e.code === 'PGRST202'
      ? 'Feedback is not set up yet. Please contact the Owner.'
      : 'Could not complete the request. Check your connection and try again.';
}
export default function FeedbackWidget() {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    successTitle = useRef<HTMLHeadingElement>(null);
  const [uid, setUid] = useState<string | null>(null),
    [authReady, setAuthReady] = useState(false),
    [open, setOpen] = useState(false);
  const [category, setCategory] = useState('bug'),
    [subject, setSubject] = useState(''),
    [message, setMessage] = useState(''),
    [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  useNoticeToast(sent ? 'Feedback sent. Thank you.' : '');
  useNoticeToast(error, 'error');
  const lock = useRef(false),
    requestId = useRef<string | null>(null),
    currentUid = useRef<string | null>(null),
    generation = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('lc-open-feedback', show);
    return () => window.removeEventListener('lc-open-feedback', show);
  }, []);
  useEffect(() => {
    alive.current = true;
    let observed = false,
      disposed = false;
    function auth(next: string | null) {
      if (disposed) return;
      if (currentUid.current !== next) {
        generation.current++;
        currentUid.current = next;
        requestId.current = null;
        setSubject('');
        setMessage('');
        setAnonymous(false);
        setSent(false);
        setError('');
      }
      setUid(next);
      setAuthReady(true);
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      observed = true;
      auth(session?.user.id ?? null);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!disposed && !observed) auth(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (!disposed && !observed) auth(null);
      });
    return () => {
      disposed = true;
      alive.current = false;
      generation.current++;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    if (!el) return;
    const initiator = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      el.close();
      document.body.style.overflow = previous;
      (initiator?.isConnected ? initiator : trigger.current)?.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (open && sent) successTitle.current?.focus({ preventScroll: true });
  }, [open, sent]);
  function close() {
    if (!lock.current) setOpen(false);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!uid || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const started = generation.current;
    try {
      requestId.current ??= crypto.randomUUID();
      const page =
        document.querySelector('.main-nav .nav-active')?.textContent?.trim() ||
        document.querySelector('h1')?.textContent?.trim() ||
        'Member Space';
      const { error: failure } = await supabase.rpc('lc_submit_feedback', {
        p_request_id: requestId.current,
        p_category: category,
        p_subject: subject.trim(),
        p_message: message.trim(),
        p_anonymous: anonymous,
        p_page: page.slice(0, 120),
      });
      if (failure) throw failure;
      if (alive.current && started === generation.current) {
        setSent(true);
        window.dispatchEvent(new Event('lc-feedback-sent'));
        setSubject('');
        setMessage('');
        requestId.current = null;
      }
    } catch (failure) {
      if (alive.current && started === generation.current) setError(feedbackError(failure));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="lcf-floating lcf-compose-launcher"
        onClick={() => {
          setSent(false);
          setError('');
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label="Feedback for LifeCity Attendance"
        aria-expanded={open}
      >
        <MessageSquare size={19} aria-hidden="true" />
        <span aria-hidden="true">Feedback / Bug Report</span>
      </button>
      <dialog
        ref={dialog}
        className="lcf-dialog lcf-compose-panel"
        aria-labelledby={`${id}-title`}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
      >
        <header className="lcf-compose__header">
          <span className="lcf-compose__art" aria-hidden="true">
            <MessageSquare size={23} />
            <Sparkles size={12} />
          </span>
          <div className="lcf-compose__intro">
            <p className="lcf-compose__eyebrow">LifeCity Attendance</p>
            <h2 id={`${id}-title`}>App Feedback</h2>
            <p>Send a suggestion or report a problem to the Owner.</p>
          </div>
          <button
            type="button"
            className="lcf-compose__close"
            aria-label="Close Feedback"
            disabled={busy}
            onClick={close}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        {!authReady ? (
          <div className="lcf-compose__state-body">
            <p className="lcf-compose__checking" role="status">
              <LoaderCircle size={18} className="lcf-compose__spinner" aria-hidden="true" />
              Checking your sign-in…
            </p>
          </div>
        ) : !uid ? (
          <div className="lcf-compose__state-body">
            <div className="lcf-compose__notice">
              <span className="lcf-compose__notice-icon" aria-hidden="true">
                <MessageSquare size={27} />
              </span>
              <h3>Sign In to Send Feedback</h3>
              <p>Sign in to LifeCity Attendance, then share your feedback about the app.</p>
              <button type="button" className="lcf-compose__button" onClick={close}>
                Back to the App
              </button>
            </div>
          </div>
        ) : sent ? (
          <div className="lcf-compose__state-body">
            <div className="lcf-compose__notice is-success" role="status">
              <span className="lcf-compose__notice-icon" aria-hidden="true">
                <CheckCircle2 size={29} />
              </span>
              <h3 ref={successTitle} tabIndex={-1}>
                You’re Helping Shape the App!
              </h3>
              <p>Your feedback about LifeCity Attendance has been received. Thank you!</p>
              <p>Check What’s New for completed requests and the latest improvements.</p>
              <button type="button" className="lcf-compose__button is-primary" onClick={close}>
                Back to Exploring
              </button>
            </div>
          </div>
        ) : (
          <form className="lcf-compose__form" onSubmit={(e) => void submit(e)}>
            <div className="lcf-compose__body">
              <fieldset disabled={busy}>
                <legend className="lcf-sr-only">Send Feedback</legend>
                <section
                  className="lcf-compose__category-section"
                  aria-labelledby={`${id}-category-title`}
                >
                  <h3 id={`${id}-category-title`}>What’s on Your Mind?</h3>
                  <div
                    className="lcf-compose__categories"
                    role="group"
                    aria-label="Feedback Category"
                  >
                    {feedbackCategories.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        data-category={value}
                        aria-pressed={category === value}
                        onClick={() => setCategory(value)}
                      >
                        <span className="lcf-compose__category-icon">
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span>{label}</span>
                        <span className="lcf-compose__selected" aria-hidden="true">
                          {category === value && <Check size={13} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <label className="lcf-compose__field" htmlFor={`${id}-subject`}>
                  <span>Subject</span>
                  <input
                    id={`${id}-subject`}
                    required
                    minLength={3}
                    maxLength={160}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="A short title…"
                  />
                </label>
                <label className="lcf-compose__field" htmlFor={`${id}-message`}>
                  <span id={`${id}-message-label`}>Message</span>
                  <textarea
                    id={`${id}-message`}
                    aria-labelledby={`${id}-message-label`}
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      category === 'bug'
                        ? 'What happened, and on which page?'
                        : category === 'idea'
                          ? 'What’s your idea, and how would it help?'
                          : 'What could we improve?'
                    }
                    aria-describedby={`${id}-message-count`}
                  />
                  <small id={`${id}-message-count`}>
                    {message.length.toLocaleString()} / 5,000
                  </small>
                </label>
              </fieldset>
            </div>
            <footer className="lcf-compose__footer">
              {error && (
                <p className="lcf-compose__error" role="alert">
                  {error}
                </p>
              )}
              <label className="lcf-compose__anonymous" htmlFor={`${id}-anonymous`}>
                <input
                  id={`${id}-anonymous`}
                  type="checkbox"
                  disabled={busy}
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                <span>Submit Anonymously</span>
                <ShieldCheck size={17} aria-hidden="true" />
              </label>
              <button
                type="submit"
                className="lcf-compose__button is-primary lcf-compose__submit"
                disabled={busy || subject.trim().length < 3 || message.trim().length < 10}
              >
                {busy ? (
                  <LoaderCircle size={17} className="lcf-compose__spinner" aria-hidden="true" />
                ) : (
                  <Send size={17} aria-hidden="true" />
                )}
                {busy ? 'Sending…' : 'Send Feedback'}
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </>
  );
}
