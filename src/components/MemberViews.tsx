import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Church,
  Download,
  HandHeart,
  LoaderCircle,
  Mail,
  Pencil,
  Phone,
  QrCode,
  ShieldCheck,
  Star,
  StickyNote,
  UserRound,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './member-views.css';

export type MemberViewRecord = {
  id: string;
  first_name: string;
  last_name: string;
  member_number: string;
  email: string | null;
  mobile: string | null;
  status: 'active' | 'inactive';
  is_starred: boolean;
  admin_note: string | null;
  qr_token: string;
  created_at: string;
};

type Affiliation = { id: string; name: string };
type Attendance = {
  id: string;
  checked_in_at: string;
  status: 'present' | 'corrected';
  events: { name: string; starts_at: string } | null;
  report_snapshot?: { service_name?: string | null } | null;
};

const fullName = (member: MemberViewRecord) => `${member.first_name} ${member.last_name}`.trim();
const date = (value: string, withTime = false) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? ({ hour: 'numeric', minute: '2-digit' } as const) : {}),
  }).format(new Date(value));

type ShellProps = {
  member: MemberViewRecord;
  kind: 'note' | 'qr' | 'profile';
  title: string;
  onClose: () => void;
  closeBusy?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
};

function MemberViewShell({
  member,
  kind,
  title,
  onClose,
  closeBusy = false,
  headerAction,
  children,
}: ShellProps) {
  const [host] = useState(() => document.createElement('div'));
  const dialog = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const current = useRef({ onClose, closeBusy });
  current.current = { onClose, closeBusy };

  useLayoutEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const rowFallback = previousFocus
      ?.closest('.lc-member-row')
      ?.querySelector<HTMLElement>('.lc-member-row__name');
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const background = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element !== host,
      )
      .map((element) => ({ element, inert: element.inert }));
    document.body.appendChild(host);
    background.forEach(({ element }) => {
      element.inert = true;
    });
    document.body.style.overflow = 'hidden';
    if (scrollbar)
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    titleRef.current?.focus({ preventScroll: true });

    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]',
        ) ?? [],
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.closest('[hidden],[inert]') &&
          element.getClientRects().length > 0,
      );
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!current.current.closeBusy) current.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      const first = targets[0],
        last = targets[targets.length - 1];
      if (!first) {
        event.preventDefault();
        titleRef.current?.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !targets.includes(active as HTMLElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !dialog.current?.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (!dialog.current?.contains(event.target as Node))
        titleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', containFocus);
      background.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      host.remove();
      const restoreFocus = previousFocus?.isConnected ? previousFocus : rowFallback;
      if (restoreFocus?.isConnected && !restoreFocus.closest('[inert]'))
        restoreFocus.focus({ preventScroll: true });
    };
  }, [host]);

  return createPortal(
    <div
      className="lc-member-view"
      data-kind={kind}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !current.current.closeBusy)
          current.current.onClose();
      }}
    >
      <section
        ref={dialog}
        className="lc-member-view__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={closeBusy || undefined}
      >
        <header className="lc-member-view__header">
          <span className="lc-member-view__avatar" aria-hidden="true">
            {member.first_name[0]}
            {member.last_name[0]}
          </span>
          <div className="lc-member-view__identity">
            <p className="lc-member-view__eyebrow">{title}</p>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>
              {fullName(member)}
            </h2>
            <span className="lc-member-view__member-number">{member.member_number}</span>
          </div>
          <div className="lc-member-view__header-actions">
            {headerAction}
            <button
              type="button"
              className="lc-member-view__close"
              disabled={closeBusy}
              onClick={onClose}
              aria-label={
                kind === 'note'
                  ? 'Close Admin Note'
                  : kind === 'qr'
                    ? 'Close QR Code'
                    : 'Close Member Details'
              }
            >
              <X size={19} aria-hidden="true" />
            </button>
          </div>
        </header>
        {children}
      </section>
    </div>,
    host,
  );
}

function Status({ member }: { member: MemberViewRecord }) {
  return (
    <span
      className="lc-member-view__status"
      data-inactive={member.status === 'inactive' || undefined}
    >
      <span aria-hidden="true" />
      {member.status === 'active' ? 'Active Member' : 'Inactive Member'}
    </span>
  );
}

type NoteProps = {
  member: MemberViewRecord;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
  onViewProfile: () => void;
};
export function MemberNotePanel({ member, onClose, onSave, onViewProfile }: NoteProps) {
  const [savedNote, setSavedNote] = useState(member.admin_note ?? '');
  const [draft, setDraft] = useState(member.admin_note ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const alive = useRef(true);
  const lock = useRef(false);
  const noteId = useId();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setSavedNote(member.admin_note ?? '');
  }, [member.admin_note]);
  useLayoutEffect(() => {
    if (editing) editor.current?.focus({ preventScroll: true });
    else if (wasEditing.current) editButton.current?.focus({ preventScroll: true });
    wasEditing.current = editing;
  }, [editing]);
  function beginEdit() {
    setDraft(savedNote);
    setError('');
    setSaved(false);
    setEditing(true);
  }
  async function save() {
    if (lock.current || draft.length > 1000) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      if (alive.current) {
        setSavedNote(draft.trim());
        setDraft(draft.trim());
        setEditing(false);
        setSaved(true);
      }
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not save this note. Please try again.',
        );
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return (
    <MemberViewShell
      member={member}
      kind="note"
      title="Private Admin Note"
      onClose={onClose}
      closeBusy={saving}
    >
      <div className="lc-member-view__body">
        <div className="lc-member-view__privacy">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            For administrators only<span>Kept out of the member ID and public profile.</span>
          </span>
        </div>
        {editing ? (
          <form
            className="lc-member-view__note-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label htmlFor={noteId}>Note for {member.first_name}</label>
            <textarea
              ref={editor}
              id={noteId}
              value={draft}
              maxLength={1000}
              rows={9}
              disabled={saving}
              onChange={(event) => {
                setDraft(event.target.value);
                setError('');
              }}
              placeholder="Add a helpful reminder for your team…"
              aria-describedby={`${noteId}-count`}
            />
            <span className="lc-member-view__character-count" id={`${noteId}-count`}>
              {draft.length.toLocaleString()} / 1,000
            </span>
            {error && (
              <p className="lc-member-view__error" role="alert">
                {error}
              </p>
            )}
            <div className="lc-member-view__note-actions">
              <button
                type="button"
                className="lc-member-view__button"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setDraft(savedNote);
                  setError('');
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="lc-member-view__button is-primary"
                disabled={saving || draft === savedNote}
              >
                {saving ? (
                  <LoaderCircle className="lc-member-view__spinner" size={16} aria-hidden="true" />
                ) : (
                  <Check size={16} aria-hidden="true" />
                )}
                {saving ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="lc-member-view__note-paper">
              <span className="lc-member-view__paper-label">
                <StickyNote size={15} aria-hidden="true" />
                Team Reminder
              </span>
              {savedNote.trim() ? (
                <p>{savedNote}</p>
              ) : (
                <p className="lc-member-view__empty-copy">
                  No private note yet. Keep a useful reminder here for the team.
                </p>
              )}
            </div>
            <div className="lc-member-view__note-actions">
              {saved && (
                <span className="lc-member-view__saved" role="status">
                  <CheckCheck size={15} aria-hidden="true" />
                  Note saved
                </span>
              )}
              <button
                ref={editButton}
                type="button"
                className="lc-member-view__button is-primary"
                onClick={beginEdit}
              >
                <Pencil size={16} aria-hidden="true" />
                {savedNote.trim() ? 'Edit Note' : 'Add a Note'}
              </button>
            </div>
          </>
        )}
      </div>
      <footer className="lc-member-view__footer">
        <button
          type="button"
          className="lc-member-view__text-link"
          disabled={saving}
          onClick={onViewProfile}
        >
          <UserRound size={16} aria-hidden="true" />
          Open Member Profile
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </footer>
    </MemberViewShell>
  );
}

type QrProps = { member: MemberViewRecord; onClose: () => void; onDownload: () => void };
export function MemberQrDialog({ member, onClose, onDownload }: QrProps) {
  return (
    <MemberViewShell member={member} kind="qr" title="Member ID & Check-In" onClose={onClose}>
      <div className="lc-member-view__body lc-member-view__qr-body">
        <div className="lc-member-view__id-card">
          <div className="lc-member-view__id-brand">
            <span className="lc-member-view__id-symbol">
              <QrCode size={18} aria-hidden="true" />
            </span>
            <span>
              LifeCity<span>Attendance</span>
            </span>
            <Status member={member} />
          </div>
          <div className="lc-member-view__qr-white">
            <QRCodeSVG
              id="member-qr-code"
              role="img"
              aria-label={`Private check-in QR code for ${fullName(member)}`}
              value={`att:${member.qr_token}`}
              size={220}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              includeMargin
            />
          </div>
          <strong>Ready for Check-In</strong>
          <p>Present this code to the service scanner.</p>
        </div>
        <p className="lc-member-view__qr-privacy">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>This private code is used for check-in. It doesn’t include contact details.</span>
        </p>
      </div>
      <footer className="lc-member-view__footer lc-member-view__qr-footer">
        <button type="button" className="lc-member-view__button is-primary" onClick={onDownload}>
          <Download size={17} aria-hidden="true" />
          Download Member ID
        </button>
      </footer>
    </MemberViewShell>
  );
}

type ProfileProps = {
  member: MemberViewRecord;
  onClose: () => void;
  onEdit: () => void;
  onQr: () => void;
  onNote: () => void;
  churches: Affiliation[];
  ministries: Affiliation[];
  attendance: Attendance[];
  attendanceLoading: boolean;
  attendanceError: string;
  attendanceTotal: number;
  attendancePage: number;
  attendancePageSize: number;
  onAttendancePage: (page: number) => void;
  onAttendanceRetry: () => void;
};
export function MemberProfilePanel({
  member,
  onClose,
  onEdit,
  onQr,
  onNote,
  churches,
  ministries,
  attendance,
  attendanceLoading,
  attendanceError,
  attendanceTotal,
  attendancePage,
  attendancePageSize,
  onAttendancePage,
  onAttendanceRetry,
}: ProfileProps) {
  const [tab, setTab] = useState<'overview' | 'attendance'>('overview');
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const requestedPageFocus = useRef<HTMLButtonElement | null>(null);
  const lastPage = Math.max(1, Math.ceil(attendanceTotal / attendancePageSize));
  useLayoutEffect(() => {
    const trigger = requestedPageFocus.current;
    if (!trigger) return;
    if (tab !== 'attendance') {
      requestedPageFocus.current = null;
      return;
    }
    if (attendanceLoading) return;
    requestedPageFocus.current = null;

    if (document.activeElement === document.body || document.activeElement === trigger) {
      historyHeading.current?.focus({ preventScroll: true });
    }
  }, [attendanceLoading, attendancePage, tab]);
  function requestPage(page: number, trigger: HTMLButtonElement) {
    requestedPageFocus.current = trigger;
    onAttendancePage(page);
  }
  return (
    <MemberViewShell
      member={member}
      kind="profile"
      title="Member Profile"
      onClose={onClose}
      headerAction={
        <button
          type="button"
          className="lc-member-view__button lc-member-view__edit-profile"
          onClick={onEdit}
        >
          <Pencil size={15} aria-hidden="true" />
          Edit Member
        </button>
      }
    >
      <div className="lc-member-view__profile-meta">
        <Status member={member} />
        {member.is_starred && (
          <span className="lc-member-view__starred">
            <Star size={13} fill="currentColor" aria-hidden="true" />
            Starred
          </span>
        )}
      </div>
      <div
        className="lc-member-view__tabs"
        role="tablist"
        aria-label="Member profile sections"
        onKeyDown={(event) => {
          const current = tab === 'overview' ? 0 : 1;
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? 1
                : ['ArrowLeft', 'ArrowRight'].includes(event.key)
                  ? 1 - current
                  : null;
          if (next === null) return;
          event.preventDefault();
          setTab(next === 0 ? 'overview' : 'attendance');
          tabs.current[next]?.focus({ preventScroll: true });
        }}
      >
        <button
          ref={(node) => {
            tabs.current[0] = node;
          }}
          type="button"
          role="tab"
          id={`${id}-overview-tab`}
          aria-controls={`${id}-overview`}
          aria-selected={tab === 'overview'}
          tabIndex={tab === 'overview' ? 0 : -1}
          onClick={() => setTab('overview')}
        >
          <UserRound size={16} aria-hidden="true" />
          Overview
        </button>
        <button
          ref={(node) => {
            tabs.current[1] = node;
          }}
          type="button"
          role="tab"
          id={`${id}-attendance-tab`}
          aria-controls={`${id}-attendance`}
          aria-selected={tab === 'attendance'}
          tabIndex={tab === 'attendance' ? 0 : -1}
          onClick={() => setTab('attendance')}
        >
          <CalendarDays size={16} aria-hidden="true" />
          Attendance
          {!attendanceLoading && !attendanceError && (
            <span>{attendanceTotal.toLocaleString()}</span>
          )}
        </button>
      </div>
      {tab === 'overview' ? (
        <div
          className="lc-member-view__body"
          role="tabpanel"
          id={`${id}-overview`}
          aria-labelledby={`${id}-overview-tab`}
        >
          <section className="lc-member-view__section">
            <h3>Contact & Registration</h3>
            <dl className="lc-member-view__contact-list">
              <div>
                <dt>
                  <Mail size={16} aria-hidden="true" />
                  Email
                </dt>
                <dd>
                  {member.email ? (
                    <a href={`mailto:${member.email}`}>{member.email}</a>
                  ) : (
                    <span className="lc-member-view__empty-copy">Not provided</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Phone size={16} aria-hidden="true" />
                  Mobile
                </dt>
                <dd>
                  {member.mobile ? (
                    <a href={`tel:${member.mobile}`}>{member.mobile}</a>
                  ) : (
                    <span className="lc-member-view__empty-copy">Not provided</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <CalendarDays size={16} aria-hidden="true" />
                  Registered
                </dt>
                <dd>{date(member.created_at)}</dd>
              </div>
            </dl>
          </section>
          <section className="lc-member-view__section lc-member-view__community">
            <h3>Church & Community</h3>
            <div className="lc-member-view__affiliation">
              <span>
                <Church size={16} aria-hidden="true" />
                Churches
              </span>
              <div>
                {churches.length ? (
                  churches.map((church) => (
                    <span className="lc-member-view__chip" key={church.id}>
                      {church.name}
                    </span>
                  ))
                ) : (
                  <span className="lc-member-view__empty-copy">No churches assigned</span>
                )}
              </div>
            </div>
            <div className="lc-member-view__affiliation">
              <span>
                <HandHeart size={16} aria-hidden="true" />
                Ministries
              </span>
              <div>
                {ministries.length ? (
                  ministries.map((ministry) => (
                    <span className="lc-member-view__chip is-lavender" key={ministry.id}>
                      {ministry.name}
                    </span>
                  ))
                ) : (
                  <span className="lc-member-view__empty-copy">No ministries assigned</span>
                )}
              </div>
            </div>
          </section>
          <section className="lc-member-view__profile-note">
            <div>
              <span>
                <ShieldCheck size={15} aria-hidden="true" />
                Private Admin Note
              </span>
              <button type="button" className="lc-member-view__text-link" onClick={onNote}>
                {member.admin_note?.trim() ? 'Open Note' : 'Add Note'}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
            <p>
              {member.admin_note?.trim()
                ? member.admin_note
                : 'A useful reminder for your team can go here.'}
            </p>
          </section>
          <button type="button" className="lc-member-view__qr-shortcut" onClick={onQr}>
            <span className="lc-member-view__qr-shortcut-icon">
              <QrCode size={23} aria-hidden="true" />
            </span>
            <span>
              <strong>Member ID & QR</strong>
              <span>Open the check-in code or download an ID.</span>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          className="lc-member-view__body"
          role="tabpanel"
          id={`${id}-attendance`}
          aria-labelledby={`${id}-attendance-tab`}
        >
          <div className="lc-member-view__attendance-heading">
            <div>
              <h3 ref={historyHeading} tabIndex={-1}>
                Check-In History
              </h3>
              <p>Recorded services and gatherings.</p>
            </div>
            <span>
              {attendanceLoading
                ? 'Loading…'
                : attendanceError
                  ? 'Unavailable'
                  : `${attendanceTotal.toLocaleString()} total`}
            </span>
          </div>
          <p className="lc-member-view__sr" aria-live="polite" aria-atomic="true">
            {!attendanceLoading && !attendanceError && attendance.length > 0
              ? `Page ${attendancePage} of ${lastPage}`
              : ''}
          </p>
          {attendanceLoading ? (
            <div className="lc-member-view__attendance-loading">
              <p role="status">
                <LoaderCircle size={16} className="lc-member-view__spinner" aria-hidden="true" />
                Loading attendance…
              </p>
              <div aria-hidden="true" />
              <div aria-hidden="true" />
              <div aria-hidden="true" />
            </div>
          ) : attendanceError ? (
            <div className="lc-member-view__attendance-empty" role="alert">
              <CalendarDays size={28} aria-hidden="true" />
              <h4>History is unavailable</h4>
              <p>{attendanceError}</p>
              <button type="button" className="lc-member-view__button" onClick={onAttendanceRetry}>
                Retry Attendance
              </button>
            </div>
          ) : attendance.length === 0 ? (
            <div className="lc-member-view__attendance-empty">
              <CalendarDays size={30} aria-hidden="true" />
              <h4>No Check-Ins Yet</h4>
              <p>This member’s recorded attendance will appear here.</p>
            </div>
          ) : (
            <>
              <ol className="lc-member-view__attendance-list">
                {attendance.map((record) => (
                  <li key={record.id}>
                    <span className="lc-member-view__attendance-dot" aria-hidden="true" />
                    <div>
                      <strong>
                        {record.events?.name ||
                          record.report_snapshot?.service_name ||
                          'Service unavailable'}
                      </strong>
                      <time dateTime={record.checked_in_at}>
                        {date(record.checked_in_at, true)}
                      </time>
                    </div>
                    <span
                      className="lc-member-view__record-status"
                      data-corrected={record.status === 'corrected' || undefined}
                    >
                      {record.status === 'present' ? 'Present' : 'Corrected'}
                    </span>
                  </li>
                ))}
              </ol>
              {attendanceTotal > attendancePageSize && (
                <nav className="lc-member-view__pagination" aria-label="Member attendance pages">
                  <button
                    type="button"
                    className="lc-member-view__button"
                    disabled={attendancePage <= 1}
                    onClick={(event) => requestPage(attendancePage - 1, event.currentTarget)}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    Previous
                  </button>
                  <span>
                    Page {attendancePage} of {lastPage}
                  </span>
                  <button
                    type="button"
                    className="lc-member-view__button"
                    disabled={attendancePage >= lastPage}
                    onClick={(event) => requestPage(attendancePage + 1, event.currentTarget)}
                  >
                    Next
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      )}
    </MemberViewShell>
  );
}
