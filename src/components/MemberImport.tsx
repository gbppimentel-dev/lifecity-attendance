// Change ID: LC-P08K-v1
// Change ID: LC-P08J-v1
// Change ID: LC-P08G-v1
// Change ID: LC-UI-COPY-v2
import { uiMessage } from '../lib/uiText'
import { type ChangeEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { csvCell } from '../lib/memberCsv'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Save,
  Trash2,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type ImportRow = {
  rowNumber: number
  firstName: string
  lastName: string
  email: string
  mobile: string
  ministryNames: string[]
  branchNames: string[]
  adminNote: string
  error: string
  errorCount: number
  errors: string[]
  duplicateNameReason: string
  nameDuplicateOverride: boolean
}

type ExistingContact = {
  email: string | null
  mobile: string | null
  first_name: string | null
  last_name: string | null
}

type ImportFilter = 'all' | 'errors' | 'ready'

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
  const digits = value.replace(/\D/g, '')

  if (/^09\d{9}$/.test(digits)) return digits
  if (/^9\d{9}$/.test(digits)) return `0${digits}`
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`

  return digits
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.com$/i.test(value)
}

function parseAssignments(value: string) {
  return [...new Set(
    value
      .split(/[|;,]/)
      .map((name) => name.trim())
      .filter(Boolean),
  )]
}

function normaliseFullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function validateRows(rows: ImportRow[], existingContacts: ExistingContact[]) {
  const emailCounts = new Map<string, number>()
  const mobileCounts = new Map<string, number>()
  const nameCounts = new Map<string, number>()

  rows.forEach((row) => {
    const email = row.email.trim().toLowerCase()
    const mobile = normaliseMobile(row.mobile)
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1)
    if (mobile) mobileCounts.set(mobile, (mobileCounts.get(mobile) ?? 0) + 1)
    const fullName = normaliseFullName(row.firstName, row.lastName)
    if (row.firstName.trim() && row.lastName.trim()) nameCounts.set(fullName, (nameCounts.get(fullName) ?? 0) + 1)
  })

  const existingEmails = new Set(
    existingContacts
      .map((member) => member.email?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  )
  const existingMobiles = new Set(
    existingContacts
      .map((member) => normaliseMobile(member.mobile ?? ''))
      .filter(Boolean),
  )
  const existingNames = new Set(
    existingContacts
      .filter((member) => Boolean(member.first_name?.trim() && member.last_name?.trim()))
      .map((member) => normaliseFullName(member.first_name ?? '', member.last_name ?? '')),
  )

  return rows.map((row) => {
    const email = row.email.trim().toLowerCase()
    const mobile = normaliseMobile(row.mobile)
    const fullName = normaliseFullName(row.firstName, row.lastName)
    const errors: string[] = []

    if (!row.firstName.trim() || !row.lastName.trim()) errors.push('First name and last name are required.')
    if (email && !isValidEmail(email)) errors.push('Email must include @ and end in .com.')
    if (mobile && !/^09\d{9}$/.test(mobile)) errors.push('Mobile must be 11 digits and start with 09.')
    if (row.branchNames.length === 0) errors.push('Church is required. Use LifeCity - Main when unsure.')
    if (email && existingEmails.has(email)) errors.push('This email is already assigned to an existing member.')
    if (mobile && existingMobiles.has(mobile)) errors.push('This mobile number is already assigned to an existing member.')
    if (email && (emailCounts.get(email) ?? 0) > 1) errors.push('This email appears more than once in this import.')
    if (mobile && (mobileCounts.get(mobile) ?? 0) > 1) errors.push('This mobile number appears more than once in this import.')

    let duplicateNameReason = ''
    if (row.firstName.trim() && row.lastName.trim() && existingNames.has(fullName)) {
      duplicateNameReason = 'This full name matches a member already in the directory.'
    } else if (row.firstName.trim() && row.lastName.trim() && (nameCounts.get(fullName) ?? 0) > 1) {
      duplicateNameReason = 'This full name appears more than once in this import.'
    }

    return {
      ...row,
      email,
      mobile,
      error: errors[0] ?? '',
      errorCount: errors.length,
      errors,
      duplicateNameReason,
      nameDuplicateOverride: duplicateNameReason ? row.nameDuplicateOverride : false,
    }
  })
}

function memberName(row: Pick<ImportRow, 'firstName' | 'lastName'>) {
  return `${row.firstName.trim()} ${row.lastName.trim()}`.trim() || 'This Member'
}

function fieldNeedsAttention(row: ImportRow, field: 'name' | 'email' | 'mobile' | 'branch') {
  const errors = row.errors ?? []
  const checks = {
    name: ['First Name and Last Name'],
    email: ['Email Must', 'Email is Already', 'Email Appears'],
    mobile: ['Mobile Must', 'Mobile Number is Already', 'Mobile Number Appears'],
    branch: ['Church is Required'],
  }
  return errors.some((error) => checks[field].some((check) => error.toLowerCase().includes(check.toLowerCase())))
}

function downloadTemplate() {
  const template = [
    'first_name,last_name,email,mobile,churches,ministries,admin_note',
    'Juan,Dela Cruz,,,LifeCity - Main,,',
    'Maria,Santos,,,LifeCity - Main,,',
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

// Uses the same member columns as the import template. Review-only columns
// are intentionally ignored by the existing importer on a corrected upload.
export function importReviewCsv(rows: ImportRow[]) {
  const header=['first_name','last_name','email','mobile','churches','ministries','admin_note','original_row','review_issues']
  const lines=[header,...rows.map(row=>[
    row.firstName,row.lastName,row.email,row.mobile,row.branchNames.join(' | '),row.ministryNames.join(' | '),row.adminNote,String(row.rowNumber),
    [...row.errors,...(row.duplicateNameReason && !row.nameDuplicateOverride ? [row.duplicateNameReason] : [])].join(' '),
  ])]
  return '\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}

export function matchesImportReview(row: ImportRow, filter: ImportFilter, search: string) {
  const needsReview = Boolean(row.error) || Boolean(row.duplicateNameReason && !row.nameDuplicateOverride)
  if (filter === 'errors' && !needsReview) return false
  if (filter === 'ready' && needsReview) return false
  const query = search.trim().toLowerCase()
  if (!query) return true
  return [row.firstName + ' ' + row.lastName, row.email, row.mobile, String(row.rowNumber)]
    .some(value => value.toLowerCase().includes(query))
}

export default function MemberImport({ onImported, onClose }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [existingContacts, setExistingContacts] = useState<ExistingContact[]>([])
  const [contactsChecked,setContactsChecked]=useState(false)
  const [recoveryRows,setRecoveryRows]=useState<ImportRow[]>([])
  const [pendingImport,setPendingImport]=useState<{id:string;rows:ImportRow[];skipped:number;skippedRows:ImportRow[]}|null>(null)
  const alive=useRef(true)
  const validationSequence=useRef(0)
  const importLock=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;validationSequence.current++}},[])

  const [fileName, setFileName] = useState('')
  const [message, setMessage] = useState('')
  const [importing, setImporting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [filter, setFilter] = useState<ImportFilter>('all')
  const [reviewSearch, setReviewSearch] = useState('')
  const [errorsFirst, setErrorsFirst] = useState(true)
  const [page, setPage] = useState(1)
  const [editingRowNumber, setEditingRowNumber] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<ImportRow | null>(null)
  const [branchText, setBranchText] = useState('')
  const [ministryText, setMinistryText] = useState('')
  const [editorFeedback, setEditorFeedback] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [importSuccess, setImportSuccess] = useState<{ imported: number; skipped: number } | null>(null)
  const reviewToolbarRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if(importLock.current || pendingImport)return
    const file = event.target.files?.[0]
    if (!file) return
    const sequence=++validationSequence.current
    setRows([]);setExistingContacts([]);setContactsChecked(false);setValidating(true)

    setMessage('')
    setImportSuccess(null)
    setRecoveryRows([])
    setReviewSearch('');setFilter('all')
    setFileName(file.name)
    setPage(1)
    setEditingRowNumber(null)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if(!alive.current || sequence!==validationSequence.current)return
        if(results.errors.length){setMessage('The CSV has a formatting problem. Check the column headings, commas, and quoted values, then upload it again.');setValidating(false);return}
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
          const branches = getValue(row, ['churches', 'church', 'branches', 'branch'])
          const adminNote = getValue(row, [
            'admin_note',
            'admin note',
            'note',
          ])
          return {
            rowNumber: index + 2,
            firstName,
            lastName,
            email,
            mobile: normaliseMobile(mobile),
            ministryNames: parseAssignments(ministries),
            branchNames: parseAssignments(branches),
            adminNote,
            error: '',
            errorCount: 0,
            errors: [],
            duplicateNameReason: '',
            nameDuplicateOverride: false,
          }
        })
        void loadExistingContactsAndValidate(parsedRows,sequence)
      },
      error: () => {
        if(!alive.current || sequence!==validationSequence.current)return
        setValidating(false)
        setMessage('The CSV file could not be read.')
      },
    })
  }

  async function readImportContacts() {
    const {data,error}=await supabase.rpc('lc_import_contacts')
    if(error)throw error
    if(!data || !Array.isArray(data.rows))throw new Error('Invalid contact response')
    return data.rows as ExistingContact[]
  }

  async function loadExistingContactsAndValidate(candidateRows: ImportRow[], sequence=++validationSequence.current) {
    setValidating(true);setContactsChecked(false);setMessage('')
    try {
      const contacts=await readImportContacts()
      if(!alive.current || sequence!==validationSequence.current)return
      setExistingContacts(contacts)
      setRows(validateRows(candidateRows,contacts))
      setContactsChecked(true)
    } catch {
      if(alive.current && sequence===validationSequence.current){
        setRows(validateRows(candidateRows,[]))
        setMessage('Could not check the existing directory. Retry validation before importing.')
      }
    } finally {if(alive.current && sequence===validationSequence.current)setValidating(false)}
  }

  function saveInlineEdit() {
    if (!editDraft || importLock.current || validating || pendingImport) return

    const nextRows = rows.map((row) =>
      row.rowNumber === editDraft.rowNumber
        ? {
            ...editDraft,
            ministryNames: parseAssignments(ministryText),
            branchNames: parseAssignments(branchText),
          }
        : row,
    )

    const validatedRows = validateRows(nextRows, existingContacts)
    const validatedRow = validatedRows.find((row) => row.rowNumber === editDraft.rowNumber)
    setRows(validatedRows)

    if (validatedRow?.errorCount) {
      setEditDraft(validatedRow)
      setEditorFeedback(`${validatedRow.errorCount} issue${validatedRow.errorCount === 1 ? '' : 's'} still need attention. ${validatedRow.error}`)
      return
    }

    setReviewNotice(`${memberName(editDraft)} is ready to import.`)
    setEditingRowNumber(null)
    setEditDraft(null)
    setEditorFeedback('')
    window.setTimeout(() => reviewToolbarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  function openInlineEditor(row: ImportRow) {
    if(importLock.current || validating || pendingImport)return
    setEditingRowNumber(row.rowNumber)
    setEditDraft({ ...row })
    setBranchText(row.branchNames.join(' | '))
    setMinistryText(row.ministryNames.join(' | '))
    setEditorFeedback(row.errorCount ? `${row.errorCount} issue${row.errorCount === 1 ? '' : 's'} need attention. ${row.error}` : '')
  }

  function changePage(nextPage: number) {
    setPage(nextPage)
    requestAnimationFrame(() => reviewToolbarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function removeRow(rowNumber: number) {
    if(importLock.current || validating || pendingImport)return
    setRows((currentRows) => validateRows(currentRows.filter((row) => row.rowNumber !== rowNumber),existingContacts))
    if (editingRowNumber === rowNumber) {
      setEditingRowNumber(null)
      setEditDraft(null)
      setEditorFeedback('')
    }
  }

  async function handleImport() {
    if(importLock.current || validating || (!contactsChecked && !pendingImport))return
    importLock.current=true;setImporting(true);setMessage('')
    let batch=pendingImport
    try {
      if(!batch){
        const contacts=await readImportContacts()
        if(!alive.current)return
        const checked=validateRows(rows,contacts)
        setExistingContacts(contacts);setRows(checked);setContactsChecked(true)
        const ready=checked.filter(row=>!row.error && (!row.duplicateNameReason || row.nameDuplicateOverride))
        if(!ready.length){setMessage('Fix the highlighted rows before importing.');return}
        batch={id:crypto.randomUUID(),rows:ready,skipped:rows.length-ready.length,skippedRows:checked.filter(row=>Boolean(row.error)||(Boolean(row.duplicateNameReason)&&!row.nameDuplicateOverride))}
        setPendingImport(batch)
      }
      const {data,error}=await supabase.rpc('lc_import_members',{p_request_id:batch.id,p_rows:batch.rows})
      if(error)throw error
      if(!data || data.imported!==batch.rows.length)throw new Error('Import result could not be confirmed')
      if(!alive.current)return
      setPendingImport(null);setRows([]);setFileName('');setEditingRowNumber(null);setEditDraft(null);setReviewNotice('');setContactsChecked(false)
      setRecoveryRows(batch.skippedRows)
      setImportSuccess({imported:data.imported,skipped:batch.skipped})
      if(fileInputRef.current)fileInputRef.current.value=''
      try{await onImported()}catch{if(alive.current)setMessage('Members were imported, but the directory could not refresh. Reload the page to see them.')}
    } catch(failure) {
      if(!alive.current)return
      const code=(failure as {code?:string}).code ?? ''
      if(/^(P0001|22|23|42|PGRST202)/.test(code)){
        setPendingImport(null)
        setContactsChecked(false)
        setMessage(code==='P0001' ? (failure as {message:string}).message+'. No members from this request were saved. Retry validation before importing.' : 'Import was not completed. Retry validation before importing.')
      }else if(batch){
        setMessage('The import result could not be confirmed. Choose Check Import Result to safely retry the same submission.')
      }else{
        setContactsChecked(false)
        setMessage('Could not check the existing directory. Retry validation before importing.')
      }
    } finally {importLock.current=false;if(alive.current)setImporting(false)}
  }

  const reviewRows=rows.filter(row=>Boolean(row.error)||(Boolean(row.duplicateNameReason)&&!row.nameDuplicateOverride))
  function downloadReviewRows(items:ImportRow[],skipped=false) {
    if(!items.length)return
    setMessage('')
    try {
      const url=URL.createObjectURL(new Blob([importReviewCsv(items)],{type:'text/csv;charset=utf-8;'}))
      const link=document.createElement('a')
      link.href=url;link.download=`LifeCity-${skipped?'Skipped-Members':'Rows-to-Fix'}-${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(link)
      try{link.click()}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000)}
    } catch {setMessage('Could not prepare the review file. Please try again.')}
  }

  const validCount = rows.filter((row) => !row.error && (!row.duplicateNameReason || row.nameDuplicateOverride)).length
  const invalidCount = rows.filter((row) => row.error).length
  const possibleDuplicateCount = rows.filter((row) => row.duplicateNameReason && !row.nameDuplicateOverride).length
  const pageSize = 25
  const filteredRows = useMemo(() => {
    const matchingRows = rows.filter(row => matchesImportReview(row, filter, reviewSearch))

    return [...matchingRows].sort((a, b) => {
      const aNeedsReview = Boolean(a.error) || Boolean(a.duplicateNameReason && !a.nameDuplicateOverride)
      const bNeedsReview = Boolean(b.error) || Boolean(b.duplicateNameReason && !b.nameDuplicateOverride)
      if (errorsFirst && aNeedsReview !== bNeedsReview) {
        return aNeedsReview ? -1 : 1
      }
      return a.rowNumber - b.rowNumber
    })
  }, [errorsFirst, filter, rows, reviewSearch])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const displayedRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  return (
    <section className="csv-import-card">
      <div className="csv-import-intro">
        <div className="csv-import-icon">
          <FileSpreadsheet size={26} />
        </div>

        <div>
          <p className="eyebrow">Bulk Registration</p>
          <h2>Import Members from CSV</h2>
          <p className="muted">
            Download the template, add member details, churches, and ministries, then
            upload it here.
          </p>
        </div>

        <div className="csv-import-actions">
          <button
            className="secondary-button template-button"
            onClick={downloadTemplate}
          >
            <Download size={18} />
            <span>Download Template</span>
          </button>

          <button
            className="csv-close-button"
            type="button"
            disabled={importing||validating||!!pendingImport} onClick={onClose}
            aria-label="Close Member Import"
            title="Close Import"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="csv-import-steps">
        <span>
          <strong>1</strong>
          Download Template
        </span>
        <span>
          <strong>2</strong>
          Add Member Details
        </span>
        <span>
          <strong>3</strong>
          Upload and Review
        </span>
      </div>

      <label className="csv-upload-zone">
        <input ref={fileInputRef} disabled={importing||!!pendingImport} type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        <Upload size={28} />
        <strong>{fileName || 'Choose a CSV File'}</strong>
        <span>
          Required: first_name, last_name, churches · Optional: email, mobile,
          ministries, admin_note
        </span>
      </label>

      {importSuccess && (
        <section className="csv-import-success" role="status">
          <div className="csv-success-orbit" aria-hidden="true"><CheckCircle2 size={30} /></div>
          <div>
            <p className="eyebrow">Import Complete</p>
            <h3>{importSuccess.imported} Member{importSuccess.imported === 1 ? '' : 's'} Added to the Directory</h3>
            <p>{importSuccess.skipped > 0 ? `${importSuccess.skipped} row${importSuccess.skipped === 1 ? ' was' : 's were'} not imported and can be included in your next file.` : 'Everything in this file was added successfully.'}</p>
          </div>
        </section>
      )}

      {recoveryRows.length>0 && <div className="lcij-recovery" role="region" aria-label="Skipped Import Rows">
        <div><strong>{recoveryRows.length} Skipped Row{recoveryRows.length===1?'':'s'}</strong><p>Download these rows with their review notes, correct them, and upload the file again. Save the file before closing this panel or choosing another CSV.</p></div>
        <button type="button" className="secondary-button" onClick={()=>downloadReviewRows(recoveryRows,true)}><Download size={17} aria-hidden="true"/>Download Skipped Rows</button>
      </div>}

      {rows.length > 0 && (
        <>
          <div className="csv-summary" ref={reviewToolbarRef}>
            <span>{rows.length} Row(s) Found</span>
            <span className="valid-count">{validCount} Valid</span>

            {invalidCount > 0 && (
              <span className="invalid-count">
                {invalidCount} Need Attention
              </span>
            )}
            {possibleDuplicateCount > 0 && (
              <span className="possible-duplicate-count">{possibleDuplicateCount} Possible Duplicate{possibleDuplicateCount === 1 ? '' : 's'}</span>
            )}
          </div>

          {reviewNotice && (
            <div className="csv-review-notice" role="status">
              <CheckCircle2 size={17} />
              <span>{reviewNotice}</span>
              <button type="button" onClick={() => setReviewNotice('')} aria-label="Dismiss Confirmation"><X size={15} /></button>
            </div>
          )}

          <div className="lcik-search">
            <label htmlFor="import-review-search">Find an Import Row</label>
            <div>
              <input id="import-review-search" type="search" placeholder="Name, Email, Mobile, or Row Number" value={reviewSearch}
                disabled={editingRowNumber!==null}
                onChange={event=>{setReviewSearch(event.target.value);setPage(1)}} />
              {reviewSearch && <button type="button" className="secondary-button" disabled={editingRowNumber!==null} onClick={()=>{setReviewSearch('');setPage(1)}}>Clear Search</button>}
            </div>
            <p>Search and filters change the preview only. Import includes all valid rows in this file.</p>
          </div>
          <div className="csv-review-toolbar">
            <div className="csv-review-filters" aria-label="Import Review Filters">
              <button
                className={filter === 'all' ? 'is-active' : ''}
                type="button"
                disabled={editingRowNumber!==null}
                aria-pressed={filter === 'all'}
                onClick={() => { setFilter('all'); setPage(1) }}
              >
                All Rows
              </button>
              <button
                className={filter === 'errors' ? 'is-active is-error' : 'is-error'}
                type="button"
                disabled={editingRowNumber!==null}
                aria-pressed={filter === 'errors'}
                onClick={() => { setFilter('errors'); setPage(1) }}
              >
                Needs Attention ({reviewRows.length})
              </button>
              <button
                className={filter === 'ready' ? 'is-active is-ready' : 'is-ready'}
                type="button"
                disabled={editingRowNumber!==null}
                aria-pressed={filter === 'ready'}
                onClick={() => { setFilter('ready'); setPage(1) }}
              >
                Ready ({validCount})
              </button>
            </div>

            <label className="csv-error-sort">
              <input
                type="checkbox"
                checked={errorsFirst}
                onChange={(event) => setErrorsFirst(event.target.checked)}
              />
              Needs Attention First
            </label>
          </div>

          <div className="csv-preview">
            <div className="csv-preview-heading">
              <span>Row</span>
              <span>Member</span>
              <span>Ministries</span>
              <span>Churches</span>
              <span>Status</span>
              <span />
            </div>

            {displayedRows.map((row) => (
              <Fragment key={row.rowNumber}>
                <article className={`csv-preview-row ${row.error ? 'has-error' : ''} ${row.duplicateNameReason ? 'has-possible-duplicate' : ''} ${editingRowNumber === row.rowNumber ? 'is-editing' : ''}`}>
                  <span>#{row.rowNumber}</span>
                  <div className="csv-member-cell">
                    <span className={row.firstName ? '' : 'csv-missing'}>{row.firstName || 'Missing First Name'}</span>
                    <span className={row.lastName ? '' : 'csv-missing'}>{row.lastName || 'Missing Last Name'}</span>
                  </div>
                  <span>{row.ministryNames.join(', ') || '—'}</span>
                  <span>{row.branchNames.join(', ') || '—'}</span>
                  <span className={row.error ? 'csv-error' : row.duplicateNameReason ? 'csv-possible-duplicate' : 'csv-valid'}>
                    {row.error ? <><span className="csv-error-count" aria-label={`${row.errorCount} Issues`}>{row.errorCount} Issue{row.errorCount === 1 ? '' : 's'}</span><span>{uiMessage(row.error)}</span></> : row.duplicateNameReason ? <><span className="csv-duplicate-pill">Possible Duplicate</span><label className="csv-duplicate-override"><input type="checkbox" disabled={importing||validating||!!pendingImport} checked={row.nameDuplicateOverride} onChange={(event) => setRows((currentRows) => currentRows.map((currentRow) => currentRow.rowNumber === row.rowNumber ? { ...currentRow, nameDuplicateOverride: event.target.checked } : currentRow))} />Import Anyway</label></> : <><CheckCircle2 size={15} /> Ready</>}
                  </span>
                  <span className="csv-row-actions">
                    <button className="csv-row-edit-button" type="button" disabled={importing||validating||!!pendingImport} onClick={() => openInlineEditor(row)} aria-label={`Edit Row ${row.rowNumber}`} title="Edit Row"><Pencil size={15} /></button>
                    <button className="csv-row-remove-button" type="button" disabled={importing||validating||!!pendingImport} onClick={() => removeRow(row.rowNumber)} aria-label={`Remove Row ${row.rowNumber}`} title="Remove Row"><Trash2 size={15} /></button>
                  </span>
                </article>

                {editingRowNumber === row.rowNumber && editDraft && (
                  <section className="csv-inline-editor" aria-label={`Editing Row ${row.rowNumber}`}>
                    <div className="csv-editor-heading"><span>Editing {memberName(editDraft)}</span><small>Changes are checked before they are saved.</small></div>
                    {editorFeedback && <p className="csv-editor-feedback"><span>Needs Attention</span>{uiMessage(editorFeedback)}</p>}
                    <label><span className="csv-field-label">First Name <b>*</b></span><input className={fieldNeedsAttention(editDraft, 'name') ? 'needs-attention' : ''} placeholder="Juan" value={editDraft.firstName} onChange={(event) => setEditDraft({ ...editDraft, firstName: event.target.value })} /></label>
                    <label><span className="csv-field-label">Last Name <b>*</b></span><input className={fieldNeedsAttention(editDraft, 'name') ? 'needs-attention' : ''} placeholder="Dela Cruz" value={editDraft.lastName} onChange={(event) => setEditDraft({ ...editDraft, lastName: event.target.value })} /></label>
                    <label><span className="csv-field-label">Email</span><input className={fieldNeedsAttention(editDraft, 'email') ? 'needs-attention' : ''} type="email" value={editDraft.email} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} /></label>
                    <label>Mobile<input className={fieldNeedsAttention(editDraft, 'mobile') ? 'needs-attention' : ''} inputMode="numeric" placeholder="11-Digit Mobile Number (09xxxxxxxxx)" value={editDraft.mobile} onChange={(event) => setEditDraft({ ...editDraft, mobile: event.target.value })} /></label>
                    <label><span className="csv-field-label">Churches <b>*</b></span><input className={fieldNeedsAttention(editDraft, 'branch') ? 'needs-attention' : ''} placeholder="LifeCity - Main" value={branchText} onChange={(event) => setBranchText(event.target.value)} /></label>
                    <label><span className="csv-field-label">Ministries</span><input value={ministryText} onChange={(event) => setMinistryText(event.target.value)} /></label>
                    <label className="csv-editor-note">Admin Note<input value={editDraft.adminNote} onChange={(event) => setEditDraft({ ...editDraft, adminNote: event.target.value })} /></label>
                    <div className="csv-editor-actions">
                      <button className="secondary-button" type="button" onClick={() => { setEditingRowNumber(null); setEditDraft(null); setEditorFeedback('') }}>Cancel</button>
                      <button className="primary-button" type="button" onClick={saveInlineEdit}><Save size={17} />Save & Validate</button>
                    </div>
                  </section>
                )}
              </Fragment>
            ))}
          </div>

          {filteredRows.length===0 && <p className="lcik-empty" role="status">No rows match this search and filter. Try another search or choose All Rows.</p>}
          <div className="csv-pagination">
            <p>Showing {filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} filtered row(s).</p>
            {totalPages > 1 && (
              <div>
                <button type="button" disabled={currentPage === 1 || editingRowNumber!==null} onClick={() => changePage(currentPage - 1)} aria-label="Previous Page"><ChevronLeft size={18} /></button>
                <span>Page {currentPage} of {totalPages}</span>
                <button type="button" disabled={currentPage === totalPages || editingRowNumber!==null} onClick={() => changePage(currentPage + 1)} aria-label="Next Page"><ChevronRight size={18} /></button>
              </div>
            )}
          </div>

          {reviewRows.length>0 && <div className="lcij-recovery">
            <div><strong>Rows to Fix</strong><p>Download all {reviewRows.length} rows needing attention, including those on other pages. Save any open row edit first.</p></div>
            <button type="button" className="secondary-button" disabled={importing||validating||!!pendingImport||!contactsChecked||editingRowNumber!==null} onClick={()=>downloadReviewRows(reviewRows)}><Download size={17} aria-hidden="true"/>Download Rows to Fix</button>
          </div>}

          <div className="csv-import-footer">
            <p>{validating ? 'Checking existing member contacts…' : pendingImport ? 'This submission is kept until its result is confirmed.' : !contactsChecked ? 'Validate the directory before importing.' : editingRowNumber!==null ? 'Save or cancel your row edit before importing.' : 'Rows with errors are blocked until corrected.'}</p>

            <button
              className="secondary-button import-members-button"
              onClick={handleImport}
              disabled={importing || validating || (!pendingImport && (!contactsChecked || validCount === 0 || editingRowNumber!==null))}
            >
              <Upload size={18} />
              {importing
                ? 'Importing…'
                : pendingImport ? 'Check Import Result' : `Import ${validCount} Valid Member(s)`}
            </button>
          </div>
        </>
      )}

      {message && <p className="csv-message" role="status">{uiMessage(message)}</p>}
      {!contactsChecked && !validating && !importing && !pendingImport && rows.length>0 && <button type="button" className="secondary-button" onClick={()=>void loadExistingContactsAndValidate(rows)}>Retry Validation</button>}

    </section>
  )
}
