import { type ChangeEvent, useState } from 'react'
import Papa from 'papaparse'
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type ImportRow = {
  rowNumber: number
  firstName: string
  lastName: string
  email: string
  mobile: string
  ministryNames: string[]
  adminNote: string
  error: string
}

type Ministry = {
  id: string
  name: string
}

type Props = {
  onImported: () => Promise<void>
  onClose: () => void
}

function getValue(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const key = Object.keys(row).find(
      (column) => column.trim().toLowerCase() === name,
    )

    if (key) return row[key]?.trim() ?? ''
  }

  return ''
}

function normaliseMobile(value: string) {
  return value.replace(/\D/g, '')
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.com$/i.test(value)
}

function parseMinistries(value: string) {
  return [...new Set(
    value
      .split(/[|;,]/)
      .map((name) => name.trim())
      .filter(Boolean),
  )]
}

function downloadTemplate() {
  const template = [
    'first_name,last_name,email,mobile,ministries,admin_note',
    'Juan,Dela Cruz,juan@example.com,09171234567,Youth|Worship Team,"New attendee; follow up next month"',
    'Maria,Santos,maria@example.com,09181234567,Adults,"Prefers an afternoon service"',
  ].join('\n')

  const blob = new Blob(['\uFEFF', template], {
    type: 'text/csv;charset=utf-8',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'lifecity-member-import-template.csv'
  link.click()

  URL.revokeObjectURL(url)
}

export default function MemberImport({ onImported, onClose }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [message, setMessage] = useState('')
  const [importing, setImporting] = useState(false)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    setMessage('')
    setFileName(file.name)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const parsedRows = results.data.map((row, index) => {
          const firstName = getValue(row, [
            'first_name',
            'first name',
            'firstname',
          ])
          const lastName = getValue(row, [
            'last_name',
            'last name',
            'lastname',
          ])
          const email = getValue(row, ['email'])
          const mobile = getValue(row, [
            'mobile',
            'phone',
            'mobile_number',
          ])
          const ministries = getValue(row, [
            'ministries',
            'ministry',
            'group',
            'member_group',
          ])
          const adminNote = getValue(row, [
            'admin_note',
            'admin note',
            'note',
          ])
          let error = ''

          if (!firstName || !lastName) {
            error = 'First name and last name are required.'
          } else if (email && !isValidEmail(email)) {
            error = 'Email must include @ and end in .com.'
          } else if (mobile && !/^09\d{9}$/.test(mobile)) {
            error = 'Mobile must be 11 digits and start with 09.'
          }

          return {
            rowNumber: index + 2,
            firstName,
            lastName,
            email,
            mobile,
            ministryNames: parseMinistries(ministries),
            adminNote,
            error,
          }
        })

        setRows(parsedRows)
      },
      error: () => {
        setMessage('The CSV file could not be read.')
      },
    })
  }

  async function handleImport() {
    const validRows = rows.filter((row) => !row.error)

    if (validRows.length === 0) {
      setMessage('There are no valid rows to import.')
      return
    }

    setImporting(true)
    setMessage('')

    const { data: existingMembers, error: existingError } = await supabase
      .from('members')
      .select('email, mobile')

    if (existingError) {
      setMessage(existingError.message)
      setImporting(false)
      return
    }

    const existingEmails = new Set(
      (existingMembers ?? [])
        .map((member) => member.email?.trim().toLowerCase())
        .filter(Boolean),
    )

    const existingMobiles = new Set(
      (existingMembers ?? [])
        .map((member) => normaliseMobile(member.mobile ?? ''))
        .filter(Boolean),
    )

    const uploadedEmails = new Set<string>()
    const uploadedMobiles = new Set<string>()
    const rowsToImport: ImportRow[] = []
    let skippedCount = rows.length - validRows.length

    validRows.forEach((row) => {
      const email = row.email.trim().toLowerCase()
      const mobile = normaliseMobile(row.mobile)

      const duplicateEmail =
        Boolean(email) &&
        (existingEmails.has(email) || uploadedEmails.has(email))

      const duplicateMobile =
        Boolean(mobile) &&
        (existingMobiles.has(mobile) || uploadedMobiles.has(mobile))

      if (duplicateEmail || duplicateMobile) {
        skippedCount += 1
        return
      }

      if (email) uploadedEmails.add(email)
      if (mobile) uploadedMobiles.add(mobile)

      rowsToImport.push(row)
    })

    if (rowsToImport.length === 0) {
      setMessage(
        `No new members were imported. ${skippedCount} row(s) were skipped because they were invalid or duplicates.`,
      )
      setImporting(false)
      return
    }

    const { data: createdMembers, error: insertError } = await supabase
      .from('members')
      .insert(
        rowsToImport.map((row) => ({
          member_number: `M-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email.trim().toLowerCase() || null,
          mobile: row.mobile.trim() || null,
          admin_note: row.adminNote.trim() || null,
        })),
      )
      .select('id')

    if (insertError || !createdMembers) {
      setMessage(insertError?.message ?? 'Members could not be imported.')
      setImporting(false)
      return
    }

    const allMinistryNames = [
      ...new Set(
        rowsToImport.flatMap((row) => row.ministryNames.map((name) => name)),
      ),
    ]

    if (allMinistryNames.length > 0) {
      const { data: currentMinistries, error: ministryLoadError } = await supabase
        .from('ministries')
        .select('id, name')

      if (ministryLoadError) {
        setMessage(ministryLoadError.message)
        setImporting(false)
        return
      }

      const ministryMap = new Map(
        ((currentMinistries ?? []) as Ministry[]).map((ministry) => [
          ministry.name.toLowerCase(),
          ministry,
        ]),
      )

      const newMinistryNames = allMinistryNames.filter(
        (name) => !ministryMap.has(name.toLowerCase()),
      )

      if (newMinistryNames.length > 0) {
        const { data: addedMinistries, error: ministryInsertError } =
          await supabase
            .from('ministries')
            .insert(newMinistryNames.map((name) => ({ name })))
            .select('id, name')

        if (ministryInsertError) {
          setMessage(ministryInsertError.message)
          setImporting(false)
          return
        }

        ;((addedMinistries ?? []) as Ministry[]).forEach((ministry) => {
          ministryMap.set(ministry.name.toLowerCase(), ministry)
        })
      }

      const ministryLinks = rowsToImport.flatMap((row, index) =>
        row.ministryNames
          .map((name) => ministryMap.get(name.toLowerCase()))
          .filter((ministry): ministry is Ministry => Boolean(ministry))
          .map((ministry) => ({
            member_id: createdMembers[index].id,
            ministry_id: ministry.id,
          })),
      )

      if (ministryLinks.length > 0) {
        const { error: linksError } = await supabase
          .from('member_ministries')
          .insert(ministryLinks)

        if (linksError) {
          setMessage(linksError.message)
          setImporting(false)
          return
        }
      }
    }

    await onImported()

    setMessage(
      `${rowsToImport.length} member(s) imported successfully. ${skippedCount} row(s) skipped.`,
    )
    setImporting(false)
  }

  const validCount = rows.filter((row) => !row.error).length
  const invalidCount = rows.filter((row) => row.error).length

  return (
    <section className="csv-import-card">
      <div className="csv-import-intro">
        <div className="csv-import-icon">
          <FileSpreadsheet size={26} />
        </div>

        <div>
          <p className="eyebrow">Bulk registration</p>
          <h2>Import members from CSV</h2>
          <p className="muted">
            Download the template, add member details and ministries, then
            upload it here.
          </p>
        </div>

        <button
          className="secondary-button template-button"
          onClick={downloadTemplate}
        >
          <Download size={18} />
          Download template
        </button>
      </div>

      <div className="csv-import-steps">
        <span>
          <strong>1</strong>
          Download template
        </span>
        <span>
          <strong>2</strong>
          Add member details
        </span>
        <span>
          <strong>3</strong>
          Upload and review
        </span>
      </div>

      <label className="csv-upload-zone">
        <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        <Upload size={28} />
        <strong>{fileName || 'Choose a CSV file'}</strong>
        <span>
          Required: first_name and last_name · Optional: email, mobile,
          ministries, admin_note
        </span>
      </label>

      {rows.length > 0 && (
        <>
          <div className="csv-summary">
            <span>{rows.length} row(s) found</span>
            <span className="valid-count">{validCount} valid</span>

            {invalidCount > 0 && (
              <span className="invalid-count">
                {invalidCount} need attention
              </span>
            )}
          </div>

          <div className="csv-preview">
            <div className="csv-preview-heading">
              <span>Row</span>
              <span>Member</span>
              <span>Ministries</span>
              <span>Status</span>
            </div>

            {rows.slice(0, 8).map((row) => (
              <article
                className={`csv-preview-row ${row.error ? 'has-error' : ''}`}
                key={row.rowNumber}
              >
                <span>#{row.rowNumber}</span>
                <strong>
                  {row.firstName || 'Missing first name'}{' '}
                  {row.lastName || 'Missing last name'}
                </strong>
                <span>{row.ministryNames.join(', ') || '—'}</span>

                <span className={row.error ? 'csv-error' : 'csv-valid'}>
                  {row.error || (
                    <>
                      <CheckCircle2 size={15} />
                      Ready
                    </>
                  )}
                </span>
              </article>
            ))}
          </div>

          {rows.length > 8 && (
            <p className="csv-more-rows">
              Showing the first 8 of {rows.length} rows.
            </p>
          )}

          <div className="csv-import-footer">
            <p>Duplicate email addresses or mobile numbers are skipped.</p>

            <button
              className="primary-button"
              onClick={handleImport}
              disabled={importing || validCount === 0}
            >
              <Upload size={18} />
              {importing
                ? 'Importing…'
                : `Import ${validCount} valid member(s)`}
            </button>
          </div>
        </>
      )}

      {message && <p className="csv-message">{message}</p>}

      <button className="text-button csv-close-button" onClick={onClose}>
        Close import
      </button>
    </section>
  )
}
