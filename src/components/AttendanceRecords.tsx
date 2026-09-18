// Change ID: records-table-inline-v2
// Requires records-table-server-v1.sql. Full replacement for src/components/AttendanceRecords.tsx.
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Download, FileSearch, RotateCcw, ScanLine, Search, SlidersHorizontal, Trash2, UsersRound, X, Eye, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { supabase } from "../lib/supabase";
type NamedItem = { id: string; name: string };
type AttendanceEvent = { id: string; name: string; starts_at: string; ends_at: string | null; archived_at: string | null; is_sunday_service: boolean };
type Props = { events: AttendanceEvent[] };
type DateRange = "all" | "today" | "week" | "month" | "custom";
type Sort = "check_in" | "member" | "church" | "ministry" | "service";
type Row = { id: string; member_id: string; event_id: string; checked_in_at: string; attendance_status: string; first_name: string; last_name: string; member_number: string; email: string | null; mobile: string | null; member_status: string; service_name: string; service_date: string; service_state: string; churches: NamedItem[]; ministries: NamedItem[] };
type Report = { total: number; members: number; services: number; rows: Row[] };
const emptyReport: Report = { total: 0, members: 0, services: 0, rows: [] };
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const manilaDate = (value: string | Date) => dateFormatter.format(new Date(value));
const stamp = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const names = (items: NamedItem[]) => items.map(item => item.name).join(" | ");
const fullName = (row: Row) => `${row.first_name} ${row.last_name}`;
function shiftDate(value: string, days: number) { const date = new Date(`${value}T12:00:00+08:00`); date.setUTCDate(date.getUTCDate() + days); return manilaDate(date); }
// Neutralize spreadsheet formulas in free-text exports, then quote every field.
function csvValue(value: unknown) { let text = String(value ?? ""); if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; }
async function getReport(args: Record<string, unknown>): Promise<Report> {
  const { data, error } = await supabase.rpc("attendance_report_v1", args);
  if (error) throw new Error(error.code === "PGRST202" ? "Run records-table-server-v1.sql in Supabase first, then press Refresh." : error.message);
  if (!data || !Array.isArray(data.rows)) throw new Error("The reporting server returned an invalid response.");
  return data as Report;
}
function ReportDialog({ children, onClose, label, locked = false }: { children: ReactNode; onClose: () => void; label: string; locked?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className="rt-dialog" aria-labelledby={label} onCancel={e => { e.preventDefault(); if (!locked) onClose(); }} onClick={e => { if (e.target === e.currentTarget && !locked) onClose(); }}>{children}</dialog>;
}
export default function AttendanceRecords({ events }: Props) {
  const [report, setReport] = useState<Report>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customStart, setCustomStart] = useState(""); const [customEnd, setCustomEnd] = useState("");
  const [eventId, setEventId] = useState(""); const [churchId, setChurchId] = useState(""); const [ministryId, setMinistryId] = useState("");
  const [memberQuery, setMemberQuery] = useState(""); const [query, setQuery] = useState("");
  const [includeInProgress, setIncludeInProgress] = useState(false); const [includeArchived, setIncludeArchived] = useState(false); const [sundayOnly, setSundayOnly] = useState(false); const [moreOpen, setMoreOpen] = useState(false);
  const [churches, setChurches] = useState<NamedItem[]>([]); const [ministries, setMinistries] = useState<NamedItem[]>([]);
  const [catalogError, setCatalogError] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [sort, setSort] = useState<Sort>("check_in"); const [descending, setDescending] = useState(true); const [size, setSize] = useState(25);
  const [asOf, setAsOf] = useState(() => new Date().toISOString());
  const [pageState, setPageState] = useState({ key: "", index: 0 }); const [loadedKey, setLoadedKey] = useState("");
  const [detail, setDetail] = useState<Row | null>(null); const [removeTarget, setRemoveTarget] = useState<Row | null>(null); const [removing, setRemoving] = useState(false);
  const [exporting, setExporting] = useState(false); const tableTop = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setQuery(memberQuery.trim()), 250); return () => window.clearTimeout(timer); }, [memberQuery]);
  useEffect(() => {
    let cancelled = false;
    async function catalog(table: string) { const rows: NamedItem[] = []; for (let offset = 0;; offset += 500) { const { data, error } = await supabase.from(table).select("id,name").order("name").order("id").range(offset, offset + 499); if (error) throw error; rows.push(...(data ?? [])); if ((data ?? []).length < 500) return rows; } }
    Promise.all([catalog("branches"), catalog("ministries")]).then(([c,m]) => { if (!cancelled) { setChurches(c); setMinistries(m); } }).catch(e => { if (!cancelled) setCatalogError(`Could not load filter options: ${e.message}`); });
    return () => { cancelled = true; };
  }, [asOf]);
  const range = useMemo(() => { const today = manilaDate(asOf); if (dateRange === "today") return [today,today]; if (dateRange === "week") return [shiftDate(today,-6),today]; if (dateRange === "month") return [shiftDate(today,-29),today]; return dateRange === "custom" ? [customStart,customEnd] : ["",""]; }, [dateRange,customStart,customEnd,asOf]);
  const invalidRange = Boolean(range[0] && range[1] && range[0] > range[1]);
  function eventState(event: AttendanceEvent) { const start = Date.parse(event.starts_at); if (start > Date.parse(asOf)) return "upcoming"; if (event.archived_at) return "archived"; return start + 10800000 <= Date.parse(asOf) ? "completed" : "in-progress"; }
  const selectableEvents = events.filter(e => { const s = eventState(e); return s === "completed" || (includeInProgress && s === "in-progress") || (includeArchived && s === "archived"); }).sort((a,b) => Date.parse(b.starts_at)-Date.parse(a.starts_at));
  const selectedAvailable = !eventId || selectableEvents.some(e => e.id === eventId);
  useEffect(() => { if (!selectedAvailable) setEventId(""); }, [selectedAvailable]);
  const request = { p_filters: { event_id: selectedAvailable ? eventId : "", church_id: churchId, ministry_id: ministryId, query, include_live: includeInProgress, include_archived: includeArchived, sunday_only: sundayOnly, start: range[0], end: range[1] }, p_sort: sort, p_desc: descending, p_as_of: asOf };
  const key = JSON.stringify({ ...request, size });
  const page = pageState.key === key ? pageState.index : 0;
  const fetchKey = `${key}:${page}`;
  const busy = loading || loadedKey !== fetchKey || query !== memberQuery.trim();
  useEffect(() => {
    let cancelled = false;
    if (invalidRange) { setError("From must be on or before To."); setReport(emptyReport); setLoading(false); setLoadedKey(fetchKey); return; }
    setLoading(true); setError("");
    const { size: pageSize, ...args } = JSON.parse(key);
    getReport({ ...args, p_limit: pageSize, p_offset: page * pageSize }).then(result => {
      if (cancelled) return;
      const last = Math.max(0, Math.ceil(result.total / pageSize) - 1);
      if (page > last) { setPageState({ key, index: last }); return; }
      setReport(result); setLoadedKey(fetchKey);
    }).catch(e => { if (!cancelled) { setError(e.message); setReport(emptyReport); setLoadedKey(fetchKey); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, page, fetchKey, invalidRange]);
  const pages = Math.max(1, Math.ceil(report.total / size));
  function goPage(index: number) {
    if (busy || removing || index === page) return;
    pendingScroll.current = `${key}:${index}`;
    setRemoveTarget(null);
    setPageState({ key, index });
  }
  useEffect(() => {
    if (busy || pendingScroll.current !== fetchKey) return;
    const frame = window.requestAnimationFrame(() => {
      tableTop.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      pendingScroll.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, fetchKey]);
  useEffect(() => { setRemoveTarget(null); setRemoveError(""); }, [key]);
  function changeSort(next: Sort) { if (sort === next) setDescending(!descending); else { setSort(next); setDescending(next === "check_in"); } }
  const activeCount = [
    dateRange !== "all",
    eventId,
    churchId,
    ministryId,
    memberQuery.trim(),
    includeInProgress,
    includeArchived,
    sundayOnly,
  ].filter(Boolean).length;
  function clearFilters() {
    setDateRange("all");
    setCustomStart("");
    setCustomEnd("");
    setEventId("");
    setChurchId("");
    setMinistryId("");
    setMemberQuery("");
    setIncludeInProgress(false);
    setIncludeArchived(false);
    setSundayOnly(false);
  }

  const activeFilterChips = [
    dateRange !== "all" && {
      label: dateRange === "today" ? "Today" : dateRange === "week" ? "Last 7 days" : dateRange === "month" ? "Last 30 days" : "Custom dates",
      clear: () => { setDateRange("all"); setCustomStart(""); setCustomEnd(""); },
    },
    eventId && { label: events.find((event) => event.id === eventId)?.name ?? "Service", clear: () => setEventId("") },
    churchId && { label: churches.find((church) => church.id === churchId)?.name ?? "Church", clear: () => setChurchId("") },
    ministryId && { label: ministries.find((ministry) => ministry.id === ministryId)?.name ?? "Ministry", clear: () => setMinistryId("") },
    memberQuery.trim() && { label: `Member: ${memberQuery.trim()}`, clear: () => setMemberQuery("") },
    includeInProgress && { label: "In-progress services", clear: () => setIncludeInProgress(false) },
    includeArchived && { label: "Archive history", clear: () => setIncludeArchived(false), className: "records-filter-chip archive-history" },
    sundayOnly && { label: "Sunday services", clear: () => setSundayOnly(false) },
  ].filter(Boolean) as Array<{ label: string; clear: () => void; className?: string }>;

  async function exportCsv() {
    setExporting(true); setMessage("");
    try {
      const all: Row[] = []; const seen = new Set<string>(); let expected = -1;
      for (let offset = 0;; offset += 500) {
        const result = await getReport({ ...request, p_offset: offset, p_limit: 500 });
        if (expected < 0) expected = result.total;
        if (expected !== result.total) throw new Error("Records changed during export. Refresh and try again.");
        for (const row of result.rows) { if (seen.has(row.id)) throw new Error("Records changed during export. Refresh and try again."); seen.add(row.id); all.push(row); }
        setMessage(`Preparing CSV: ${all.length} of ${expected} records…`);
        if (all.length >= expected) break;
        if (!result.rows.length) throw new Error("Export stopped before all records were received. Please retry.");
      }
      const rows: unknown[][] = [["attendance_id","member_id","member_number","member_name","member_status_current","email_current","mobile_current","churches_current","ministries_current","service_id","service_name","service_start_iso","service_status","attendance_status","check_in_iso","check_in_manila","method"], ...all.map(r => [r.id,r.member_id,r.member_number,fullName(r),r.member_status,r.email,r.mobile,names(r.churches),names(r.ministries),r.event_id,r.service_name,r.service_date,r.service_state,r.attendance_status,r.checked_in_at,stamp(r.checked_in_at),"Not recorded"])];
      const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(r => r.map(csvValue).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `lifecity-attendance-${manilaDate(asOf)}.csv`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Exported ${all.length} matching records.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Export failed. Please retry."); } finally { setExporting(false); }
  }
  async function removeCheckIn() {
    if (!removeTarget) return; setRemoving(true); setMessage(""); setRemoveError("");
    try { const { data, error } = await supabase.from("attendance").delete().eq("id",removeTarget.id).select("id"); if (error) throw error; if (!data?.length) throw new Error("The record was not removed. It may already be deleted, or access may be restricted."); setRemoveTarget(null); setAsOf(new Date().toISOString()); setMessage("Check-in removed."); }
    catch(e) { setRemoveError(e instanceof Error ? e.message : "Could not remove check-in."); } finally { setRemoving(false); }
  }
  return (
    <section className="records-card records-table-v1" data-change-id="records-table-inline-v2">
      <div className="records-toolbar"><div><p className="records-section-kicker">Attendance ledger</p><h2>Your check-in history</h2><p>Completed services by default. Export every matching record across all pages.</p></div><button className="primary-button" onClick={() => void exportCsv()} disabled={busy || !!error || exporting || !report.total}><Download size={18}/>{exporting ? "Preparing CSV…" : "Export CSV"}</button></div>
      <div className="records-summary-shelf">{[{label:"Check-ins found",value:report.total,Icon:ScanLine,color:"mint"},{label:"Unique members",value:report.members,Icon:UsersRound,color:"violet"},{label:"Services included",value:report.services,Icon:CalendarDays,color:"gold"}].map(({label,value,Icon,color}) => <div className="records-summary-item" key={label}><span className={`records-summary-icon ${color}`}><Icon size={17}/></span><div><strong>{busy ? "—" : value.toLocaleString()}</strong><span>{label}</span></div></div>)}</div>
      <section className="records-filter-panel">
        <div className="records-filter-panel-heading">
          <div>
            <p className="records-filter-kicker">Find the right records</p>
            <h3>Filters</h3>
          </div>
          <div className="records-filter-panel-actions">
            <span className="records-result-count">
              {busy ? "Updating…" : `${report.total} records found`}
            </span>
            {activeCount > 0 && <span className="records-filter-count">{activeCount} active</span>}
            {activeCount > 0 && <button type="button" className="records-clear-filters" onClick={clearFilters}><RotateCcw size={15} />Clear all</button>}
            <button
              type="button"
              className="records-more-filter-button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <SlidersHorizontal size={16} />
              More filters
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="records-active-filter-chips" aria-label="Active filters">
            {activeFilterChips.map((chip) => (
              <button key={chip.label} type="button" className={chip.className ?? "records-filter-chip"} onClick={chip.clear} title={`Remove ${chip.label} filter`}>
                {chip.label}<X size={13} />
              </button>
            ))}
          </div>
        )}
        <div className="records-primary-filters">
          <label className="records-filter-field">
            <span>Service</span>
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            >
              <option value="">{includeArchived || includeInProgress ? "All included services" : "All completed services"}</option>
              {selectableEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {manilaDate(event.starts_at)}{eventState(event) === "archived" ? " (Archived)" : eventState(event) === "in-progress" ? " (In progress)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="records-filter-field records-member-search">
            <span>Member</span>
            <div className="records-search-input">
              <Search size={16} />
              <input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="Name, member ID, email or mobile"
              />
            </div>
          </label>
        </div>
        {moreOpen && (
          <div className="records-more-filters">
            <label className="records-filter-field">
              <span>Church</span>
              <select
                value={churchId}
                onChange={(event) => setChurchId(event.target.value)}
              >
                <option value="">All churches</option>
                {churches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="records-filter-field">
              <span>Ministry</span>
              <select
                value={ministryId}
                onChange={(event) => setMinistryId(event.target.value)}
              >
                <option value="">All ministries</option>
                {ministries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="records-filter-field">
              <span>Date range</span>
              <select
                value={dateRange}
                onChange={(event) =>
                  setDateRange(event.target.value as DateRange)
                }
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {dateRange === "custom" && (
              <div className="records-custom-dates">
                <label className="records-filter-field"><span>From</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
                <label className="records-filter-field"><span>To</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
              </div>
            )}
            <div className="records-scope-options">
            <label className="records-sunday-filter">
              <input type="checkbox" checked={sundayOnly} onChange={(event) => setSundayOnly(event.target.checked)} />
              <span>Sunday services only</span>
            </label>
            <label className="records-sunday-filter">
              <input type="checkbox" checked={includeInProgress} onChange={(event) => setIncludeInProgress(event.target.checked)} />
              <span>Include in-progress services</span>
            </label>
            <label className="records-sunday-filter">
              <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
              <span>Include archived services</span>
            </label>
            </div>
          </div>
        )}
      </section>

      {catalogError && <p className="rt-notice" role="alert">{catalogError}</p>}
      {message && <p className="rt-notice" role="status">{message}</p>}
      <div className="rt-table-top" ref={tableTop}>
        <div><h3>Attendance records</h3><p>Times in Manila · Church, ministry and member status reflect current profiles.</p></div>
        <button type="button" className="rt-button" disabled={loading || exporting} onClick={() => { setCatalogError(""); setAsOf(new Date().toISOString()); }}><RotateCcw size={15}/>Refresh</button>
      </div>
      {error ? <p className="rt-notice rt-error" role="alert">{error}</p> : busy ? <p className="empty-state" role="status">Loading records…</p> : !report.rows.length ? <div className="empty-state"><FileSearch size={30}/><h3>No matching attendance</h3><p>Try adjusting filters or including archived or in-progress services.</p></div> : <div className="rt-scroll" tabIndex={0} role="region" aria-label="Attendance table, scroll horizontally for more columns"><table className="rt-table"><thead><tr>
        {([{key:"member",label:"Member"},{key:"church",label:"Church"},{key:"ministry",label:"Ministries"},{key:"service",label:"Service"},{key:"check_in",label:"Check-in time"}] as {key:Sort;label:string}[]).map(c => <th key={c.key} scope="col" aria-sort={sort === c.key ? descending ? "descending" : "ascending" : "none"}><button onClick={() => changeSort(c.key)}>{c.label}<span aria-hidden="true">{sort === c.key ? descending ? "↓" : "↑" : <ArrowUpDown size={13}/>}</span></button></th>)}
        <th scope="col">Actions</th>
      </tr></thead><tbody>{report.rows.map(r => <Fragment key={r.id}><tr>
        <td><button className="rt-member" onClick={() => setDetail(r)}><span className={`rt-dot ${r.member_status === "active" ? "is-active" : ""}`} title={`Current member status: ${r.member_status}`} aria-label={`Current member status: ${r.member_status}`}/><strong>{fullName(r)}</strong></button><small>{r.member_number}</small></td>
        <td>{r.churches.length ? names(r.churches) : <span className="rt-muted">Unassigned</span>}</td>
        <td><div className="rt-pills">{r.ministries.slice(0,2).map(m => <span key={m.id}>{m.name}</span>)}{r.ministries.length > 2 && <button onClick={() => setDetail(r)} aria-label={`View all ${r.ministries.length} ministries for ${fullName(r)}`}>+{r.ministries.length - 2}</button>}{!r.ministries.length && <span className="rt-muted">None</span>}</div></td>
        <td><strong>{r.service_name}</strong><small>{manilaDate(r.service_date)} · {r.service_state.replace("-"," ")}</small></td>
        <td className="rt-time">{stamp(r.checked_in_at)}</td>
        <td><div className="rt-actions"><button className="rt-icon" title="View attendance details" aria-label={`View attendance for ${fullName(r)}`} onClick={() => setDetail(r)}><Eye size={17}/></button><button className="rt-icon rt-danger" title="Remove check-in" aria-label={`Remove check-in for ${fullName(r)}`} disabled={removing} aria-expanded={removeTarget?.id === r.id} aria-controls={removeTarget?.id === r.id ? `rt-remove-${r.id}` : undefined} onClick={() => { setMessage(""); setRemoveError(""); setRemoveTarget(removeTarget?.id === r.id ? null : r); }}><Trash2 size={16}/></button></div></td>
      </tr>
        {removeTarget?.id === r.id && <tr className="rt-inline-row"><td colSpan={6}>
          <section id={`rt-remove-${r.id}`} className="rt-inline-confirm" aria-label="Confirm check-in removal" onKeyDown={e => { if (e.key === "Escape" && !removing) setRemoveTarget(null); }}>
            <div><strong>Remove this check-in?</strong><p>This permanently removes <b>{fullName(r)}</b>’s attendance for <b>{r.service_name}</b>.</p>{removeError && <p className="rt-inline-error" role="alert">{removeError}</p>}</div>
            <div className="rt-inline-actions"><button autoFocus className="rt-button" disabled={removing} onClick={() => setRemoveTarget(null)}>Cancel</button><button className="rt-button rt-danger" disabled={removing} onClick={() => void removeCheckIn()}><Trash2 size={15}/>{removing ? "Removing…" : "Remove check-in"}</button></div>
          </section>
        </td></tr>}
      </Fragment>)}</tbody></table></div>}
      <div className="rt-pagination"><label>Rows per page <select value={size} onChange={e => setSize(Number(e.target.value))}>{[25,50,100].map(n => <option key={n} value={n}>{n}</option>)}</select></label><span aria-live="polite">{busy ? "Updating…" : report.total ? `${page*size+1}–${Math.min((page+1)*size,report.total)} of ${report.total.toLocaleString()}` : "0 records"}</span><nav aria-label="Attendance pages">{[{label:"First page",index:0,Icon:ChevronsLeft,disabled:page===0},{label:"Previous page",index:page-1,Icon:ChevronLeft,disabled:page===0}].map(({label,index,Icon,disabled}) => <button key={label} className="rt-icon" aria-label={label} disabled={busy || removing || !!error || disabled} onClick={() => goPage(index)}><Icon size={17}/></button>)}<span>Page {page+1} of {pages}</span>{[{label:"Next page",index:page+1,Icon:ChevronRight},{label:"Last page",index:pages-1,Icon:ChevronsRight}].map(({label,index,Icon}) => <button key={label} className="rt-icon" aria-label={label} disabled={busy || removing || !!error || page >= pages-1} onClick={() => goPage(index)}><Icon size={17}/></button>)}</nav></div>
      {detail && <ReportDialog label="rt-detail-heading" onClose={() => setDetail(null)}><div className="rt-dialog-body"><button autoFocus className="rt-icon rt-close" aria-label="Close details" onClick={() => setDetail(null)}><X size={19}/></button><p className="records-section-kicker">Attendance details</p><h2 id="rt-detail-heading">{fullName(detail)}</h2><p>{detail.member_number} · {detail.member_status} member</p><dl>{[["Service",detail.service_name],["Service start",stamp(detail.service_date)],["Service state",detail.service_state],["Check-in",`${stamp(detail.checked_in_at)} (Manila)`],["Attendance status",detail.attendance_status],["Method","Not recorded"],["Current Churches",names(detail.churches)||"Unassigned"],["Current ministries",names(detail.ministries)||"None"],["Email",detail.email||"Not provided"],["Mobile",detail.mobile||"Not provided"],["Attendance ID",detail.id]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></ReportDialog>}

    </section>
  );
}
