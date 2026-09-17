// Change ID: records-filter-system-phase-3-v2
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { supabase } from "../lib/supabase";

type NamedItem = { id: string; name: string };
type AttendanceEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  archived_at: string | null;
};
type AttendanceRecord = {
  id: string;
  checked_in_at: string;
  status: string;
  members: {
    id: string;
    first_name: string;
    last_name: string;
    member_number: string;
    member_group: string | null;
    member_ministries: { ministries: NamedItem | null }[] | null;
    member_branches: { branches: NamedItem | null }[] | null;
  } | null;
  events: AttendanceEvent | null;
};
type DateRange = "all" | "today" | "week" | "month" | "custom";
type EventStatus = "all" | "active" | "completed" | "archived";
type Props = { events: AttendanceEvent[] };

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const manilaDate = (value: string | Date) =>
  dateFormatter.format(new Date(value));
const csvValue = (value: string) => `"${value.replaceAll('"', '""')}"`;
function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return manilaDate(date);
}
function eventState(event: AttendanceEvent | null) {
  if (!event || !event.archived_at) {
    const end = event?.ends_at
      ? new Date(event.ends_at).getTime()
      : new Date(event?.starts_at ?? Date.now()).getTime() + 10800000;
    return Date.now() > end ? "completed" : "active";
  }
  return "archived";
}
const churchesFor = (member: AttendanceRecord["members"]) =>
  (member?.member_branches ?? [])
    .map((item) => item.branches)
    .filter((item): item is NamedItem => Boolean(item));
const ministriesFor = (member: AttendanceRecord["members"]) =>
  (member?.member_ministries ?? [])
    .map((item) => item.ministries)
    .filter((item): item is NamedItem => Boolean(item));

export default function AttendanceRecords({ events }: Props) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [eventId, setEventId] = useState("");
  const [churchId, setChurchId] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [serviceStatus, setServiceStatus] = useState<EventStatus>("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AttendanceRecord | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRecords() {
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance")
      .select(
        `id, checked_in_at, status, members ( id, first_name, last_name, member_number, member_group, member_ministries ( ministries ( id, name ) ), member_branches ( branches ( id, name ) ) ), events ( id, name, starts_at, ends_at, archived_at )`,
      )
      .order("checked_in_at", { ascending: false });
    if (error) setMessage(error.message);
    else setRecords((data ?? []) as unknown as AttendanceRecord[]);
    setLoading(false);
  }
  useEffect(() => {
    void loadRecords();
  }, []);

  const churches = useMemo(
    () =>
      [
        ...new Map(
          records
            .flatMap((record) => churchesFor(record.members))
            .map((item) => [item.id, item]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [records],
  );
  const ministries = useMemo(
    () =>
      [
        ...new Map(
          records
            .flatMap((record) => ministriesFor(record.members))
            .map((item) => [item.id, item]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [records],
  );
  const range = useMemo(() => {
    const today = manilaDate(new Date());
    if (dateRange === "today") return [today, today];
    if (dateRange === "week") return [shiftDate(today, -6), today];
    if (dateRange === "month") return [shiftDate(today, -29), today];
    return dateRange === "custom" ? [customStart, customEnd] : ["", ""];
  }, [dateRange, customStart, customEnd]);
  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const member = record.members;
        const search =
          `${member?.first_name ?? ""} ${member?.last_name ?? ""} ${member?.member_number ?? ""}`.toLowerCase();
        const date = manilaDate(record.checked_in_at);
        return (
          (!eventId || record.events?.id === eventId) &&
          (!range[0] || date >= range[0]) &&
          (!range[1] || date <= range[1]) &&
          (!churchId ||
            churchesFor(member).some((item) => item.id === churchId)) &&
          (!ministryId ||
            ministriesFor(member).some((item) => item.id === ministryId)) &&
          (!memberQuery.trim() ||
            search.includes(memberQuery.toLowerCase().trim())) &&
          (serviceStatus === "all" ||
            eventState(record.events) === serviceStatus)
        );
      }),
    [
      records,
      eventId,
      range,
      churchId,
      ministryId,
      memberQuery,
      serviceStatus,
    ],
  );
  const summary = useMemo(
    () => ({
      checkIns: filtered.length,
      members: new Set(
        filtered.map((record) => record.members?.id ?? record.id),
      ).size,
      services: new Set(
        filtered.map((record) => record.events?.id).filter(Boolean),
      ).size,
    }),
    [filtered],
  );
  const activeCount = [
    dateRange !== "all",
    eventId,
    churchId,
    ministryId,
    memberQuery.trim(),
    serviceStatus !== "all",
  ].filter(Boolean).length;
  function clearFilters() {
    setDateRange("all");
    setCustomStart("");
    setCustomEnd("");
    setEventId("");
    setChurchId("");
    setMinistryId("");
    setMemberQuery("");
    setServiceStatus("all");
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
    serviceStatus !== "all" && { label: `Service: ${serviceStatus}`, clear: () => setServiceStatus("all") },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;
  function exportCsv() {
    const rows = [
      [
        "attendance_id",
        "event_name",
        "event_date",
        "event_status",
        "member_id",
        "member_name",
        "churches",
        "ministries",
        "attendance_status",
        "check_in_time",
      ],
      ...filtered.map((record) => [
        record.id,
        record.events?.name ?? "",
        record.events ? manilaDate(record.events.starts_at) : "",
        eventState(record.events),
        record.members?.member_number ?? "",
        record.members
          ? `${record.members.first_name} ${record.members.last_name}`
          : "",
        churchesFor(record.members)
          .map((item) => item.name)
          .join(" | "),
        ministriesFor(record.members)
          .map((item) => item.name)
          .join(" | "),
        record.status,
        new Date(record.checked_in_at).toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
        }),
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF", rows.map((row) => row.map(csvValue).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lifecity-attendance-${dateRange === "all" ? "all-records" : dateRange}-records.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function removeCheckIn() {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("id", removeTarget.id);
    if (error) setMessage(error.message);
    else {
      setRemoveTarget(null);
      await loadRecords();
    }
    setRemoving(false);
  }
  return (
    <section className="records-card">
      <div className="records-toolbar">
        <div>
          <p className="records-section-kicker">Attendance ledger</p>
          <h2>Your check-in history</h2>
          <p>
            Review saved attendance and prepare a report when you are ready.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={exportCsv}
          disabled={!filtered.length}
        >
          <Download size={18} />
          Export CSV
        </button>
      </div>
      <div className="records-summary-shelf">
        <div className="records-summary-item">
          <span className="records-summary-icon mint">
            <ScanLine size={17} />
          </span>
          <div>
            <strong>{summary.checkIns}</strong>
            <span>Check-ins shown</span>
          </div>
        </div>
        <div className="records-summary-item">
          <span className="records-summary-icon violet">
            <UsersRound size={17} />
          </span>
          <div>
            <strong>{summary.members}</strong>
            <span>Unique members</span>
          </div>
        </div>
        <div className="records-summary-item">
          <span className="records-summary-icon gold">
            <CalendarDays size={17} />
          </span>
          <div>
            <strong>{summary.services}</strong>
            <span>Services included</span>
          </div>
        </div>
      </div>
      <section className="records-filter-panel">
        <div className="records-filter-panel-heading">
          <div>
            <p className="records-filter-kicker">Find the right records</p>
            <h3>Filters</h3>
          </div>
          <div className="records-filter-panel-actions">
            <span className="records-result-count">
              {filtered.length} record{filtered.length === 1 ? "" : "s"} shown
            </span>
            {activeCount > 0 && <span className="records-filter-count">{activeCount} active</span>}
            {activeCount > 0 && <button type="button" className="records-clear-filters" onClick={clearFilters}><RotateCcw size={15} />Clear all</button>}
            <button
              type="button"
              className="records-more-filter-button"
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
              <button key={chip.label} type="button" className="records-filter-chip" onClick={chip.clear} title={`Remove ${chip.label} filter`}>
                {chip.label}<X size={13} />
              </button>
            ))}
          </div>
        )}
        <div className="records-primary-filters">
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
          <label className="records-filter-field">
            <span>Service</span>
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            >
              <option value="">All services</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
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
                placeholder="Name or member ID"
              />
            </div>
          </label>
          {dateRange === "custom" && (
            <div className="records-custom-dates">
              <label className="records-filter-field"><span>From</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
              <label className="records-filter-field"><span>To</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
            </div>
          )}
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
              <span>Service status</span>
              <select
                value={serviceStatus}
                onChange={(event) =>
                  setServiceStatus(event.target.value as EventStatus)
                }
              >
                <option value="all">Any status</option>
                <option value="active">Active / upcoming</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
        )}
      </section>
      {loading ? (
        <p className="empty-state">Loading records…</p>
      ) : !filtered.length ? (
        <div className="empty-state">
          <FileSearch size={30} />
          <h3>No attendance records found</h3>
          <p>
            Try clearing a filter, or scan a member QR code to create the first
            attendance record.
          </p>
        </div>
      ) : (
        <div className="records-list">
          {filtered.map((record) => (
            <article className="record-row" key={record.id}>
              <div className="record-time">
                <strong>
                  {new Date(record.checked_in_at).toLocaleTimeString("en-PH", {
                    timeZone: "Asia/Manila",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </strong>
                <span>
                  {new Date(record.checked_in_at).toLocaleDateString("en-PH", {
                    timeZone: "Asia/Manila",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="member-name">
                <strong>
                  {record.members
                    ? `${record.members.first_name} ${record.members.last_name}`
                    : "Unknown member"}
                </strong>
                <span>
                  {record.members?.member_number ?? "No member number"}
                  {record.members?.member_group
                    ? ` · ${record.members.member_group}`
                    : ""}
                </span>
              </div>
              <span className="record-event">
                {record.events?.name ?? "Unknown event"}
              </span>
              <span className="status active">{record.status}</span>
              <button
                className="record-remove-button"
                type="button"
                onClick={() => {
                  setMessage("");
                  setRemoveTarget(record);
                }}
              >
                <Trash2 size={18} />
              </button>
            </article>
          ))}
        </div>
      )}
      {removeTarget && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !removing && setRemoveTarget(null)}
        >
          <section
            className="confirmation-modal attendance-remove-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              type="button"
              onClick={() => setRemoveTarget(null)}
            >
              <X size={20} />
            </button>
            <p className="eyebrow">Attendance correction</p>
            <h2>Remove this check-in?</h2>
            <p className="muted">
              This will remove{" "}
              {removeTarget.members
                ? `${removeTarget.members.first_name} ${removeTarget.members.last_name}`
                : "this member"}
              ’s check-in for {removeTarget.events?.name ?? "this event"}.
            </p>
            {message && <p className="error-message">{message}</p>}
            <div className="confirmation-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={removing}
                onClick={() => void removeCheckIn()}
              >
                <Trash2 size={18} />
                {removing ? "Removing…" : "Remove check-in"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
