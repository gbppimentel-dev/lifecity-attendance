// Change ID: records-complete-v4-20260918
// Requires records-complete-v4-20260918.sql. Full replacement for src/components/AttendanceRecords.tsx.
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Download, FileSearch, RotateCcw, ScanLine, Search, SlidersHorizontal, Trash2, UsersRound, X, Eye, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { supabase } from "../lib/supabase";
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
type DateRange = "all" | "today" | "week" | "month" | "custom";
type EventScope = "completed" | "in-progress" | "archived" | "history" | "all";
const scopeLabels: Record<EventScope, string> = { completed: "Completed services", "in-progress": "In-progress services", archived: "Archived services", history: "Completed + archived", all: "All reportable services" };
type ServiceOption = NamedItem & {
    service_date: string;
    service_state: string;
};
type ExportMode = "quick" | "detailed";
type Sort = "check_in" | "member" | "church" | "ministry" | "service";
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
const emptyReport: Report = { top_group: null, revision: "", total: 0, members: 0, services: 0, rows: [] };
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const manilaDate = (value: string | Date) => dateFormatter.format(new Date(value));
const stamp = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const names = (items: NamedItem[]) => items.map(item => item.name).join(" | ");
const fullName = (row: Row) => `${row.first_name} ${row.last_name}`;
function shiftDate(value: string, days: number) { const date = new Date(`${value}T12:00:00+08:00`); date.setUTCDate(date.getUTCDate() + days); return manilaDate(date); }
// Neutralize spreadsheet formulas in free-text exports, then quote every field.
function csvValue(value: unknown) { let text = String(value ?? ""); if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text))
    text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; }
async function getReport(args: Record<string, unknown>): Promise<Report> {
    const { data, error } = await supabase.rpc("attendance_report_v4", args);
    if (error)
        throw new Error(error.code === "PGRST202" ? "Run records-complete-v4-20260918.sql in Supabase first, then press Refresh." : error.message);
    if (!data || !Array.isArray(data.rows))
        throw new Error("The reporting server returned an invalid response.");
    if (data.report_version !== 4 || !Object.prototype.hasOwnProperty.call(data, "top_group")) throw new Error("The reporting database update is incomplete. Run records-complete-v4-20260918.sql, then Refresh.");
    return data as Report;
}
function ReportDialog({ children, onClose, label, locked = false }: {
    children: ReactNode;
    onClose: () => void;
    label: string;
    locked?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
    return <dialog ref={ref} className="rt-dialog" aria-labelledby={label} onCancel={e => { e.preventDefault(); if (!locked)
        onClose(); }} onClick={e => { if (e.target === e.currentTarget && !locked)
        onClose(); }}>{children}</dialog>;
}
export default function AttendanceRecords(_props: Props) {
    const [report, setReport] = useState<Report>(emptyReport);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<DateRange>("all");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [eventId, setEventId] = useState("");
    const [churchId, setChurchId] = useState("");
    const [ministryId, setMinistryId] = useState("");
    const [memberQuery, setMemberQuery] = useState("");
    const [query, setQuery] = useState("");
    const [eventScope, setEventScope] = useState<EventScope>("completed");
    const [services, setServices] = useState<ServiceOption[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [sundayOnly, setSundayOnly] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [churches, setChurches] = useState<NamedItem[]>([]);
    const [ministries, setMinistries] = useState<NamedItem[]>([]);
    const [catalogError, setCatalogError] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [sort, setSort] = useState<Sort>("check_in");
    const [descending, setDescending] = useState(true);
    const [size, setSize] = useState(25);
    const [asOf, setAsOf] = useState(() => new Date().toISOString());
    const [pageState, setPageState] = useState({ key: "", index: 0 });
    const [loadedKey, setLoadedKey] = useState("");
    const [detail, setDetail] = useState<Row | null>(null);
    const [removeTarget, setRemoveTarget] = useState<Row | null>(null);
    const [removing, setRemoving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const cancelExport = useRef(false);
    const exportLock = useRef(false);
    useEffect(() => () => { cancelExport.current = true; }, []);
    const tableTop = useRef<HTMLDivElement>(null);
    const pendingScroll = useRef<string | null>(null);
    const [removeError, setRemoveError] = useState("");
    useEffect(() => { const timer = window.setTimeout(() => setQuery(memberQuery.trim()), 250); return () => window.clearTimeout(timer); }, [memberQuery]);
    useEffect(() => {
        let cancelled = false;
        setCatalogLoading(true);
        setCatalogError("");
        async function catalog(kind: string) {
            const rows: ServiceOption[] = [];
            for (let offset = 0;; offset += 500) {
                const { data, error } = await supabase.rpc("attendance_catalog_v4", { p_kind: kind, p_scope: eventScope, p_as_of: asOf, p_offset: offset, p_limit: 500 });
                if (error)
                    throw new Error(error.code === "PGRST202" ? "Run records-complete-v4-20260918.sql in Supabase, then Refresh." : error.message);
                if (!Array.isArray(data))
                    throw new Error("Invalid filter catalog response.");
                rows.push(...data);
                if (cancelled || data.length < 500)
                    return rows;
            }
        }
        Promise.all([catalog("churches"), catalog("ministries"), catalog("events")]).then(([c, m, e]) => {
            if (!cancelled) {
                setChurches(c);
                setMinistries(m);
                setServices(e);
                setEventId(current => current && !e.some(item => item.id === current) ? "" : current);
            }
        }).catch(e => { if (!cancelled)
            setCatalogError(e.message); }).finally(() => { if (!cancelled)
            setCatalogLoading(false); });
        return () => { cancelled = true; };
    }, [asOf, eventScope]);
    const range = useMemo(() => { const today = manilaDate(asOf); if (dateRange === "today")
        return [today, today]; if (dateRange === "week")
        return [shiftDate(today, -6), today]; if (dateRange === "month")
        return [shiftDate(today, -29), today]; return dateRange === "custom" ? [customStart, customEnd] : ["", ""]; }, [dateRange, customStart, customEnd, asOf]);
    const invalidRange = Boolean(range[0] && range[1] && range[0] > range[1]);
    const request = { p_filters: { event_id: eventId, church_id: churchId, ministry_id: ministryId, query, scope: eventScope, sunday_only: sundayOnly, start: range[0], end: range[1] }, p_sort: sort, p_desc: descending, p_as_of: asOf };
    const key = JSON.stringify({ ...request, size });
    const page = pageState.key === key ? pageState.index : 0;
    const fetchKey = `${key}:${page}`;
    const busy = loading || catalogLoading || loadedKey !== fetchKey || query !== memberQuery.trim();
    useEffect(() => {
        let cancelled = false;
        if (invalidRange) {
            setError("From must be on or before To.");
            setReport(emptyReport);
            setLoading(false);
            setLoadedKey(fetchKey);
            return;
        }
        setLoading(true);
        setError("");
        const { size: pageSize, ...args } = JSON.parse(key);
        getReport({ ...args, p_limit: pageSize, p_offset: page * pageSize }).then(result => {
            if (cancelled)
                return;
            const last = Math.max(0, Math.ceil(result.total / pageSize) - 1);
            if (page > last) {
                setPageState({ key, index: last });
                return;
            }
            setReport(result);
            setLoadedKey(fetchKey);
        }).catch(e => { if (!cancelled) {
            setError(e.message);
            setReport(emptyReport);
            setLoadedKey(fetchKey);
        } }).finally(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, [key, page, fetchKey, invalidRange]);
    const pages = Math.max(1, Math.ceil(report.total / size));
    function goPage(index: number) {
        if (exporting || busy || removing || index === page)
            return;
        pendingScroll.current = `${key}:${index}`;
        setRemoveTarget(null);
        setPageState({ key, index });
    }
    useEffect(() => {
        if (busy || pendingScroll.current !== fetchKey)
            return;
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
    function changeSort(next: Sort) { if (exporting || removing)
        return; if (sort === next)
        setDescending(!descending);
    else {
        setSort(next);
        setDescending(next === "check_in");
    } }
    const activeCount = [
        dateRange !== "all",
        eventId,
        churchId,
        ministryId,
        memberQuery.trim(),
        eventScope !== "completed",
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
        setEventScope("completed");
        setSundayOnly(false);
    }
    const activeFilterChips = [
        dateRange !== "all" && {
            label: dateRange === "today" ? "Today" : dateRange === "week" ? "Last 7 days" : dateRange === "month" ? "Last 30 days" : "Custom dates",
            clear: () => { setDateRange("all"); setCustomStart(""); setCustomEnd(""); },
        },
        eventId && { label: services.find((event) => event.id === eventId)?.name ?? "Service", clear: () => setEventId("") },
        churchId && { label: churches.find((church) => church.id === churchId)?.name ?? "Church", clear: () => setChurchId("") },
        ministryId && { label: ministries.find((ministry) => ministry.id === ministryId)?.name ?? "Ministry", clear: () => setMinistryId("") },
        memberQuery.trim() && { label: `Member: ${memberQuery.trim()}`, clear: () => setMemberQuery("") },
        eventScope !== "completed" && { label: scopeLabels[eventScope], clear: () => { setEventScope("completed"); setEventId(""); }, className: "records-filter-chip archive-history" },
        sundayOnly && { label: "Sunday services", clear: () => setSundayOnly(false) },
    ].filter(Boolean) as Array<{
        label: string;
        clear: () => void;
        className?: string;
    }>;
    async function exportCsv(mode: ExportMode) {
        if (exportLock.current || busy || error || !report.total)
            return;
        exportLock.current = true;
        cancelExport.current = false;
        setExporting(true);
        setExportProgress(0);
        setMessage("");
        setRemoveTarget(null);
        const expected = report.total, revision = report.revision;
        const exportRequest = request;
        const quickHeaders = ["member_number", "member_name", "churches_snapshot", "ministries_snapshot", "service_name_snapshot", "service_date_manila", "check_in_manila", "attendance_status"];
        const detailHeaders = ["attendance_id", "member_id", "service_id", "member_number", "first_name_snapshot", "last_name_snapshot", "member_status_snapshot", "member_group_snapshot", "email_snapshot", "mobile_snapshot", "church_ids_snapshot", "churches_snapshot", "ministry_ids_snapshot", "ministries_snapshot", "service_name_snapshot", "service_start_iso_snapshot", "service_end_iso_snapshot", "service_location_snapshot", "sunday_service_snapshot", "service_status_at_export", "archived_at_current", "check_in_iso", "check_in_manila", "attendance_status", "record_created_at", "scanned_by_user_id", "attendance_notes_current", "snapshot_source", "snapshot_captured_at", "snapshot_version", "report_as_of", "exported_at"];
        const exportedAt = new Date().toISOString();
        const chunks: BlobPart[] = ["\uFEFF", (mode === "quick" ? quickHeaders : detailHeaders).map(csvValue).join(",") + "\r\n"];
        let exported = 0;
        const check = (result: Report) => {
            if (result.total !== expected || result.revision !== revision)
                throw new Error("The matching records changed. Refresh and export again; no partial file was downloaded.");
        };
        try {
            for (let offset = 0; offset < expected; offset += 500) {
                if (cancelExport.current)
                    throw new Error("Export cancelled.");
                const result = await getReport({ ...exportRequest, p_offset: offset, p_limit: 500 });
                if (cancelExport.current)
                    throw new Error("Export cancelled.");
                check(result);
                if (result.rows.length !== Math.min(500, expected - offset))
                    throw new Error("Incomplete export response. Please retry.");
                const rows = result.rows.map(r => mode === "quick"
                    ? [r.member_number, fullName(r), names(r.churches), names(r.ministries), r.service_name, manilaDate(r.service_date), stamp(r.checked_in_at), r.attendance_status]
                    : [r.id, r.member_id, r.event_id, r.member_number, r.first_name, r.last_name, r.member_status, r.member_group, r.email, r.mobile ? "'" + r.mobile : "", r.churches.map(x => x.id).join(" | "), names(r.churches), r.ministries.map(x => x.id).join(" | "), names(r.ministries), r.service_name, r.service_date, r.service_end, r.service_location, r.sunday_service, r.service_state, r.archived_at, r.checked_in_at, stamp(r.checked_in_at), r.attendance_status, r.created_at, r.scanned_by, r.notes, r.snapshot_source, r.snapshot_captured_at, r.snapshot_version, asOf, exportedAt]);
                chunks.push(rows.map(r => r.map(csvValue).join(",")).join("\r\n") + "\r\n");
                exported += result.rows.length;
                setExportProgress(exported);
            }
            // Detect a deletion/status edit while the last batch was in flight.
            check(await getReport({ ...exportRequest, p_offset: 0, p_limit: 1 }));
            if (cancelExport.current)
                throw new Error("Export cancelled.");
            const url = URL.createObjectURL(new Blob(chunks, { type: "text/csv;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `lifecity-${mode}-${eventScope}-${manilaDate(asOf)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(`Exported ${exported.toLocaleString()} records · ${mode === "quick" ? "Quick" : "Detailed"} CSV.`);
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "Export failed. Please retry.");
        }
        finally {
            exportLock.current = false;
            setExporting(false);
        }
    }
    async function removeCheckIn() {
        if (!removeTarget || exportLock.current)
            return;
        setRemoving(true);
        setMessage("");
        setRemoveError("");
        try {
            const { data, error } = await supabase.from("attendance").delete().eq("id", removeTarget.id).select("id");
            if (error)
                throw error;
            if (!data?.length)
                throw new Error("The record was not removed. It may already be deleted, or access may be restricted.");
            setRemoveTarget(null);
            setAsOf(new Date().toISOString());
            setMessage("Check-in removed.");
        }
        catch (e) {
            setRemoveError(e instanceof Error ? e.message : "Could not remove check-in.");
        }
        finally {
            setRemoving(false);
        }
    }
    return (<section className="records-card records-table-v1" data-change-id="records-complete-v4-20260918">
      <div className="records-toolbar"><div><p className="records-section-kicker">Attendance ledger</p><h2>Your check-in history</h2><p>Completed services by default. Export every matching record across all pages.</p></div><button className="primary-button" aria-expanded={exportOpen} aria-controls="records-export-center" onClick={() => setExportOpen(!exportOpen)} disabled={exporting}><Download size={18}/>Export CSV</button></div>
      {exportOpen && <section id="records-export-center" className="rh-export-center" aria-label="CSV export center">
        <div className="rh-export-heading"><div><p className="records-section-kicker">CSV export center</p><h3>Your report, ready to share</h3><p>{busy ? "Updating results…" : `${report.total.toLocaleString()} matching records`} · All pages · Current filters and sort order</p></div><button className="rt-icon" aria-label="Close export center" disabled={exporting} onClick={() => setExportOpen(false)}><X size={17}/></button></div>
        <div className="rh-export-choices">
          <button className="rh-export-choice" disabled={busy || !!error || exporting || removing || !report.total} onClick={() => void exportCsv("quick")}><Download size={22}/><span><strong>Quick CSV</strong><small>8 core columns · Member, Churches, ministries, service, check-in and attendance status.</small></span></button>
          <button className="rh-export-choice detailed" disabled={busy || !!error || exporting || removing || !report.total} onClick={() => void exportCsv("detailed")}><FileSearch size={22}/><span><strong>Detailed CSV</strong><small>32 reporting fields · IDs, saved contact details, service details, notes and snapshot provenance.</small></span></button>
        </div>
        <p className="rh-history-note">New check-ins preserve details at entry. Earlier records are labelled “Backfilled from current data” in Detailed CSV.</p>
        {exporting && <div className="rh-export-progress" role="status"><progress max={report.total || 1} value={exportProgress}/><span>{exportProgress.toLocaleString()} / {report.total.toLocaleString()} prepared</span><button className="rt-button" onClick={() => { cancelExport.current = true; }}>Cancel export</button></div>}
      </section>}
      <div className="records-summary-shelf rh-summary-v4">{[{ label: "Check-ins found", value: report.total, Icon: ScanLine, color: "mint" }, { label: "Unique members", value: report.members, Icon: UsersRound, color: "violet" }, { label: "Services included", value: report.services, Icon: CalendarDays, color: "gold" }].map(({ label, value, Icon, color }) => <div className="records-summary-item" key={label}><span className={`records-summary-icon ${color}`}><Icon size={17}/></span><div><strong>{busy ? <span className="rh-skeleton rh-number-skeleton" aria-label="Loading"/> : value.toLocaleString()}</strong><span>{label}</span></div></div>)}<div className="records-summary-item rh-top-group"><span className="records-summary-icon violet"><UsersRound size={17}/></span><div><strong>{busy ? "—" : report.top_group?.name ?? "No affiliations"}</strong><span>{busy ? "Most attended Church" : report.top_group ? `Most attended ${report.top_group.kind} · ${report.top_group.check_ins.toLocaleString()} check-ins` : "No Church or ministry in these results"}</span>{!busy && report.top_group && report.top_group.ties > 1 && <small>+{report.top_group.ties-1} tied</small>}</div></div></div>
      <fieldset className="records-filter-panel rh-filter-fieldset" disabled={exporting || removing}>
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
            {activeCount > 0 && <button type="button" className="records-clear-filters" onClick={clearFilters}><RotateCcw size={15}/>Clear all</button>}
            <button type="button" className="records-more-filter-button" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
              <SlidersHorizontal size={16}/>
              More filters
              <ChevronDown size={16}/>
            </button>
          </div>
        </div>
        {activeFilterChips.length > 0 && (<div className="records-active-filter-chips" aria-label="Active filters">
            {activeFilterChips.map((chip) => (<button key={chip.label} type="button" className={chip.className ?? "records-filter-chip"} onClick={chip.clear} title={`Remove ${chip.label} filter`}>
                {chip.label}<X size={13}/>
              </button>))}
          </div>)}
        <div className="records-primary-filters">
          <label className="records-filter-field"><span>Event Status</span><select value={eventScope} onChange={e => { setEventScope(e.target.value as EventScope); setEventId(""); }}>{(Object.entries(scopeLabels) as [
        EventScope,
        string
    ][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="records-filter-field">
            <span>Service</span>
            <select value={eventId} disabled={catalogLoading} onChange={(event) => setEventId(event.target.value)}>
              <option value="">{catalogLoading ? "Loading services…" : `All · ${scopeLabels[eventScope].toLowerCase()}`}</option>
              {services.map((event) => (<option key={event.id} value={event.id}>
                  {event.name} · {manilaDate(event.service_date)}{event.service_state === "archived" ? " (Archived)" : event.service_state === "in-progress" ? " (In progress)" : ""}
                </option>))}
            </select>
          </label>
          <label className="records-filter-field records-member-search">
            <span>Member</span>
            <div className="records-search-input">
              <Search size={16}/>
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Name, member ID, email or mobile"/>
            </div>
          </label>
        </div>
        {moreOpen && (<div className="records-more-filters">
            <label className="records-filter-field">
              <span>Church</span>
              <select value={churchId} onChange={(event) => setChurchId(event.target.value)}>
                <option value="">All churches</option>
                {churches.map((item) => (<option key={item.id} value={item.id}>
                    {item.name}
                  </option>))}
              </select>
            </label>
            <label className="records-filter-field">
              <span>Ministry</span>
              <select value={ministryId} onChange={(event) => setMinistryId(event.target.value)}>
                <option value="">All ministries</option>
                {ministries.map((item) => (<option key={item.id} value={item.id}>
                    {item.name}
                  </option>))}
              </select>
            </label>
            <label className="records-filter-field">
              <span>Date range</span>
              <select value={dateRange} onChange={(event) => setDateRange(event.target.value as DateRange)}>
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {dateRange === "custom" && (<div className="records-custom-dates">
                <label className="records-filter-field"><span>From</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)}/></label>
                <label className="records-filter-field"><span>To</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}/></label>
              </div>)}
            <div className="records-scope-options">
            <label className="records-sunday-filter">
              <input type="checkbox" checked={sundayOnly} onChange={(event) => setSundayOnly(event.target.checked)}/>
              <span>Sunday services only</span>
            </label>
            </div>
          </div>)}
      </fieldset>

      {catalogError && <p className="rt-notice" role="alert">{catalogError}</p>}
      {message && <p className="rt-notice" role="status">{message}</p>}
      <div className="rt-table-top" ref={tableTop}>
        <div><h3>Attendance records</h3><p>Times in Manila · Member and service details use saved snapshots. Event Status reflects the current archive state.</p></div>
        <button type="button" className="rt-button" disabled={loading || exporting || removing} onClick={() => { setCatalogError(""); setAsOf(new Date().toISOString()); }}><RotateCcw size={15}/>Refresh</button>
      </div>
      <div className="rh-mobile-sort"><label>Sort by<select value={sort} disabled={busy || exporting || removing} onChange={e=>changeSort(e.target.value as Sort)}>{[{value:"check_in",label:"Check-in time"},{value:"member",label:"Member"},{value:"church",label:"Church"},{value:"ministry",label:"Ministry"},{value:"service",label:"Service"}].map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label><button className="rt-button" disabled={busy || exporting || removing} onClick={()=>setDescending(!descending)} aria-label={descending ? "Change to ascending order" : "Change to descending order"}><ArrowUpDown size={15}/>{descending ? "Descending" : "Ascending"}</button></div>
      {error ? <p className="rt-notice rt-error" role="alert">{error}</p> : busy ? <div className="rh-loading" role="status" aria-label="Loading attendance records"><span className="rh-sr-only">Loading attendance records…</span>{Array.from({length:6},(_,i) => <div className="rh-skeleton-row" key={i} aria-hidden="true">{Array.from({length:6},(_,j)=><span key={j} className="rh-skeleton"/>)}</div>)}</div> : !report.rows.length ? <div className="empty-state rh-empty"><FileSearch size={30}/><h3>No matching attendance</h3><p>Try adjusting filters or changing Event Status to include archived or in-progress services. Upcoming services are excluded.</p>{activeCount > 0 && <button className="rt-button" onClick={clearFilters}><RotateCcw size={15}/>Clear filters</button>}</div> : <div className="rt-scroll" tabIndex={0} role="region" aria-label="Attendance table, scroll horizontally for more columns"><table className="rt-table" role="table" aria-label="Attendance records"><thead role="rowgroup"><tr role="row">
        {([{ key: "member", label: "Member" }, { key: "church", label: "Church" }, { key: "ministry", label: "Ministries" }, { key: "service", label: "Service" }, { key: "check_in", label: "Check-in time" }] as {
            key: Sort;
            label: string;
        }[]).map(c => <th role="columnheader" key={c.key} scope="col" aria-sort={sort === c.key ? descending ? "descending" : "ascending" : "none"}><button disabled={exporting || removing} onClick={() => changeSort(c.key)}>{c.label}<span aria-hidden="true">{sort === c.key ? descending ? "↓" : "↑" : <ArrowUpDown size={13}/>}</span></button></th>)}
        <th role="columnheader" scope="col">Actions</th>
      </tr></thead><tbody role="rowgroup">{report.rows.map(r => <Fragment key={r.id}><tr className="rh-record-card" role="row">
        <td role="cell" data-label="Member"><button className="rt-member" onClick={() => setDetail(r)}><span className={`rt-dot ${r.member_status === "active" ? "is-active" : ""}`} title={`Saved member status: ${r.member_status}`} aria-label={`Saved member status: ${r.member_status}`}/><strong>{fullName(r)}</strong></button><small>{r.member_number}{r.snapshot_source === "backfilled_current_data" && <span className="rh-backfill" title="Historical values were not available; this record was backfilled from the profile at migration time."> · Backfilled</span>}</small></td>
        <td role="cell" data-label="Church">{r.churches.length ? names(r.churches) : <span className="rt-muted">Unassigned</span>}</td>
        <td role="cell" data-label="Ministries"><div className="rt-pills">{r.ministries.slice(0, 2).map(m => <span key={m.id}>{m.name}</span>)}{r.ministries.length > 2 && <button onClick={() => setDetail(r)} aria-label={`View all ${r.ministries.length} ministries for ${fullName(r)}`}>+{r.ministries.length - 2}</button>}{!r.ministries.length && <span className="rt-muted">None</span>}</div></td>
        <td role="cell" data-label="Service"><strong>{r.service_name}</strong><small>{manilaDate(r.service_date)} · {r.service_state.replace("-", " ")}</small></td>
        <td role="cell" data-label="Check-in time" className="rt-time">{stamp(r.checked_in_at)}</td>
        <td role="cell" data-label="Actions"><div className="rt-actions"><button className="rt-icon" title="View attendance details" aria-label={`View attendance for ${fullName(r)}`} onClick={() => setDetail(r)}><Eye size={17}/></button><button className="rt-icon rt-danger" title="Remove check-in" aria-label={`Remove check-in for ${fullName(r)}`} disabled={removing || exporting} aria-expanded={removeTarget?.id === r.id} aria-controls={removeTarget?.id === r.id ? `rt-remove-${r.id}` : undefined} onClick={() => { setMessage(""); setRemoveError(""); setRemoveTarget(removeTarget?.id === r.id ? null : r); }}><Trash2 size={16}/></button></div></td>
      </tr>
        {removeTarget?.id === r.id && <tr role="row" className="rt-inline-row"><td role="cell" colSpan={6}>
          <section id={`rt-remove-${r.id}`} className="rt-inline-confirm" aria-label="Confirm check-in removal" onKeyDown={e => { if (e.key === "Escape" && !removing)
                    setRemoveTarget(null); }}>
            <div><strong>Remove this check-in?</strong><p>This permanently removes <b>{fullName(r)}</b>’s attendance for <b>{r.service_name}</b>.</p>{removeError && <p className="rt-inline-error" role="alert">{removeError}</p>}</div>
            <div className="rt-inline-actions"><button autoFocus className="rt-button" disabled={removing} onClick={() => setRemoveTarget(null)}>Cancel</button><button className="rt-button rt-danger" disabled={removing} onClick={() => void removeCheckIn()}><Trash2 size={15}/>{removing ? "Removing…" : "Remove check-in"}</button></div>
          </section>
        </td></tr>}
      </Fragment>)}</tbody></table></div>}
      <div className="rt-pagination"><label>Rows per page <select disabled={exporting || removing} value={size} onChange={e => setSize(Number(e.target.value))}>{[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select></label><span aria-live="polite">{busy ? "Updating…" : report.total ? `${page * size + 1}–${Math.min((page + 1) * size, report.total)} of ${report.total.toLocaleString()}` : "0 records"}</span><nav aria-label="Attendance pages">{[{ label: "First page", index: 0, Icon: ChevronsLeft, disabled: page === 0 }, { label: "Previous page", index: page - 1, Icon: ChevronLeft, disabled: page === 0 }].map(({ label, index, Icon, disabled }) => <button key={label} className="rt-icon" aria-label={label} disabled={exporting || busy || removing || !!error || disabled} onClick={() => goPage(index)}><Icon size={17}/></button>)}<span>Page {page + 1} of {pages}</span>{[{ label: "Next page", index: page + 1, Icon: ChevronRight }, { label: "Last page", index: pages - 1, Icon: ChevronsRight }].map(({ label, index, Icon }) => <button key={label} className="rt-icon" aria-label={label} disabled={exporting || busy || removing || !!error || page >= pages - 1} onClick={() => goPage(index)}><Icon size={17}/></button>)}</nav></div>
      {detail && <ReportDialog label="rt-detail-heading" onClose={() => setDetail(null)}><div className="rt-dialog-body"><button autoFocus className="rt-icon rt-close" aria-label="Close details" onClick={() => setDetail(null)}><X size={19}/></button><p className="records-section-kicker">Attendance details</p><h2 id="rt-detail-heading">{fullName(detail)}</h2><p>{detail.member_number} · {detail.member_status} member</p><dl>{[["Service", detail.service_name], ["Service start", stamp(detail.service_date)], ["Service state", detail.service_state], ["Check-in", `${stamp(detail.checked_in_at)} (Manila)`], ["Attendance status", detail.attendance_status], ["Churches (saved)", names(detail.churches) || "Unassigned"], ["Ministries (saved)", names(detail.ministries) || "None"], ["Email", detail.email || "Not provided"], ["Mobile", detail.mobile || "Not provided"], ["Member group", detail.member_group || "None"], ["Snapshot", detail.snapshot_source === "captured_at_check_in" ? "Captured at check-in" : "Backfilled from current data"], ["Snapshot saved", stamp(detail.snapshot_captured_at)], ["Attendance ID", detail.id]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></ReportDialog>}

    </section>);
}
