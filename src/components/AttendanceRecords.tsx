import { useEffect, useMemo, useState } from 'react'
import { Download, FileSearch } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AttendanceEvent = {
  id: string
  name: string
  starts_at: string
}

type AttendanceRecord = {
  id: string
  checked_in_at: string
  status: string
  members: {
    first_name: string
    last_name: string
    member_number: string
    member_group: string | null
  } | null
  events: {
    id: string
    name: string
    starts_at: string
  } | null
}

type Props = {
  events: AttendanceEvent[]
}

function csvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export default function AttendanceRecords({ events }: Props) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    void loadRecords()
  }, [])

  async function loadRecords() {
    setLoading(true)

    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        checked_in_at,
        status,
        members (
          first_name,
          last_name,
          member_number,
          member_group
        ),
        events (
          id,
          name,
          starts_at
        )
      `)
      .order('checked_in_at', { ascending: false })

    if (!error) {
      setRecords((data ?? []) as unknown as AttendanceRecord[])
    }

    setLoading(false)
  }

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesEvent =
        !eventId || record.events?.id === eventId

      const checkedInDate = new Date(record.checked_in_at)
        .toLocaleDateString('en-CA', {
          timeZone: 'Asia/Manila',
        })

      const matchesDate = !date || checkedInDate === date

      return matchesEvent && matchesDate
    })
  }, [records, eventId, date])

  function exportCsv() {
    const rows = [
      [
        'attendance_id',
        'event_name',
        'event_date',
        'member_id',
        'member_name',
        'group',
        'status',
        'check_in_time',
      ],
      ...filteredRecords.map((record) => [
        record.id,
        record.events?.name ?? '',
        record.events
          ? new Date(record.events.starts_at).toLocaleDateString('en-CA', {
              timeZone: 'Asia/Manila',
            })
          : '',
        record.members?.member_number ?? '',
        record.members
          ? `${record.members.first_name} ${record.members.last_name}`
          : '',
        record.members?.member_group ?? '',
        record.status,
        new Date(record.checked_in_at).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
        }),
      ]),
    ]

    const csv = rows
      .map((row) => row.map((value) => csvValue(value)).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF', csv], {
      type: 'text/csv;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `lifecity-attendance-${date || 'all-records'}.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <section className="records-card">
      <div className="records-toolbar">
        <div>
          <h2>Attendance records</h2>
          <p>{filteredRecords.length} check-in(s) shown</p>
        </div>

        <button
          className="primary-button"
          onClick={exportCsv}
          disabled={filteredRecords.length === 0}
        >
          <Download size={18} />
          Export CSV
        </button>
      </div>

      <div className="record-filters">
        <label>
          Event
          <select
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="">All events</option>

            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Check-in date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

        {(eventId || date) && (
          <button
            className="secondary-button clear-filter-button"
            onClick={() => {
              setEventId('')
              setDate('')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="empty-state">Loading records…</p>
      ) : filteredRecords.length === 0 ? (
        <div className="empty-state">
          <FileSearch size={30} />
          <h3>No attendance records found</h3>
          <p>Scan a member QR code to create the first attendance record.</p>
        </div>
      ) : (
        <div className="records-list">
          {filteredRecords.map((record) => (
            <article className="record-row" key={record.id}>
              <div className="record-time">
                <strong>
                  {new Date(record.checked_in_at).toLocaleTimeString('en-PH', {
                    timeZone: 'Asia/Manila',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </strong>

                <span>
                  {new Date(record.checked_in_at).toLocaleDateString('en-PH', {
                    timeZone: 'Asia/Manila',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              <div className="member-name">
                <strong>
                  {record.members
                    ? `${record.members.first_name} ${record.members.last_name}`
                    : 'Unknown member'}
                </strong>

                <span>
                  {record.members?.member_number ?? 'No member number'}
                  {record.members?.member_group
                    ? ` · ${record.members.member_group}`
                    : ''}
                </span>
              </div>

              <span className="record-event">
                {record.events?.name ?? 'Unknown event'}
              </span>

              <span className="status active">{record.status}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}