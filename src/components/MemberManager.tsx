import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Download,
  Pencil,
  Plus,
  QrCode,
  Search,
  Settings2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import MemberImport from './MemberImport'
import { supabase } from '../lib/supabase'

type Ministry = {
  id: string
  name: string
}

type MemberMinistry = {
  ministry_id: string
  ministries: Ministry | null
}

type Member = {
  id: string
  member_number: string
  first_name: string
  last_name: string
  email: string | null
  mobile: string | null
  status: 'active' | 'inactive'
  qr_token: string
  created_at: string
  member_ministries: MemberMinistry[]
}

type MemberForm = {
  firstName: string
  lastName: string
  email: string
  mobile: string
  status: 'active' | 'inactive'
  ministryIds: string[]
}

type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'added-newest'
  | 'added-oldest'
  | 'ministry-asc'

const emptyForm: MemberForm = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  status: 'active',
  ministryIds: [],
}

const sortCycle: SortOption[] = [
  'name-asc',
  'name-desc',
  'added-newest',
  'added-oldest',
  'ministry-asc',
]

const sortLabels: Record<SortOption, string> = {
  'name-asc': 'A–Z',
  'name-desc': 'Z–A',
  'added-newest': 'Added: newest',
  'added-oldest': 'Added: oldest',
  'ministry-asc': 'Ministry: A–Z',
}

function normaliseMobile(value: string) {
  return value.replace(/\D/g, '')
}

function memberName(member: Member) {
  return `${member.first_name} ${member.last_name}`.trim()
}

function getMemberMinistries(member: Member) {
  return (member.member_ministries ?? [])
    .map((item) => item.ministries)
    .filter((ministry): ministry is Ministry => Boolean(ministry))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default function MemberManager() {
  const [members, setMembers] = useState<Member[]>([])
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [search, setSearch] = useState('')
  const [ministryFilter, setMinistryFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showMinistryManager, setShowMinistryManager] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [form, setForm] = useState<MemberForm>(emptyForm)
  const [newMinistryName, setNewMinistryName] = useState('')
  const [renamingMinistryId, setRenamingMinistryId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [ministryMessage, setMinistryMessage] = useState('')
  const [blockedMinistryId, setBlockedMinistryId] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [membersResult, ministriesResult] = await Promise.all([
      supabase
        .from('members')
        .select(`
          id,
          member_number,
          first_name,
          last_name,
          email,
          mobile,
          status,
          qr_token,
          created_at,
          member_ministries (
            ministry_id,
            ministries (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false }),
      supabase.from('ministries').select('id, name').order('name'),
    ])

    if (membersResult.error) {
      setMessage(membersResult.error.message)
    } else {
      setMembers((membersResult.data ?? []) as unknown as Member[])
    }

    if (ministriesResult.error) {
      setMessage(ministriesResult.error.message)
    } else {
      setMinistries((ministriesResult.data ?? []) as Ministry[])
    }

    setLoading(false)
  }

  function openAddForm() {
    setMessage('')
    setEditingMember(null)
    setForm(emptyForm)
    setNewMinistryName('')
    setShowForm(true)
  }

  function openEditForm(member: Member) {
    setMessage('')
    setEditingMember(member)
    setForm({
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email ?? '',
      mobile: member.mobile ?? '',
      status: member.status,
      ministryIds: getMemberMinistries(member).map((ministry) => ministry.id),
    })
    setNewMinistryName('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingMember(null)
    setForm(emptyForm)
    setNewMinistryName('')
    setMessage('')
  }

  function toggleMinistry(ministryId: string) {
    setForm((current) => ({
      ...current,
      ministryIds: current.ministryIds.includes(ministryId)
        ? current.ministryIds.filter((id) => id !== ministryId)
        : [...current.ministryIds, ministryId],
    }))
  }

  async function addMinistry() {
    const name = newMinistryName.trim()

    if (!name) return

    const existing = ministries.find(
      (ministry) => ministry.name.toLowerCase() === name.toLowerCase(),
    )

    if (existing) {
      if (!form.ministryIds.includes(existing.id)) {
        setForm((current) => ({
          ...current,
          ministryIds: [...current.ministryIds, existing.id],
        }))
      }

      setNewMinistryName('')
      return
    }

    const { data, error } = await supabase
      .from('ministries')
      .insert({ name })
      .select('id, name')
      .single()

    if (error) {
      setMessage(
        error.code === '23505'
          ? 'That ministry already exists.'
          : error.message,
      )
      return
    }

    const ministry = data as Ministry

    setMinistries((current) =>
      [...current, ministry].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setForm((current) => ({
      ...current,
      ministryIds: [...current.ministryIds, ministry.id],
    }))
    setNewMinistryName('')
  }

  async function checkForDuplicates() {
    const email = form.email.trim().toLowerCase()
    const mobile = normaliseMobile(form.mobile)

    if (!email && !mobile) return null

    const { data, error } = await supabase
      .from('members')
      .select('id, email, mobile')

    if (error) return error.message

    const duplicate = (data ?? []).find((member) => {
      if (member.id === editingMember?.id) return false

      const sameEmail =
        Boolean(email) && member.email?.trim().toLowerCase() === email

      const sameMobile =
        Boolean(mobile) && normaliseMobile(member.mobile ?? '') === mobile

      return sameEmail || sameMobile
    })

    if (!duplicate) return null

    if (email && duplicate.email?.trim().toLowerCase() === email) {
      return 'That email address is already assigned to another member.'
    }

    return 'That mobile number is already assigned to another member.'
  }

  async function saveMemberMinistries(memberId: string) {
    const { error: deleteError } = await supabase
      .from('member_ministries')
      .delete()
      .eq('member_id', memberId)

    if (deleteError) return deleteError
    if (form.ministryIds.length === 0) return null

    const { error: insertError } = await supabase
      .from('member_ministries')
      .insert(
        form.ministryIds.map((ministryId) => ({
          member_id: memberId,
          ministry_id: ministryId,
        })),
      )

    return insertError
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    const duplicateMessage = await checkForDuplicates()

    if (duplicateMessage) {
      setMessage(duplicateMessage)
      return
    }

    setSaving(true)

    const memberValues = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim().toLowerCase() || null,
      mobile: form.mobile.trim() || null,
      status: form.status,
    }

    let memberId = editingMember?.id ?? ''

    if (editingMember) {
      const { error } = await supabase
        .from('members')
        .update(memberValues)
        .eq('id', editingMember.id)

      if (error) {
        setMessage(
          error.code === '23505'
            ? 'That email address or mobile number is already in use.'
            : error.message,
        )
        setSaving(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('members')
        .insert({
          ...memberValues,
          member_number: `M-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        })
        .select('id')
        .single()

      if (error) {
        setMessage(
          error.code === '23505'
            ? 'That email address or mobile number is already in use.'
            : error.message,
        )
        setSaving(false)
        return
      }

      memberId = data.id
    }

    const ministryError = await saveMemberMinistries(memberId)

    if (ministryError) {
      setMessage(ministryError.message)
      setSaving(false)
      return
    }

    await loadData()
    closeForm()
    setSaving(false)
  }

  function ministryMemberCount(ministryId: string) {
    return members.filter((member) =>
      getMemberMinistries(member).some(
        (ministry) => ministry.id === ministryId,
      ),
    ).length
  }

  function beginRename(ministry: Ministry) {
    setMinistryMessage('')
    setBlockedMinistryId('')
    setRenamingMinistryId(ministry.id)
    setRenameValue(ministry.name)
  }

  async function saveMinistryRename(ministry: Ministry) {
    const name = renameValue.trim()

    if (!name) {
      setMinistryMessage('A ministry name is required.')
      return
    }

    const duplicate = ministries.some(
      (item) =>
        item.id !== ministry.id && item.name.toLowerCase() === name.toLowerCase(),
    )

    if (duplicate) {
      setMinistryMessage('A ministry with that name already exists.')
      return
    }

    const { error } = await supabase
      .from('ministries')
      .update({ name })
      .eq('id', ministry.id)

    if (error) {
      setMinistryMessage(error.message)
      return
    }

    setRenamingMinistryId('')
    setRenameValue('')
    setMinistryMessage('Ministry renamed successfully.')
    await loadData()
  }

  async function deleteMinistry(ministry: Ministry) {
    const count = ministryMemberCount(ministry.id)

    if (count > 0) {
      setBlockedMinistryId(ministry.id)
      setMinistryMessage(
        `${ministry.name} cannot be deleted because it is assigned to ${count} member${count === 1 ? '' : 's'}, including inactive members if applicable.`,
      )
      return
    }

    const confirmed = window.confirm(
      `Delete the ministry "${ministry.name}"? This cannot be undone.`,
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('ministries')
      .delete()
      .eq('id', ministry.id)

    if (error) {
      setMinistryMessage(error.message)
      return
    }

    setMinistryMessage(`${ministry.name} was deleted.`)
    await loadData()
  }

  function viewAffectedMembers(ministryId: string) {
    setMinistryFilter(ministryId)
    setShowMinistryManager(false)
    setBlockedMinistryId('')
    setMinistryMessage('')
  }

  function cycleSort() {
    const currentIndex = sortCycle.indexOf(sortBy)
    const nextIndex = (currentIndex + 1) % sortCycle.length

    setSortBy(sortCycle[nextIndex])
  }

  function downloadQrCode(member: Member) {
    const svg = document.getElementById(
      'member-qr-code',
    ) as SVGSVGElement | null

    if (!svg) return

    const content = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([content], {
      type: 'image/svg+xml;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `lifecity-qr-${member.member_number}.svg`
    link.click()

    URL.revokeObjectURL(url)
  }

  const visibleMembers = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = members.filter((member) => {
      const memberMinistries = getMemberMinistries(member)

      const matchesSearch =
        !query ||
        [
          member.first_name,
          member.last_name,
          member.member_number,
          member.email ?? '',
          member.mobile ?? '',
          ...memberMinistries.map((ministry) => ministry.name),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)

      const matchesMinistry =
        ministryFilter === 'all' ||
        memberMinistries.some((ministry) => ministry.id === ministryFilter)

      return matchesSearch && matchesMinistry
    })

    return [...filtered].sort((a, b) => {
      const nameCompare = memberName(a).localeCompare(memberName(b))

      if (sortBy === 'name-desc') return -nameCompare

      if (sortBy === 'added-newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }

      if (sortBy === 'added-oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }

      if (sortBy === 'ministry-asc') {
        const aMinistry = getMemberMinistries(a)[0]?.name ?? 'zzz'
        const bMinistry = getMemberMinistries(b)[0]?.name ?? 'zzz'

        return aMinistry.localeCompare(bMinistry) || nameCompare
      }

      return nameCompare
    })
  }, [members, search, ministryFilter, sortBy])

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Member directory</p>
          <h1>Members</h1>
          <p className="muted">
            Manage contact details, ministries, member status, and private QR
            codes.
          </p>
        </div>

        <div className="page-actions">
          <button
            className={
              showImport
                ? 'secondary-button import-open-button'
                : 'secondary-button'
            }
            onClick={() => setShowImport((current) => !current)}
          >
            {showImport ? <X size={18} /> : <Download size={18} />}
            {showImport ? 'Close import' : 'Import CSV'}
          </button>

          <button
            className="secondary-button"
            onClick={() => setShowMinistryManager((current) => !current)}
          >
            <Settings2 size={18} />
            {showMinistryManager ? 'Close ministries' : 'Manage ministries'}
          </button>

          <button className="primary-button" onClick={openAddForm}>
            <UserPlus size={18} />
            Add member
          </button>
        </div>
      </div>

      {showImport && (
        <MemberImport
          onImported={loadData}
          onClose={() => setShowImport(false)}
        />
      )}

      {showMinistryManager && (
        <section className="ministry-manager-card">
          <div className="ministry-manager-heading">
            <div>
              <p className="eyebrow">Directory settings</p>
              <h2>Manage ministries</h2>
              <p className="muted">
                Rename a ministry anytime. A ministry can only be deleted after
                it is removed from every member, active or inactive.
              </p>
            </div>

            <button
              className="icon-button"
              type="button"
              onClick={() => setShowMinistryManager(false)}
              aria-label="Close ministry management"
            >
              <X size={20} />
            </button>
          </div>

          {ministryMessage && (
            <div className="ministry-message">
              <p>{ministryMessage}</p>

              {blockedMinistryId && (
                <button
                  className="secondary-button"
                  onClick={() => viewAffectedMembers(blockedMinistryId)}
                >
                  View affected members
                </button>
              )}
            </div>
          )}

          {ministries.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <p>No ministries have been created yet.</p>
            </div>
          ) : (
            <div className="ministry-management-list">
              {ministries.map((ministry) => {
                const count = ministryMemberCount(ministry.id)
                const isRenaming = renamingMinistryId === ministry.id

                return (
                  <article className="ministry-management-row" key={ministry.id}>
                    <div className="ministry-management-name">
                      {isRenaming ? (
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          autoFocus
                        />
                      ) : (
                        <strong>{ministry.name}</strong>
                      )}

                      <span>
                        {count} assigned member{count === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="ministry-management-actions">
                      {isRenaming ? (
                        <>
                          <button
                            className="edit-icon-button save-ministry-button"
                            onClick={() => void saveMinistryRename(ministry)}
                            aria-label={`Save ${ministry.name}`}
                            title="Save name"
                          >
                            <Check size={18} />
                          </button>

                          <button
                            className="edit-icon-button"
                            onClick={() => {
                              setRenamingMinistryId('')
                              setRenameValue('')
                            }}
                            aria-label="Cancel rename"
                            title="Cancel"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="edit-icon-button"
                            onClick={() => beginRename(ministry)}
                            aria-label={`Rename ${ministry.name}`}
                            title="Rename ministry"
                          >
                            <Pencil size={18} />
                          </button>

                          <button
                            className="delete-icon-button"
                            onClick={() => void deleteMinistry(ministry)}
                            aria-label={`Delete ${ministry.name}`}
                            title="Delete ministry"
                          >
                            <X size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {showForm && (
        <section className="form-card member-editor-card">
          <div className="member-editor-heading">
            <div>
              <p className="eyebrow">
                {editingMember ? 'Update member' : 'New member'}
              </p>
              <h2>
                {editingMember
                  ? `Edit ${memberName(editingMember)}`
                  : 'Register a member'}
              </h2>
            </div>

            <button
              className="icon-button"
              type="button"
              onClick={closeForm}
              aria-label="Close member form"
            >
              <X size={20} />
            </button>
          </div>

          <form className="member-form" onSubmit={handleSave}>
            <label>
              First name
              <input
                value={form.firstName}
                onChange={(event) =>
                  setForm({ ...form, firstName: event.target.value })
                }
                required
              />
            </label>

            <label>
              Last name
              <input
                value={form.lastName}
                onChange={(event) =>
                  setForm({ ...form, lastName: event.target.value })
                }
                required
              />
            </label>

            <label>
              Email <span>Optional</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </label>

            <label>
              Mobile number <span>Optional</span>
              <input
                value={form.mobile}
                onChange={(event) =>
                  setForm({ ...form, mobile: event.target.value })
                }
              />
            </label>

            <section className="status-toggle-field wide-field">
              <div>
                <strong>Member status</strong>
                <p>
                  Inactive members remain in attendance history but cannot be
                  checked in.
                </p>
              </div>

              <label className="status-switch">
                <input
                  type="checkbox"
                  checked={form.status === 'active'}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.checked ? 'active' : 'inactive',
                    })
                  }
                />
                <span className="status-switch-track">
                  <span className="status-switch-thumb" />
                </span>
                <strong>{form.status === 'active' ? 'Active' : 'Inactive'}</strong>
              </label>
            </section>

            <section className="ministry-picker wide-field">
              <div className="ministry-picker-heading">
                <div>
                  <strong>Ministries</strong>
                  <p>Choose every ministry this member belongs to.</p>
                </div>
              </div>

              {ministries.length === 0 ? (
                <p className="muted">Add your first ministry below.</p>
              ) : (
                <div className="ministry-options">
                  {ministries.map((ministry) => {
                    const checked = form.ministryIds.includes(ministry.id)

                    return (
                      <label
                        className={`ministry-option ${checked ? 'selected' : ''}`}
                        key={ministry.id}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMinistry(ministry.id)}
                        />
                        <span>{ministry.name}</span>
                        {checked && <Check size={15} />}
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="add-ministry-row">
                <input
                  value={newMinistryName}
                  onChange={(event) => setNewMinistryName(event.target.value)}
                  placeholder="Add a new ministry, e.g. Worship Team"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void addMinistry()
                    }
                  }}
                />

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void addMinistry()}
                >
                  <Plus size={17} />
                  Add ministry
                </button>
              </div>
            </section>

            {message && <p className="error-message wide-field">{message}</p>}

            <div className="form-actions wide-field">
              <button
                type="button"
                className="secondary-button"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button className="primary-button" disabled={saving}>
                <Check size={18} />
                {saving
                  ? 'Saving…'
                  : editingMember
                    ? 'Save changes'
                    : 'Save member'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="directory-card">
        <div className="directory-toolbar member-toolbar">
          <div>
            <h2>All members</h2>
            <p>
              {visibleMembers.length} of {members.length} registered
            </p>
          </div>

          <div className="member-directory-controls">
            <label className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search members"
              />
            </label>

            <label className="filter-select">
              <Users size={17} />
              <select
                value={ministryFilter}
                onChange={(event) => setMinistryFilter(event.target.value)}
              >
                <option value="all">All ministries</option>
                {ministries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading members…</p>
          </div>
        ) : visibleMembers.length === 0 ? (
          <div className="empty-state">
            <Users size={30} />
            <h3>No members found</h3>
            <p>Try another search or add a new member.</p>
          </div>
        ) : (
          <div className="member-list">
            <div className="member-list-heading">
              <span />

              <button
                className={`member-sort-header ${
                  sortBy === 'name-desc' ? 'sort-descending' : ''
                }`}
                onClick={cycleSort}
                title="Change member sorting"
              >
                <strong>Member</strong>
                <span>{sortLabels[sortBy]}</span>
                <ChevronDown size={16} />
              </button>

              <span>Ministries</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {visibleMembers.map((member) => {
              const memberMinistries = getMemberMinistries(member)
              const displayedMinistries = memberMinistries.slice(0, 2)
              const remainingMinistryCount =
                memberMinistries.length - displayedMinistries.length

              return (
                <article className="member-row member-management-row" key={member.id}>
                  <div className="avatar">
                    {member.first_name[0]}
                    {member.last_name[0]}
                  </div>

                  <div className="member-name">
                    <strong>{memberName(member)}</strong>
                    <span>
                      {member.member_number} · Added {formatDate(member.created_at)}
                    </span>

                    {(member.email || member.mobile) && (
                      <small>
                        {[member.email, member.mobile].filter(Boolean).join(' · ')}
                      </small>
                    )}
                  </div>

                  <div
                    className="member-ministries"
                    title={memberMinistries
                      .map((ministry) => ministry.name)
                      .join(', ')}
                  >
                    {memberMinistries.length > 0 ? (
                      <>
                        {displayedMinistries.map((ministry) => (
                          <span className="group-label" key={ministry.id}>
                            {ministry.name}
                          </span>
                        ))}

                        {remainingMinistryCount > 0 && (
                          <span className="more-ministries-label">
                            +{remainingMinistryCount} more
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="no-ministry">No ministry</span>
                    )}
                  </div>

                  <span className={`status ${member.status}`}>
                    {member.status}
                  </span>

                  <div className="member-row-actions">
                    <button
                      className="qr-button"
                      onClick={() => setSelectedMember(member)}
                    >
                      <QrCode size={17} />
                      QR
                    </button>

                    <button
                      className="edit-icon-button member-edit-button"
                      onClick={() => openEditForm(member)}
                      aria-label={`Edit ${memberName(member)}`}
                      title={`Edit ${memberName(member)}`}
                    >
                      <Pencil size={18} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {selectedMember && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedMember(null)}
        >
          <section
            className="qr-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setSelectedMember(null)}
              aria-label="Close QR code"
            >
              <X size={20} />
            </button>

            <p className="eyebrow">Member QR code</p>
            <h2>{memberName(selectedMember)}</h2>
            <p className="muted">{selectedMember.member_number}</p>

            <div className="qr-frame">
              <QRCodeSVG
                id="member-qr-code"
                value={`att:${selectedMember.qr_token}`}
                size={220}
                level="M"
                includeMargin
              />
            </div>

            <p className="qr-note">
              This code contains only a random private token, not the member’s
              personal details.
            </p>

            <button
              className="primary-button full-width"
              onClick={() => downloadQrCode(selectedMember)}
            >
              <Download size={18} />
              Download QR code
            </button>
          </section>
        </div>
      )}
    </>
  )
}