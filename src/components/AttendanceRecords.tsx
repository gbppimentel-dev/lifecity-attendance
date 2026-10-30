import { ResponsiveSelect } from './CompactMobile';
import { MotionPresence } from '../lib/motion';
import { useToast } from '../lib/toasts';
import { removeAttendanceWithUndo } from '../lib/attendanceActions';
import { revealWorkspaceRegion } from '../lib/workspaceViewport';
import HoldButton from './HoldButton';
import ServiceDatePicker from './ServiceDatePicker';
import GlideSelect from './GlideSelect';
import './attendance-records.css';

import { uiMessage, uiStatus } from '../lib/uiText';

import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileSearch,
  RotateCcw,
  ScanLine,
  Search,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Church,
  Clock3,
  MapPin,
  ShieldCheck,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
type NamedItem = {
  id: string;
  name: string;
};
type AttendanceEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  archived_at: string | null;
  is_sunday_service: boolean;
};
type Props = {
  events: AttendanceEvent[];
};
type DateRange = 'all' | 'today' | 'week' | 'month' | 'custom';
type EventScope = 'completed' | 'in-progress' | 'archived' | 'history' | 'all';
const scopeLabels: Record<EventScope, string> = {
  completed: 'Completed Services',
  'in-progress': 'In-Progress Services',
  archived: 'Archived Services',
  history: 'Completed + Archived',
  all: 'All Reportable Services',
};
type ServiceOption = NamedItem & {
  service_date: string;
  service_state: string;
};
type ExportMode = 'quick' | 'detailed';
type Sort = 'check_in' | 'member' | 'church' | 'ministry' | 'service';
type Row = {
  id: string;
  member_id: string;
  event_id: string;
  checked_in_at: string;
  attendance_status: string;
  first_name: string;
  last_name: string;
  member_number: string;
  email: string | null;
  mobile: string | null;
  member_status: string;
  service_name: string;
  service_date: string;
  service_state: string;
  churches: NamedItem[];
  ministries: NamedItem[];
  member_group: string | null;
  service_end: string | null;
  service_location: string | null;
  sunday_service: boolean;
  created_at: string;
  scanned_by: string | null;
  notes: string | null;
  archived_at: string | null;
  snapshot_source: string;
  snapshot_captured_at: string;
  snapshot_version: number;
};
type Report = {
  top_group: { name: string; kind: string; check_ins: number; ties: number } | null;
  revision: string;
  total: number;
  members: number;
  services: number;
  rows: Row[];
};
const emptyReport: Report = {
  top_group: null,
  revision: '',
  total: 0,
  members: 0,
  services: 0,
  rows: [],
};
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const manilaDate = (value: string | Date) => dateFormatter.format(new Date(value));
const stamp = (value: string) =>
  new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
const names = (items: NamedItem[]) => items.map((item) => item.name).join(' | ');
const fullName = (row: Row) => `${row.first_name} ${row.last_name}`;
const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
const timeOnly = (value: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
const calendarMonth = (value: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short' }).format(
    new Date(value),
  );
const calendarDay = (value: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', day: 'numeric' }).format(
    new Date(value),
  );
const sortChoices: { value: Sort; label: string }[] = [
  { value: 'check_in', label: 'Check-In Time' },
  { value: 'member', label: 'Member Name' },
  { value: 'church', label: 'Church' },
  { value: 'ministry', label: 'Ministry' },
  { value: 'service', label: 'Service Name' },
];
const sortLabel = (field: Sort, descending: boolean) =>
  field === 'check_in'
    ? `Check-In · ${descending ? 'Newest First' : 'Oldest First'}`
    : `${sortChoices.find((choice) => choice.value === field)?.label} · ${descending ? 'Z–A' : 'A–Z'}`;
function SortColumn({
  label,
  fields,
  sort,
  descending,
  disabled,
  onChange,
}: {
  label: string;
  fields: Sort[];
  sort: Sort;
  descending: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const active = fields.includes(sort);
  return (
    <div className="lcr-column-sort" data-active={active || undefined}>
      <GlideSelect
        className="lcr-column-sort__select"
        ariaLabel={`Sort by ${label}`}
        size="sm"
        radius={7}
        menuWidth={215}
        searchable={false}
        placeholder={label}
        value={active ? `${sort}:${descending ? 'desc' : 'asc'}` : ''}
        disabled={disabled}
        onChange={onChange}
        options={fields.flatMap((field) =>
          [false, true].map((direction) => ({
            value: `${field}:${direction ? 'desc' : 'asc'}`,
            label: (
              <span className="lcr-column-option">
                <span className="lcr-column-option__trigger" aria-hidden="true">
                  {label}
                  {direction ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                </span>
                <span className="lcr-column-option__menu">
                  {field === 'check_in'
                    ? direction
                      ? 'Newest First'
                      : 'Oldest First'
                    : `${sortChoices.find((choice) => choice.value === field)?.label} · ${direction ? 'Z–A' : 'A–Z'}`}
                </span>
              </span>
            ),
          })),
        )}
      />
    </div>
  );
}
function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return manilaDate(date);
}

function csvValue(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
async function getReport(args: Record<string, unknown>): Promise<Report> {
  const { data, error } = await supabase.rpc('attendance_report_v4', args);
  if (error)
    throw new Error(
      error.code === 'PGRST202'
        ? 'Attendance reports are unavailable. Check database setup, then refresh.'
        : error.message,
    );
  if (!data || !Array.isArray(data.rows))
    throw new Error('The reporting server returned an invalid response.');
  if (data.report_version !== 4 || !Object.prototype.hasOwnProperty.call(data, 'top_group'))
    throw new Error(
      'The reporting database update is incomplete. Check database setup, then refresh.',
    );
  return data as Report;
}
function ReportDialog({
  children,
  onClose,
  label,
  locked = false,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow,
      padding = document.body.style.paddingRight;
    const gap = Math.max(0, innerWidth - document.documentElement.clientWidth);
    document.body.style.overflow = 'hidden';
    if (gap)
      document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + gap}px`;
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = padding;
      const target = previous?.isConnected
        ? previous
        : document.querySelector<HTMLElement>('.lcr-refresh');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="lcr-detail"
      aria-labelledby={label}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !locked) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
export default function AttendanceRecords(_props: Props) {
  const toast = useToast();
  const alive = useRef(true),
    mutationLock = useRef(false);
  const [report, setReport] = useState<Report>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [eventId, setEventId] = useState('');
  const [churchId, setChurchId] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [query, setQuery] = useState('');
  const [eventScope, setEventScope] = useState<EventScope>('completed');
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [sundayOnly, setSundayOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [churches, setChurches] = useState<NamedItem[]>([]);
  const [ministries, setMinistries] = useState<NamedItem[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState<Sort>('check_in');
  const [descending, setDescending] = useState(true);
  const [size, setSize] = useState(25);
  const [asOf, setAsOf] = useState(() => new Date().toISOString());
  const [pageState, setPageState] = useState({ key: '', index: 0 });
  const [loadedKey, setLoadedKey] = useState('');
  const [loadedView, setLoadedView] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Row | null>(null);
  const [removing, setRemoving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const cancelExport = useRef(false);
  const exportLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelExport.current = true;
    };
  }, []);
  useEffect(() => {
    const refresh = () =>
      setAsOf((previous) => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString());
    window.addEventListener('lifecity-attendance-changed', refresh);
    return () => window.removeEventListener('lifecity-attendance-changed', refresh);
  }, []);
  const tableTop = useRef<HTMLDivElement>(null);
  const exportPanel = useRef<HTMLElement>(null),
    confirmation = useRef<HTMLElement>(null);
  const pendingScroll = useRef<string | null>(null);
  const [removeError, setRemoveError] = useState('');
  useEffect(() => {
    const leave = (event: Event) => {
      if ((event as CustomEvent<{ page: string }>).detail?.page === 'records') return;

      setDetail(null);
      setRemoveTarget(null);
      setRemoveError('');
      pendingScroll.current = null;
    };
    window.addEventListener('lifecity-workspace-activate', leave);
    return () => window.removeEventListener('lifecity-workspace-activate', leave);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(memberQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [memberQuery]);
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError('');
    async function catalog(kind: string) {
      const rows: ServiceOption[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.rpc('attendance_catalog_v4', {
          p_kind: kind,
          p_scope: eventScope,
          p_as_of: asOf,
          p_offset: offset,
          p_limit: 500,
        });
        if (error)
          throw new Error(
            error.code === 'PGRST202'
              ? 'Attendance reports are unavailable. Check database setup, then refresh.'
              : error.message,
          );
        if (!Array.isArray(data)) throw new Error('Invalid filter catalog response.');
        rows.push(...data);
        if (cancelled || data.length < 500) return rows;
      }
    }
    Promise.all([catalog('churches'), catalog('ministries'), catalog('events')])
      .then(([c, m, e]) => {
        if (!cancelled) {
          setChurches(c);
          setMinistries(m);
          setServices(e);
          setEventId((current) =>
            current && !e.some((item) => item.id === current) ? '' : current,
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setCatalogError(e.message);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asOf, eventScope]);
  const range = useMemo(() => {
    const today = manilaDate(asOf);
    if (dateRange === 'today') return [today, today];
    if (dateRange === 'week') return [shiftDate(today, -6), today];
    if (dateRange === 'month') return [shiftDate(today, -29), today];
    return dateRange === 'custom' ? [customStart, customEnd] : ['', ''];
  }, [dateRange, customStart, customEnd, asOf]);
  const invalidRange = Boolean(range[0] && range[1] && range[0] > range[1]);
  const request = {
    p_filters: {
      event_id: eventId,
      church_id: churchId,
      ministry_id: ministryId,
      query,
      scope: eventScope,
      sunday_only: sundayOnly,
      start: range[0],
      end: range[1],
    },
    p_sort: sort,
    p_desc: descending,
    p_as_of: asOf,
  };
  const key = JSON.stringify({
    p_filters: request.p_filters,
    p_sort: sort,
    p_desc: descending,
    size,
  });
  const page = pageState.key === key ? pageState.index : 0;
  const viewKey = `${key}:${page}`;
  const fetchKey = `${viewKey}:${asOf}`;
  const busy = loading || catalogLoading || loadedKey !== fetchKey || query !== memberQuery.trim();
  const hasSnapshot = loadedView === viewKey;
  const blocking = busy && !hasSnapshot;
  useEffect(() => {
    let cancelled = false;
    if (invalidRange) {
      setError('From must be on or before To.');
      setReport(emptyReport);
      setLoading(false);
      setLoadedKey(fetchKey);
      return;
    }
    setLoading(true);
    setError('');
    const { size: pageSize, ...args } = JSON.parse(key);
    getReport({ ...args, p_as_of: asOf, p_limit: pageSize, p_offset: page * pageSize })
      .then((result) => {
        if (cancelled) return;
        const last = Math.max(0, Math.ceil(result.total / pageSize) - 1);
        if (page > last) {
          setPageState({ key, index: last });
          return;
        }
        setReport(result);
        setLoadedKey(fetchKey);
        setLoadedView(viewKey);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          if (!hasSnapshot) setReport(emptyReport);
          setLoadedKey(fetchKey);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, page, fetchKey, invalidRange, asOf]);
  const pages = Math.max(1, Math.ceil(report.total / size));
  function goPage(index: number) {
    if (exporting || busy || removing || index === page) return;
    pendingScroll.current = `${key}:${index}:${asOf}`;
    setRemoveTarget(null);
    setPageState({ key, index });
  }
  useEffect(() => {
    if (busy || pendingScroll.current !== fetchKey) return;
    const frame = window.requestAnimationFrame(() => {
      revealWorkspaceRegion(tableTop.current, 'start');
      pendingScroll.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, fetchKey]);
  useLayoutEffect(() => {
    if (exportOpen) revealWorkspaceRegion(exportPanel.current);
  }, [exportOpen]);
  useLayoutEffect(() => {
    if (!removeTarget) return;
    confirmation.current
      ?.querySelector<HTMLButtonElement>('[data-confirm-cancel]')
      ?.focus({ preventScroll: true });
    revealWorkspaceRegion(confirmation.current);
  }, [removeTarget?.id]);
  useEffect(() => {
    setRemoveTarget(null);
    setRemoveError('');
  }, [key]);
  const activeCount = [
    dateRange !== 'all',
    eventId,
    churchId,
    ministryId,
    memberQuery.trim(),
    eventScope !== 'completed',
    sundayOnly,
  ].filter(Boolean).length;
  function clearFilters() {
    setDateRange('all');
    setCustomStart('');
    setCustomEnd('');
    setEventId('');
    setChurchId('');
    setMinistryId('');
    setMemberQuery('');
    setEventScope('completed');
    setSundayOnly(false);
  }
  const activeFilterChips = [
    dateRange !== 'all' && {
      label:
        dateRange === 'today'
          ? 'Today'
          : dateRange === 'week'
            ? 'Last 7 Days'
            : dateRange === 'month'
              ? 'Last 30 Days'
              : 'Custom Dates',
      clear: () => {
        setDateRange('all');
        setCustomStart('');
        setCustomEnd('');
      },
    },
    eventId && {
      label: services.find((event) => event.id === eventId)?.name ?? 'Service',
      clear: () => setEventId(''),
    },
    churchId && {
      label: churches.find((church) => church.id === churchId)?.name ?? 'Church',
      clear: () => setChurchId(''),
    },
    ministryId && {
      label: ministries.find((ministry) => ministry.id === ministryId)?.name ?? 'Ministry',
      clear: () => setMinistryId(''),
    },
    memberQuery.trim() && {
      label: `Member: ${memberQuery.trim()}`,
      clear: () => setMemberQuery(''),
    },
    eventScope !== 'completed' && {
      label: scopeLabels[eventScope],
      clear: () => {
        setEventScope('completed');
        setEventId('');
      },
      className: 'records-filter-chip archive-history',
    },
    sundayOnly && { label: 'Sunday Services', clear: () => setSundayOnly(false) },
  ].filter(Boolean) as Array<{
    label: string;
    clear: () => void;
    className?: string;
  }>;
  function selectSort(value: string) {
    if (busy || exporting || removing) return;
    const [next, direction] = value.split(':');
    if (
      !sortChoices.some((choice) => choice.value === next) ||
      !['asc', 'desc'].includes(direction)
    )
      return;
    setSort(next as Sort);
    setDescending(direction === 'desc');
  }
  async function exportCsv(mode: ExportMode) {
    if (exportLock.current || mutationLock.current || busy || error || !report.total) return;
    exportLock.current = true;
    cancelExport.current = false;
    setExporting(true);
    setExportProgress(0);
    setMessage('');
    setRemoveTarget(null);
    const expected = report.total,
      revision = report.revision;
    const exportRequest = request;
    const quickHeaders = [
      'member_number',
      'member_name',
      'churches_snapshot',
      'ministries_snapshot',
      'service_name_snapshot',
      'service_date_manila',
      'check_in_manila',
      'attendance_status',
    ];
    const detailHeaders = [
      'attendance_id',
      'member_id',
      'service_id',
      'member_number',
      'first_name_snapshot',
      'last_name_snapshot',
      'member_status_snapshot',
      'member_group_snapshot',
      'email_snapshot',
      'mobile_snapshot',
      'church_ids_snapshot',
      'churches_snapshot',
      'ministry_ids_snapshot',
      'ministries_snapshot',
      'service_name_snapshot',
      'service_start_iso_snapshot',
      'service_end_iso_snapshot',
      'service_location_snapshot',
      'sunday_service_snapshot',
      'service_status_at_export',
      'archived_at_current',
      'check_in_iso',
      'check_in_manila',
      'attendance_status',
      'record_created_at',
      'scanned_by_user_id',
      'attendance_notes_current',
      'snapshot_source',
      'snapshot_captured_at',
      'snapshot_version',
      'report_as_of',
      'exported_at',
    ];
    const exportedAt = new Date().toISOString();
    const chunks: BlobPart[] = [
      '\uFEFF',
      (mode === 'quick' ? quickHeaders : detailHeaders).map(csvValue).join(',') + '\r\n',
    ];
    let exported = 0;
    const check = (result: Report) => {
      if (result.total !== expected || result.revision !== revision)
        throw new Error(
          'The matching records changed. Refresh and export again; no partial file was downloaded.',
        );
    };
    try {
      for (let offset = 0; offset < expected; offset += 500) {
        if (cancelExport.current) throw new Error('Export cancelled.');
        const result = await getReport({ ...exportRequest, p_offset: offset, p_limit: 500 });
        if (cancelExport.current) throw new Error('Export cancelled.');
        check(result);
        if (result.rows.length !== Math.min(500, expected - offset))
          throw new Error('Incomplete export response. Please retry.');
        const rows = result.rows.map((r) =>
          mode === 'quick'
            ? [
                r.member_number,
                fullName(r),
                names(r.churches),
                names(r.ministries),
                r.service_name,
                manilaDate(r.service_date),
                stamp(r.checked_in_at),
                r.attendance_status,
              ]
            : [
                r.id,
                r.member_id,
                r.event_id,
                r.member_number,
                r.first_name,
                r.last_name,
                r.member_status,
                r.member_group,
                r.email,
                r.mobile ? "'" + r.mobile : '',
                r.churches.map((x) => x.id).join(' | '),
                names(r.churches),
                r.ministries.map((x) => x.id).join(' | '),
                names(r.ministries),
                r.service_name,
                r.service_date,
                r.service_end,
                r.service_location,
                r.sunday_service,
                r.service_state,
                r.archived_at,
                r.checked_in_at,
                stamp(r.checked_in_at),
                r.attendance_status,
                r.created_at,
                r.scanned_by,
                r.notes,
                r.snapshot_source,
                r.snapshot_captured_at,
                r.snapshot_version,
                asOf,
                exportedAt,
              ],
        );
        chunks.push(rows.map((r) => r.map(csvValue).join(',')).join('\r\n') + '\r\n');
        exported += result.rows.length;
        setExportProgress(exported);
      }

      check(await getReport({ ...exportRequest, p_offset: 0, p_limit: 1 }));
      if (cancelExport.current) throw new Error('Export cancelled.');
      const url = URL.createObjectURL(new Blob(chunks, { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `lifecity-${mode}-${eventScope}-${manilaDate(asOf)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (alive.current)
        toast.notify({
          title: 'CSV Ready',
          description: `${exported.toLocaleString()} records · ${mode === 'quick' ? 'Quick' : 'Detailed'} CSV`,
          tone: 'success',
        });
    } catch (e) {
      if (alive.current)
        setMessage(e instanceof Error ? e.message : 'Export failed. Please retry.');
    } finally {
      exportLock.current = false;
      if (alive.current) setExporting(false);
    }
  }
  async function removeCheckIn() {
    if (!removeTarget || exportLock.current || mutationLock.current) return;
    const target = removeTarget;
    mutationLock.current = true;
    setRemoving(true);
    setMessage('');
    setRemoveError('');
    try {
      const change = await removeAttendanceWithUndo(supabase, target.id);
      if (alive.current) {
        setRemoveTarget(null);
        setDetail((current) => (current?.id === target.id ? null : current));
        setReport((current) => ({
          ...current,
          rows: current.rows.filter((row) => row.id !== target.id),
        }));
        setAsOf(new Date().toISOString());
      }
      toast.notify({
        title: 'Check-In Removed',
        description: `${fullName(target)} · ${target.service_name}`,
        tone: 'success',
        duration: 10000,
        actionLabel: 'Undo',
        onAction: async () => {
          if (mutationLock.current || exportLock.current)
            throw new Error('Finish the current action before using Undo.');
          mutationLock.current = true;
          if (alive.current) setRemoving(true);
          try {
            await change.undo();
            window.dispatchEvent(new Event('lifecity-attendance-changed'));
          } finally {
            mutationLock.current = false;
            if (alive.current) setRemoving(false);
          }
        },
      });
    } catch (e) {
      if (alive.current)
        setRemoveError(e instanceof Error ? e.message : 'Could not remove check-in.');

      throw e;
    } finally {
      mutationLock.current = false;
      if (alive.current) setRemoving(false);
    }
  }
  return (
    <section className="lcr-workspace" aria-label="Attendance Ledger">
      <header className="lcr-header">
        <div>
          <p className="lcr-eyebrow">Attendance Ledger</p>
          <h2 id="lcr-ledger-heading" tabIndex={-1}>
            Check-In History
          </h2>
          <p>Review saved check-ins and export matching records.</p>
        </div>
        <button
          type="button"
          className="lcr-primary"
          aria-expanded={exportOpen}
          aria-controls="records-export-center"
          onClick={() => setExportOpen(!exportOpen)}
          disabled={exporting || removing}
        >
          <Download size={17} aria-hidden="true" />
          Export CSV
        </button>
      </header>

      <div className="lcr-summary" aria-label="Report Summary">
        {[
          { label: 'Check-Ins', value: report.total, Icon: ScanLine, color: 'teal' },
          { label: 'Members', value: report.members, Icon: UsersRound, color: 'violet' },
          { label: 'Services', value: report.services, Icon: CalendarDays, color: 'gold' },
        ].map(({ label, value, Icon, color }) => (
          <div className="lcr-stat" data-color={color} key={label}>
            <span className="lcr-stat__icon">
              <Icon size={17} aria-hidden="true" />
            </span>
            <div>
              <strong>
                {blocking ? (
                  <span className="lcr-skeleton" aria-label="Loading" />
                ) : (
                  value.toLocaleString()
                )}
              </strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
        <div className="lcr-stat lcr-stat--group" data-color="sky">
          <span className="lcr-stat__icon">
            <Church size={17} aria-hidden="true" />
          </span>
          <div>
            <span>
              {report.top_group ? `Top ${uiStatus(report.top_group.kind)}` : 'Top Affiliation'}
            </span>
            <strong>{blocking ? '—' : (report.top_group?.name ?? 'No Affiliation')}</strong>
            <small>
              {!blocking && report.top_group
                ? `${report.top_group.check_ins.toLocaleString()} Check-Ins${report.top_group.ties > 1 ? ` · ${report.top_group.ties} Tied` : ''}`
                : 'Based on matching check-ins'}
            </small>
          </div>
        </div>
      </div>

      <MotionPresence show={exportOpen}>
        {exportOpen && (
          <section
            ref={exportPanel}
            id="records-export-center"
            className="lcr-export"
            aria-label="CSV Export"
          >
            <div className="lcr-export__heading">
              <div>
                <p className="lcr-eyebrow">Export Records</p>
                <h3>CSV Report</h3>
                <p>
                  {busy ? 'Updating…' : `${report.total.toLocaleString()} Matching Records`} · All
                  Pages · Current Filters & Sort
                </p>
              </div>
              <button
                type="button"
                className="lcr-icon"
                aria-label="Close Export"
                disabled={exporting}
                onClick={() => setExportOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="lcr-export__choices">
              <button
                type="button"
                className="lcr-export__choice"
                disabled={busy || !!error || exporting || removing || !report.total}
                onClick={() => void exportCsv('quick')}
              >
                <span>
                  <Download size={21} aria-hidden="true" />
                </span>
                <div>
                  <strong>Quick CSV</strong>
                  <small>Member, community, service and check-in details.</small>
                  <em>8 Columns</em>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="lcr-export__choice"
                data-detailed
                disabled={busy || !!error || exporting || removing || !report.total}
                onClick={() => void exportCsv('detailed')}
              >
                <span>
                  <FileSearch size={21} aria-hidden="true" />
                </span>
                <div>
                  <strong>Detailed CSV</strong>
                  <small>Quick CSV plus saved contacts, IDs, notes and snapshot details.</small>
                  <em>32 Columns</em>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </div>
            {message && (
              <p className="lcr-notice" role="status">
                {uiMessage(message)}
              </p>
            )}
            {exporting && (
              <div className="lcr-export__progress" role="status">
                <progress max={report.total || 1} value={exportProgress} />
                <span>
                  {exportProgress.toLocaleString()} / {report.total.toLocaleString()} Prepared
                </span>
                <button
                  type="button"
                  className="lcr-button"
                  onClick={() => {
                    cancelExport.current = true;
                  }}
                >
                  Cancel Export
                </button>
              </div>
            )}
          </section>
        )}
      </MotionPresence>

      <fieldset className="lcr-filters" disabled={exporting || removing}>
        <div className="lcr-filters__heading">
          <span>
            <SlidersHorizontal size={15} aria-hidden="true" />
            Filters{activeCount > 0 && <small>{activeCount} Active</small>}
          </span>
          <div>
            {activeCount > 0 && (
              <button type="button" className="lcr-text-button" onClick={clearFilters}>
                Reset
              </button>
            )}
            <label className="lcr-sunday lcr-sunday--toolbar">
              <input
                type="checkbox"
                aria-label="Sunday Services Only"
                checked={sundayOnly}
                onChange={(event) => setSundayOnly(event.target.checked)}
              />
              <span aria-hidden="true">
                <Check size={13} />
              </span>
              Sunday Only
            </label>
            <button
              type="button"
              className="lcr-button lcr-more"
              aria-expanded={moreOpen}
              aria-controls="records-more-filters"
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              {moreOpen ? 'Fewer Filters' : 'More Filters'}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="lcr-filters__primary">
          <label className="lcr-field">
            <span>Service Status</span>
            <ResponsiveSelect
              aria-label="Filter by Service Status"
              value={eventScope}
              onChange={(e) => {
                setEventScope(e.target.value as EventScope);
                setEventId('');
              }}
            >
              {(Object.entries(scopeLabels) as [EventScope, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </ResponsiveSelect>
          </label>
          <label className="lcr-field">
            <span>Service</span>
            <ResponsiveSelect
              aria-label="Filter by Service"
              value={eventId}
              disabled={catalogLoading}
              onChange={(event) => setEventId(event.target.value)}
            >
              <option value="">
                {catalogLoading ? 'Loading Services…' : 'All Matching Services'}
              </option>
              {services.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {manilaDate(event.service_date)}
                </option>
              ))}
            </ResponsiveSelect>
          </label>
          <label className="lcr-field lcr-search-field">
            <span>Member</span>
            <div className="lcr-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search Attendance by Member"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="Name, Member ID or Contact"
              />
              {memberQuery && (
                <button
                  type="button"
                  aria-label="Clear Member Search"
                  onClick={() => setMemberQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </label>
        </div>
        {moreOpen && (
          <div id="records-more-filters" className="lcr-filters__more">
            <label className="lcr-field">
              <span>Church</span>
              <ResponsiveSelect
                aria-label="Filter by Church"
                value={churchId}
                onChange={(event) => setChurchId(event.target.value)}
              >
                <option value="">All Churches</option>
                {churches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </ResponsiveSelect>
            </label>
            <label className="lcr-field">
              <span>Ministry</span>
              <ResponsiveSelect
                aria-label="Filter by Ministry"
                value={ministryId}
                onChange={(event) => setMinistryId(event.target.value)}
              >
                <option value="">All Ministries</option>
                {ministries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </ResponsiveSelect>
            </label>
            <label className="lcr-field">
              <span>Date Range</span>
              <ResponsiveSelect
                aria-label="Filter by Date Range"
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value as DateRange)}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
                <option value="custom">Custom Range</option>
              </ResponsiveSelect>
            </label>
            {dateRange === 'custom' && (
              <div className="lcr-custom-dates">
                <label className="lcr-field" role="group" aria-labelledby="lcr-from-label">
                  <span id="lcr-from-label">From</span>
                  <ServiceDatePicker
                    id="lcr-date-from"
                    value={customStart}
                    onChange={setCustomStart}
                    disabled={exporting || removing}
                  />
                </label>
                <label className="lcr-field" role="group" aria-labelledby="lcr-to-label">
                  <span id="lcr-to-label">To</span>
                  <ServiceDatePicker
                    id="lcr-date-to"
                    value={customEnd}
                    onChange={setCustomEnd}
                    disabled={exporting || removing}
                  />
                </label>
              </div>
            )}
          </div>
        )}
        {activeFilterChips.length > 0 && (
          <div className="lcr-filter-chips" aria-label="Active Filters">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={chip.clear}
                aria-label={`Remove ${chip.label} Filter`}
              >
                {chip.label}
                <X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </fieldset>
      {catalogError && (
        <div className="lcr-notice is-error" role="alert">
          <p>{uiMessage(catalogError)}</p>
        </div>
      )}

      <div className="lcr-table-toolbar" ref={tableTop}>
        <div>
          <strong>
            {blocking ? 'Loading Records…' : `${report.total.toLocaleString()} Matching Records`}
          </strong>
          <span>Manila Time · Saved Member & Service Details</span>
        </div>
        <div className="lcr-table-toolbar__actions">
          <span className="lcr-sort-summary" aria-live="polite">
            {descending ? (
              <ArrowDown size={13} aria-hidden="true" />
            ) : (
              <ArrowUp size={13} aria-hidden="true" />
            )}
            {sortLabel(sort, descending)}
          </span>
          <label className="lcr-sort">
            <span>Sort</span>
            <ResponsiveSelect
              aria-label="Sort Attendance Records"
              disabled={busy || exporting || removing}
              value={`${sort}:${descending ? 'desc' : 'asc'}`}
              onChange={(event) => selectSort(event.target.value)}
            >
              {sortChoices
                .flatMap((choice) => [
                  {
                    value: `${choice.value}:desc`,
                    label:
                      choice.value === 'check_in'
                        ? 'Check-In · Newest First'
                        : `${choice.label} · Z–A`,
                  },
                  {
                    value: `${choice.value}:asc`,
                    label:
                      choice.value === 'check_in'
                        ? 'Check-In · Oldest First'
                        : `${choice.label} · A–Z`,
                  },
                ])
                .map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
            </ResponsiveSelect>
          </label>
          <button
            type="button"
            className="lcr-refresh"
            aria-label="Refresh Attendance Records"
            disabled={loading || exporting || removing}
            onClick={() => {
              setCatalogError('');
              setAsOf(new Date().toISOString());
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>{busy && hasSnapshot ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>
      {error && hasSnapshot && (
        <div className="lcr-notice is-error" role="alert">
          <p>
            <strong>Records Could Not Be Updated</strong>
            <br />
            {uiMessage(error)}
          </p>
          <button
            type="button"
            className="lcr-button"
            onClick={() => setAsOf(new Date().toISOString())}
          >
            Try Again
          </button>
        </div>
      )}
      {error && !hasSnapshot ? (
        <div className="lcr-notice is-error" role="alert">
          <p>{uiMessage(error)}</p>
          <button
            type="button"
            className="lcr-button"
            onClick={() => setAsOf(new Date().toISOString())}
          >
            Try Again
          </button>
        </div>
      ) : blocking ? (
        <div className="lcr-loading" role="status" aria-label="Loading Attendance Records">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index}>
              <span />
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : !report.rows.length ? (
        <div className="lcr-empty">
          <span>
            <FileSearch size={28} aria-hidden="true" />
          </span>
          <h3>No Matching Check-Ins</h3>
          <p>Adjust the filters to include other services or members.</p>
          {activeCount > 0 && (
            <button type="button" className="lcr-button" onClick={clearFilters}>
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="lcr-table-wrap">
          <table className="lcr-table" aria-label="Attendance Records">
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={sort === 'member' ? (descending ? 'descending' : 'ascending') : 'none'}
                >
                  <SortColumn
                    label="Member"
                    fields={['member']}
                    sort={sort}
                    descending={descending}
                    disabled={busy || exporting || removing}
                    onChange={selectSort}
                  />
                </th>
                <th
                  scope="col"
                  aria-sort={
                    ['church', 'ministry'].includes(sort)
                      ? descending
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <SortColumn
                    label="Community"
                    fields={['church', 'ministry']}
                    sort={sort}
                    descending={descending}
                    disabled={busy || exporting || removing}
                    onChange={selectSort}
                  />
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sort === 'service' ? (descending ? 'descending' : 'ascending') : 'none'
                  }
                >
                  <SortColumn
                    label="Service"
                    fields={['service']}
                    sort={sort}
                    descending={descending}
                    disabled={busy || exporting || removing}
                    onChange={selectSort}
                  />
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sort === 'check_in' ? (descending ? 'descending' : 'ascending') : 'none'
                  }
                >
                  <SortColumn
                    label="Check-In"
                    fields={['check_in']}
                    sort={sort}
                    descending={descending}
                    disabled={busy || exporting || removing}
                    onChange={selectSort}
                  />
                </th>
                <th scope="col">
                  <span className="lcr-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="lcr-row">
                    <td data-label="Member">
                      <div className="lcr-member">
                        <span className="lcr-avatar" aria-hidden="true">
                          {row.first_name[0]}
                          {row.last_name[0]}
                        </span>
                        <div>
                          <button type="button" className="lcr-name" onClick={() => setDetail(row)}>
                            {fullName(row)}
                          </button>
                          <small>
                            <i
                              data-inactive={row.member_status !== 'active' || undefined}
                              title={`Saved Status: ${uiStatus(row.member_status)}`}
                            />
                            {row.member_number}
                            {row.snapshot_source === 'backfilled_current_data' && (
                              <span
                                className="lcr-backfill"
                                title="Historical details were backfilled from the profile when reports were updated."
                              >
                                Backfilled
                              </span>
                            )}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Community">
                      <div className="lcr-community">
                        <span>{names(row.churches) || 'No Church'}</span>
                        <div>
                          {row.ministries.slice(0, 2).map((item) => (
                            <span className="lcr-pill" key={item.id}>
                              {item.name}
                            </span>
                          ))}
                          {row.ministries.length > 2 && (
                            <button
                              type="button"
                              className="lcr-pill"
                              onClick={() => setDetail(row)}
                              aria-label={`View All ${row.ministries.length} Ministries for ${fullName(row)}`}
                            >
                              +{row.ministries.length - 2}
                            </button>
                          )}
                          {!row.ministries.length && <small>No Ministry</small>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Service">
                      <div className="lcr-service">
                        <time
                          dateTime={row.service_date}
                          className="lcr-calendar"
                          aria-label={shortDate(row.service_date)}
                        >
                          <small>{calendarMonth(row.service_date)}</small>
                          <strong>{calendarDay(row.service_date)}</strong>
                        </time>
                        <div>
                          <strong>{row.service_name}</strong>
                          <span>
                            <i className="lcr-state" data-state={row.service_state}>
                              {uiStatus(row.service_state)}
                            </i>
                            {row.sunday_service && <small>Sunday</small>}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Check-In">
                      <div className="lcr-checkin">
                        <strong>{timeOnly(row.checked_in_at)}</strong>
                        <time dateTime={row.checked_in_at}>{shortDate(row.checked_in_at)}</time>
                        {row.attendance_status !== 'present' && (
                          <span className="lcr-corrected">{uiStatus(row.attendance_status)}</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Actions">
                      <div className="lcr-row-actions">
                        <button
                          type="button"
                          className="lcr-icon"
                          aria-label={`View Attendance for ${fullName(row)}`}
                          title="View Details"
                          onClick={() => setDetail(row)}
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          type="button"
                          className="lcr-icon is-danger"
                          title="Remove Check-In"
                          aria-label={`Remove Check-In for ${fullName(row)}`}
                          disabled={removing || exporting || busy || !!error}
                          aria-expanded={removeTarget?.id === row.id}
                          aria-controls={
                            removeTarget?.id === row.id ? `lcr-remove-${row.id}` : undefined
                          }
                          onClick={() => {
                            setMessage('');
                            setRemoveError('');
                            setRemoveTarget(removeTarget?.id === row.id ? null : row);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {removeTarget?.id === row.id && (
                    <tr className="lcr-confirm-row">
                      <td colSpan={5}>
                        <section
                          ref={confirmation}
                          id={`lcr-remove-${row.id}`}
                          className="lcr-confirm"
                          aria-label="Confirm Check-In Removal"
                          onKeyDown={(event) => {
                            if (event.key === 'Escape' && !removing) setRemoveTarget(null);
                          }}
                        >
                          <div>
                            <strong>Remove Check-In?</strong>
                            <p>
                              <b>{fullName(row)}</b> · {row.service_name}
                            </p>
                            <small>Hold to confirm. Undo is available after removal.</small>
                            {removeError && (
                              <p className="lcr-confirm__error" role="alert">
                                {uiMessage(removeError)}
                              </p>
                            )}
                          </div>
                          <div className="lcr-confirm__actions">
                            <button
                              type="button"
                              data-confirm-cancel
                              className="lcr-button"
                              disabled={removing}
                              onClick={() => setRemoveTarget(null)}
                            >
                              Cancel
                            </button>
                            <HoldButton
                              label="Hold to Remove"
                              holdingLabel="Keep Holding…"
                              doneLabel={removing ? 'Removing…' : 'Confirmed'}
                              holdMs={1300}
                              resetAfter={1200}
                              size="md"
                              icon={<Trash2 size={15} />}
                              disabled={removing || exporting}
                              className="lcr-hold"
                              onConfirm={removeCheckIn}
                            />
                          </div>
                        </section>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="lcr-pagination">
        <label>
          <span>Rows per Page</span>
          <ResponsiveSelect
            aria-label="Attendance Rows per Page"
            disabled={exporting || removing}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          >
            {[25, 50, 100].map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </ResponsiveSelect>
        </label>
        <span aria-live="polite">
          {blocking
            ? 'Updating…'
            : report.total
              ? `${page * size + 1}–${Math.min((page + 1) * size, report.total)} of ${report.total.toLocaleString()}`
              : '0 Records'}
        </span>
        <nav aria-label="Attendance Pages">
          {[
            { label: 'First Page', index: 0, Icon: ChevronsLeft, off: page === 0 },
            { label: 'Previous Page', index: page - 1, Icon: ChevronLeft, off: page === 0 },
            { label: 'Next Page', index: page + 1, Icon: ChevronRight, off: page >= pages - 1 },
            { label: 'Last Page', index: pages - 1, Icon: ChevronsRight, off: page >= pages - 1 },
          ].map(({ label, index, Icon, off }) => (
            <Fragment key={label}>
              {label === 'Next Page' && (
                <span>
                  Page {page + 1} of {pages}
                </span>
              )}
              <button
                type="button"
                className="lcr-icon"
                aria-label={label}
                disabled={exporting || busy || removing || !!error || off}
                onClick={() => goPage(index)}
              >
                <Icon size={17} />
              </button>
            </Fragment>
          ))}
        </nav>
      </footer>

      {detail && (
        <ReportDialog label="lcr-detail-heading" onClose={() => setDetail(null)}>
          <header className="lcr-detail__header">
            <span className="lcr-avatar" aria-hidden="true">
              {detail.first_name[0]}
              {detail.last_name[0]}
            </span>
            <div>
              <p className="lcr-eyebrow">Attendance Details</p>
              <h2 id="lcr-detail-heading">{fullName(detail)}</h2>
              <span>
                {detail.member_number} · {uiStatus(detail.member_status)} Member
              </span>
            </div>
            <button
              type="button"
              autoFocus
              className="lcr-icon"
              aria-label="Close Attendance Details"
              onClick={() => setDetail(null)}
            >
              <X size={19} />
            </button>
          </header>
          <div className="lcr-detail__body">
            <section className="lcr-detail__checkin">
              <span>
                <ScanLine size={20} aria-hidden="true" />
                Check-In
              </span>
              <strong>{timeOnly(detail.checked_in_at)}</strong>
              <p>{shortDate(detail.checked_in_at)} · Manila Time</p>
              <small>{uiStatus(detail.attendance_status)}</small>
            </section>
            <section className="lcr-detail__section">
              <h3>
                <CalendarDays size={16} aria-hidden="true" />
                Service
              </h3>
              <strong className="lcr-detail__service">{detail.service_name}</strong>
              <p>
                <Clock3 size={14} aria-hidden="true" />
                {stamp(detail.service_date)}
              </p>
              {detail.service_location && (
                <p>
                  <MapPin size={14} aria-hidden="true" />
                  {detail.service_location}
                </p>
              )}
              <span className="lcr-state" data-state={detail.service_state}>
                {uiStatus(detail.service_state)}
              </span>
              {detail.sunday_service && <span className="lcr-pill">Sunday Service</span>}
            </section>
            <section className="lcr-detail__section">
              <h3>
                <UsersRound size={16} aria-hidden="true" />
                Saved Member Details
              </h3>
              <dl>
                {[
                  ['Churches', names(detail.churches) || 'Unassigned'],
                  ['Ministries', names(detail.ministries) || 'None'],
                  ['Email', detail.email || 'Not Provided'],
                  ['Mobile', detail.mobile || 'Not Provided'],
                  ['Member Group', detail.member_group || 'None'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {detail.notes && (
              <section className="lcr-detail__section">
                <h3>Attendance Note</h3>
                <p className="lcr-detail__note">{detail.notes}</p>
              </section>
            )}
            <details className="lcr-detail__technical">
              <summary>
                <ShieldCheck size={15} aria-hidden="true" />
                Record Information
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <dl>
                {[
                  [
                    'Snapshot',
                    detail.snapshot_source === 'captured_at_check_in'
                      ? 'Captured at Check-In'
                      : 'Backfilled from Current Data',
                  ],
                  ['Snapshot Saved', stamp(detail.snapshot_captured_at)],
                  ['Attendance ID', detail.id],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        </ReportDialog>
      )}
    </section>
  );
}
