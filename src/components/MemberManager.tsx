// Replacement ID: member-branches-v1
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  Pencil,
  Plus,
  QrCode,
  Search,
  Settings2,
  ListChecks,
  Star,
  StickyNote,
  Trash2,
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

type Branch = {
  id: string
  name: string
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
  is_starred: boolean
  admin_note: string | null
  created_at: string
  member_ministries: {
    ministry_id: string
    ministries: Ministry | null
  }[]
  member_branches: {
    branch_id: string
    branches: Branch | null
  }[]
}

type MemberForm = {
  firstName: string
  lastName: string
  email: string
  mobile: string
  status: 'active' | 'inactive'
  ministryIds: string[]
  branchIds: string[]
  adminNote: string
}

type ContactFieldErrors = {
  email?: string
  mobile?: string
}

type AttendanceRecord = {
  id: string
  checked_in_at: string
  status: 'present' | 'corrected'
  events: {
    name: string
    starts_at: string
  } | null
}

type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'added-oldest'
  | 'added-newest'

const emptyForm: MemberForm = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  status: 'active',
  ministryIds: [],
  branchIds: [],
  adminNote: '',
}

const sortCycle: SortOption[] = [
  'name-asc',
  'name-desc',
  'added-oldest',
  'added-newest',
]

const sortLabels: Record<SortOption, string> = {
  'name-asc': 'A–Z',
  'name-desc': 'Z–A',
  'added-oldest': 'Added: oldest',
  'added-newest': 'Added: newest',
}

const attendancePageSize = 10

function normaliseMobile(value: string) {
  return value.replace(/\D/g, '')
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.com$/i.test(value)
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

function getMemberBranches(member: Member) {
  return (member.member_branches ?? [])
    .map((item) => item.branches)
    .filter((branch): branch is Branch => Boolean(branch))
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function MemberManager() {
  const [members, setMembers] = useState<Member[]>([])
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [search, setSearch] = useState('')
  const [ministryFilter, setMinistryFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showMinistryManager, setShowMinistryManager] = useState(false)
  const [showBranchManager, setShowBranchManager] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [detailMember, setDetailMember] = useState<Member | null>(null)
  const [noteMember, setNoteMember] = useState<Member | null>(null)
  const [memberAttendance, setMemberAttendance] = useState<AttendanceRecord[]>([])
  const [attendanceTotal, setAttendanceTotal] = useState(0)
  const [attendancePage, setAttendancePage] = useState(1)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [form, setForm] = useState<MemberForm>(emptyForm)
  const [contactFieldErrors, setContactFieldErrors] =
    useState<ContactFieldErrors>({})
  const [newMinistryName, setNewMinistryName] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [newManagedMinistryName, setNewManagedMinistryName] = useState('')
  const [newManagedBranchName, setNewManagedBranchName] = useState('')
  const [renamingMinistryId, setRenamingMinistryId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [ministryMessage, setMinistryMessage] = useState('')
  const [blockedMinistryId, setBlockedMinistryId] = useState('')
  const [renamingBranchId, setRenamingBranchId] = useState('')
  const [branchRenameValue, setBranchRenameValue] = useState('')
  const [branchMessage, setBranchMessage] = useState('')
  const [blockedBranchId, setBlockedBranchId] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)

  const importRef = useRef<HTMLDivElement | null>(null)
  const ministryManagerRef = useRef<HTMLElement | null>(null)
  const branchManagerRef = useRef<HTMLElement | null>(null)
  const memberFormRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    void loadData()
  }, [])

  function scrollToSection(
    ref: React.RefObject<HTMLElement | HTMLDivElement | null>,
  ) {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  async function loadData() {
    setLoading(true)

    const [membersResult, ministriesResult, branchesResult] = await Promise.all([
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
          is_starred,
          admin_note,
          created_at,
          member_ministries (
            ministry_id,
            ministries (
              id,
              name
            )
          ),
          member_branches (
            branch_id,
            branches (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false }),
      supabase.from('ministries').select('id, name').order('name'),
      supabase.from('branches').select('id, name').order('name'),
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

    if (branchesResult.error) {
      setMessage(branchesResult.error.message)
    } else {
      setBranches((branchesResult.data ?? []) as Branch[])
    }

    setLoading(false)
  }

  function openAddForm() {
    setMessage('')
    setContactFieldErrors({})
    setEditingMember(null)
    const defaultBranch = branches.find((branch) => branch.name === 'LifeCity - Main')
    setForm({ ...emptyForm, branchIds: defaultBranch ? [defaultBranch.id] : [] })
    setNewMinistryName('')
    setNewBranchName('')
    setShowForm(true)
    scrollToSection(memberFormRef)
  }

  function openEditForm(member: Member) {
    setMessage('')
    setContactFieldErrors({})
    setEditingMember(member)
    setForm({
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email ?? '',
      mobile: member.mobile ?? '',
          status: member.status,
          ministryIds: getMemberMinistries(member).map((ministry) => ministry.id),
          branchIds: getMemberBranches(member).map((branch) => branch.id),
          adminNote: member.admin_note ?? '',
    })
    setNewMinistryName('')
    setNewBranchName('')
    setShowForm(true)
    scrollToSection(memberFormRef)
  }

  function closeForm() {
    setShowForm(false)
    setEditingMember(null)
    setForm(emptyForm)
    setNewMinistryName('')
    setNewBranchName('')
    setMessage('')
    setContactFieldErrors({})
  }

  function toggleImport() {
    const nextOpen = !showImport

    setShowImport(nextOpen)

    if (nextOpen) {
      scrollToSection(importRef)
    }
  }

  function toggleMinistryManager() {
    const nextOpen = !showMinistryManager

    setShowMinistryManager(nextOpen)

    if (nextOpen) {
      scrollToSection(ministryManagerRef)
    }
  }

  function toggleBranchManager() {
    const nextOpen = !showBranchManager
    setShowBranchManager(nextOpen)

    if (nextOpen) scrollToSection(branchManagerRef)
  }

  function toggleMinistry(ministryId: string) {
    setForm((current) => ({
      ...current,
      ministryIds: current.ministryIds.includes(ministryId)
        ? current.ministryIds.filter((id) => id !== ministryId)
        : [...current.ministryIds, ministryId],
    }))
  }

  function toggleBranch(branchId: string) {
    setForm((current) => ({
      ...current,
      branchIds: current.branchIds.includes(branchId)
        ? current.branchIds.filter((id) => id !== branchId)
        : [...current.branchIds, branchId],
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

  async function addBranch() {
    const name = newBranchName.trim()
    if (!name) return

    const existing = branches.find((branch) => branch.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!form.branchIds.includes(existing.id)) {
        setForm((current) => ({ ...current, branchIds: [...current.branchIds, existing.id] }))
      }
      setNewBranchName('')
      return
    }

    const { data, error } = await supabase
      .from('branches')
      .insert({ name })
      .select('id, name')
      .single()

    if (error) {
      setMessage(error.code === '23505' ? 'That branch already exists.' : error.message)
      return
    }

    const branch = data as Branch
    setBranches((current) => [...current, branch].sort((a, b) => a.name.localeCompare(b.name)))
    setForm((current) => ({ ...current, branchIds: [...current.branchIds, branch.id] }))
    setNewBranchName('')
  }

  async function addManagedMinistry() {
    const name = newManagedMinistryName.trim()

    if (!name) return

    const exists = ministries.some(
      (ministry) => ministry.name.toLowerCase() === name.toLowerCase(),
    )

    if (exists) {
      setMinistryMessage('A ministry with that name already exists.')
      return
    }

    const { data, error } = await supabase
      .from('ministries')
      .insert({ name })
      .select('id, name')
      .single()

    if (error) {
      setMinistryMessage(
        error.code === '23505'
          ? 'A ministry with that name already exists.'
          : error.message,
      )
      return
    }

    const ministry = data as Ministry
    setMinistries((current) =>
      [...current, ministry].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setNewManagedMinistryName('')
    setMinistryMessage(`${ministry.name} was added.`)
  }

  async function addManagedBranch() {
    const name = newManagedBranchName.trim()
    if (!name) return

    if (branches.some((branch) => branch.name.toLowerCase() === name.toLowerCase())) {
      setBranchMessage('A branch with that name already exists.')
      return
    }

    const { data, error } = await supabase
      .from('branches')
      .insert({ name })
      .select('id, name')
      .single()

    if (error) {
      setBranchMessage(error.code === '23505' ? 'A branch with that name already exists.' : error.message)
      return
    }

    const branch = data as Branch
    setBranches((current) => [...current, branch].sort((a, b) => a.name.localeCompare(b.name)))
    setNewManagedBranchName('')
    setBranchMessage(`${branch.name} was added.`)
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

  async function saveMemberBranches(memberId: string) {
    const { error: deleteError } = await supabase
      .from('member_branches')
      .delete()
      .eq('member_id', memberId)

    if (deleteError) return deleteError

    const { error: insertError } = await supabase
      .from('member_branches')
      .insert(form.branchIds.map((branchId) => ({ member_id: memberId, branch_id: branchId })))

    return insertError
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setContactFieldErrors({})

    if (form.branchIds.length === 0) {
      setMessage('Choose at least one branch before saving this member.')
      return
    }

    const email = form.email.trim().toLowerCase()
    const enteredMobile = form.mobile.trim()

    if (email && !isValidEmail(email)) {
      setContactFieldErrors({
        email: 'Enter an email address with @ that ends in .com.',
      })
      return
    }

    if (enteredMobile && !/^09\d{9}$/.test(enteredMobile)) {
      setContactFieldErrors({
        mobile: 'Use 09 followed by 9 digits.',
      })
      return
    }

    const duplicateMessage = await checkForDuplicates()

    if (duplicateMessage) {
      setContactFieldErrors(
        duplicateMessage.toLowerCase().includes('email')
          ? { email: duplicateMessage }
          : { mobile: duplicateMessage },
      )
      return
    }

    setSaving(true)

    const memberValues = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim().toLowerCase() || null,
      mobile: form.mobile.trim() || null,
      status: form.status,
      admin_note: form.adminNote.trim() || null,
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

    const branchError = await saveMemberBranches(memberId)

    if (branchError) {
      setMessage(branchError.message)
      setSaving(false)
      return
    }

    await loadData()
    closeForm()
    setSaving(false)
  }

  async function toggleStar(member: Member) {
    const { error } = await supabase
      .from('members')
      .update({ is_starred: !member.is_starred })
      .eq('id', member.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMembers((current) =>
      current.map((item) =>
        item.id === member.id
          ? { ...item, is_starred: !item.is_starred }
          : item,
      ),
    )
  }

  async function loadMemberAttendance(memberId: string, page = 1) {
    const { data, error, count } = await supabase
      .from('attendance')
      .select(`
        id,
        checked_in_at,
        status,
        events (
          name,
          starts_at
        )
      `, { count: 'exact' })
      .eq('member_id', memberId)
      .order('checked_in_at', { ascending: false })
      .range(
        (page - 1) * attendancePageSize,
        page * attendancePageSize - 1,
      )

    if (error) {
      setMessage(error.message)
    } else {
      const records = (data ?? []) as unknown as AttendanceRecord[]
      setMemberAttendance(records)
      setAttendanceTotal(count ?? 0)
    }
  }

  async function openMemberDetails(member: Member) {
    setDetailMember(member)
    setMemberAttendance([])
    setAttendanceTotal(0)
    setAttendancePage(1)
    setDetailsLoading(true)

    await loadMemberAttendance(member.id, 1)

    setDetailsLoading(false)
  }

  async function goToAttendancePage(page: number) {
    if (!detailMember) return

    setDetailsLoading(true)
    await loadMemberAttendance(detailMember.id, page)
    setAttendancePage(page)
    setDetailsLoading(false)
  }

  function toggleMemberSelection(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    )
  }

  function toggleVisibleMemberSelection() {
    const visibleIds = visibleMembers.map((member) => member.id)
    const everyVisibleMemberIsSelected = visibleIds.every((id) =>
      selectedMemberIds.includes(id),
    )

    setSelectedMemberIds((current) =>
      everyVisibleMemberIsSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    )
  }

  function closeBulkMode() {
    setSelectedMemberIds([])
    setBulkMode(false)
  }

  async function updateSelectedMembersStatus(status: 'active' | 'inactive') {
    if (selectedMemberIds.length === 0) return

    setBulkSaving(true)
    const { error } = await supabase
      .from('members')
      .update({ status })
      .in('id', selectedMemberIds)

    if (error) {
      setMessage(error.message)
      setBulkSaving(false)
      return
    }

    setSelectedMemberIds([])
    setBulkSaving(false)
    await loadData()
  }

  async function deleteMember() {
    if (!deleteTarget) return

    if (deleteConfirmation.trim() !== memberName(deleteTarget)) return

    setSaving(true)
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', deleteTarget.id)

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setDeleteTarget(null)
    setDeleteConfirmation('')
    setSaving(false)
    closeForm()
    await loadData()
  }

  const bulkDeletePhrase = `DELETE ${selectedMemberIds.length} MEMBERS`

  async function deleteSelectedMembers() {
    if (bulkDeleteConfirmation.trim() !== bulkDeletePhrase) return

    setBulkSaving(true)
    const { error } = await supabase
      .from('members')
      .delete()
      .in('id', selectedMemberIds)

    if (error) {
      setMessage(error.message)
      setBulkSaving(false)
      return
    }

    setSelectedMemberIds([])
    setBulkDeleteConfirmation('')
    setShowBulkDelete(false)
    setBulkSaving(false)
    await loadData()
  }

  function ministryMemberCount(ministryId: string) {
    return members.filter((member) =>
      getMemberMinistries(member).some(
        (ministry) => ministry.id === ministryId,
      ),
    ).length
  }

  function branchMemberCount(branchId: string) {
    return members.filter((member) =>
      getMemberBranches(member).some((branch) => branch.id === branchId),
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
        item.id !== ministry.id &&
        item.name.toLowerCase() === name.toLowerCase(),
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

  function beginBranchRename(branch: Branch) {
    setBranchMessage('')
    setBlockedBranchId('')
    setRenamingBranchId(branch.id)
    setBranchRenameValue(branch.name)
  }

  async function saveBranchRename(branch: Branch) {
    const name = branchRenameValue.trim()
    if (!name) {
      setBranchMessage('A branch name is required.')
      return
    }
    if (branches.some((item) => item.id !== branch.id && item.name.toLowerCase() === name.toLowerCase())) {
      setBranchMessage('A branch with that name already exists.')
      return
    }
    const { error } = await supabase.from('branches').update({ name }).eq('id', branch.id)
    if (error) {
      setBranchMessage(error.message)
      return
    }
    setRenamingBranchId('')
    setBranchRenameValue('')
    setBranchMessage('Branch renamed successfully.')
    await loadData()
  }

  async function deleteBranch(branch: Branch) {
    const count = branchMemberCount(branch.id)
    if (count > 0) {
      setBlockedBranchId(branch.id)
      setBranchMessage(`${branch.name} cannot be deleted because it is assigned to ${count} member${count === 1 ? '' : 's'}, including inactive members if applicable.`)
      return
    }
    const confirmed = window.confirm(`Delete the branch "${branch.name}"? This cannot be undone.`)
    if (!confirmed) return
    const { error } = await supabase.from('branches').delete().eq('id', branch.id)
    if (error) {
      setBranchMessage(error.message)
      return
    }
    setBranchMessage(`${branch.name} was deleted.`)
    await loadData()
  }

  function viewAffectedBranchMembers(branchId: string) {
    setBranchFilter(branchId)
    setShowBranchManager(false)
    setBlockedBranchId('')
    setBranchMessage('')
  }

  function cycleSort() {
    const currentIndex = sortCycle.indexOf(sortBy)
    const nextIndex = (currentIndex + 1) % sortCycle.length

    setSortBy(sortCycle[nextIndex])
  }

  async function downloadMemberId(member: Member, svgId = 'member-qr-code') {
    const svg = document.getElementById(
      svgId,
    ) as SVGSVGElement | null

    if (!svg) return

    const content = new XMLSerializer().serializeToString(svg)
    const qrBlob = new Blob([content], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const qrUrl = URL.createObjectURL(qrBlob)
    const qrImage = new Image()

    try {
      await new Promise<void>((resolve, reject) => {
        qrImage.onload = () => resolve()
        qrImage.onerror = () => reject(new Error('Could not create the member ID.'))
        qrImage.src = qrUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = 1600
      canvas.height = 1000
      const context = canvas.getContext('2d')

      if (!context) throw new Error('Could not create the member ID.')

      const roundedRectangle = (
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
      ) => {
        context.beginPath()
        context.roundRect(x, y, width, height, radius)
      }

      context.fillStyle = '#f7fbfa'
      context.fillRect(0, 0, canvas.width, canvas.height)

      context.fillStyle = '#167b72'
      roundedRectangle(0, 0, canvas.width, 180, 0)
      context.fill()

      context.fillStyle = '#d9f0ec'
      context.font = '600 28px system-ui, sans-serif'
      context.fillText('LIFECITY CHURCH', 100, 72)
      context.fillStyle = '#ffffff'
      context.font = '700 54px system-ui, sans-serif'
      context.fillText('MEMBER ID', 100, 128)

      context.fillStyle = '#173f3b'
      context.font = '700 62px system-ui, sans-serif'
      const printedName = memberName(member)
      context.fillText(
        printedName.length > 25 ? `${printedName.slice(0, 24)}…` : printedName,
        100,
        300,
      )
      context.fillStyle = '#64817d'
      context.font = '500 34px system-ui, sans-serif'
      context.fillText(member.member_number, 100, 350)

      context.fillStyle = '#78908c'
      context.font = '600 25px system-ui, sans-serif'
      context.fillText('MEMBER STATUS', 100, 455)
      roundedRectangle(100, 478, 182, 54, 27)
      context.fillStyle = member.status === 'active' ? '#e7f8ee' : '#fff3df'
      context.fill()
      context.fillStyle = member.status === 'active' ? '#187b4c' : '#9a5a11'
      context.font = '700 25px system-ui, sans-serif'
      context.fillText(member.status === 'active' ? 'ACTIVE' : 'INACTIVE', 127, 514)

      context.fillStyle = '#78908c'
      context.font = '600 25px system-ui, sans-serif'
      context.fillText('MINISTRIES', 100, 625)
      const ministryText = getMemberMinistries(member)
        .map((ministry) => ministry.name)
        .join(' • ') || 'Not assigned'
      context.fillStyle = '#365c57'
      context.font = '500 29px system-ui, sans-serif'
      context.fillText(ministryText.slice(0, 48), 100, 676)

      context.fillStyle = '#78908c'
      context.font = '600 25px system-ui, sans-serif'
      context.fillText('REGISTERED', 100, 790)
      context.fillStyle = '#365c57'
      context.font = '500 29px system-ui, sans-serif'
      context.fillText(formatDate(member.created_at), 100, 840)

      roundedRectangle(790, 200, 720, 680, 28)
      context.fillStyle = '#ffffff'
      context.fill()
      context.strokeStyle = '#dbece9'
      context.lineWidth = 3
      context.stroke()
      context.fillStyle = '#315854'
      context.font = '700 27px system-ui, sans-serif'
      context.textAlign = 'center'
      context.fillText('SCAN FOR ATTENDANCE', 1150, 270)
      context.drawImage(qrImage, 880, 300, 540, 540)
      context.fillStyle = '#718985'
      context.font = '500 22px system-ui, sans-serif'
      context.fillText('Keep this member ID private.', 1150, 862)
      context.textAlign = 'left'

      context.fillStyle = '#eaf4f2'
      context.fillRect(0, 920, canvas.width, 80)
      context.fillStyle = '#56736f'
      context.font = '500 22px system-ui, sans-serif'
      context.fillText('LifeCity Attendance Monitoring  •  Digital member ID', 100, 970)

      const cardBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )

      if (!cardBlob) throw new Error('Could not create the member ID.')

      const cardUrl = URL.createObjectURL(cardBlob)
      const link = document.createElement('a')

      link.href = cardUrl
      link.download = `lifecity-member-id-${member.member_number}.png`
      link.click()

      window.setTimeout(() => URL.revokeObjectURL(cardUrl), 1000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the member ID.')
    } finally {
      URL.revokeObjectURL(qrUrl)
    }
  }

  const visibleMembers = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = members.filter((member) => {
      const memberMinistries = getMemberMinistries(member)
      const memberBranches = getMemberBranches(member)

      const matchesSearch =
        !query ||
        [
          member.first_name,
          member.last_name,
          member.member_number,
          member.email ?? '',
          member.mobile ?? '',
          ...memberMinistries.map((ministry) => ministry.name),
          ...memberBranches.map((branch) => branch.name),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)

      const matchesMinistry =
        ministryFilter === 'all' ||
        (ministryFilter === 'none'
          ? memberMinistries.length === 0
          : memberMinistries.some((ministry) => ministry.id === ministryFilter))

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'vip'
          ? member.is_starred
          : member.status === statusFilter)

      const matchesBranch =
        branchFilter === 'all' || memberBranches.some((branch) => branch.id === branchFilter)

      return matchesSearch && matchesMinistry && matchesBranch && matchesStatus
    })

    return [...filtered].sort((a, b) => {
      if (a.is_starred !== b.is_starred) {
        return a.is_starred ? -1 : 1
      }

      const nameCompare = memberName(a).localeCompare(memberName(b))

      if (sortBy === 'name-desc') return -nameCompare

      if (sortBy === 'added-oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }

      if (sortBy === 'added-newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }

      return nameCompare
    })
  }, [members, search, ministryFilter, branchFilter, statusFilter, sortBy])

  return (
    <>
      <section className="members-editorial-hero">
        <div className="members-hero-copy">
          <p className="eyebrow">Member directory</p>
          <h1>Members</h1>
          <p>
            Manage contact details, ministries, member status, and private QR
            codes.
          </p>
          <span className="members-hero-caption">
            {members.filter((member) => member.status === 'active').length} active people in your directory
          </span>

          <div className="members-hero-tools">
          <button
            className={
              showImport
                ? 'member-hero-tool is-open'
                : 'member-hero-tool'
            }
            onClick={toggleImport}
          >
            {showImport ? <X size={18} /> : <Download size={18} />}
            {showImport ? 'Close import' : 'Import CSV'}
          </button>

          <button
            className={`member-hero-tool${showMinistryManager ? ' is-open' : ''}`}
            onClick={toggleMinistryManager}
          >
            <Settings2 size={18} />
            {showMinistryManager ? 'Close ministries' : 'Manage ministries'}
          </button>

          <button
            className={`member-hero-tool${showBranchManager ? ' is-open' : ''}`}
            onClick={toggleBranchManager}
          >
            <Settings2 size={18} />
            {showBranchManager ? 'Close branches' : 'Manage branches'}
          </button>
          </div>
        </div>

        <button className="members-create-action" onClick={openAddForm}>
          <span className="members-create-action-kicker">Grow the directory</span>
          <strong>Add member</strong>
          <span className="members-create-action-note">Create a private QR profile</span>
          <span className="members-create-action-icon" aria-hidden="true">
            <UserPlus size={22} />
          </span>
        </button>

        <span className="members-hero-orbit" aria-hidden="true" />
        <span className="members-hero-spark members-hero-spark-one" aria-hidden="true">✦</span>
        <span className="members-hero-spark members-hero-spark-two" aria-hidden="true">✦</span>
      </section>

      {showImport && (
        <div ref={importRef}>
          <MemberImport
            onImported={loadData}
            onClose={() => setShowImport(false)}
          />
        </div>
      )}

      {showMinistryManager && (
        <section className="ministry-manager-card" ref={ministryManagerRef}>
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

          <div className="ministry-create-row">
            <input
              value={newManagedMinistryName}
              onChange={(event) => setNewManagedMinistryName(event.target.value)}
              placeholder="Add a ministry, e.g. Worship Team"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void addManagedMinistry()
                }
              }}
            />
            <button
              className="secondary-button"
              type="button"
              onClick={() => void addManagedMinistry()}
            >
              <Plus size={17} />
              Add ministry
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
                              <Trash2 size={18} />
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

      {showBranchManager && (
        <section className="ministry-manager-card branch-manager-card" ref={branchManagerRef}>
          <div className="ministry-manager-heading">
            <div>
              <p className="eyebrow">Directory settings</p>
              <h2>Manage branches</h2>
              <p className="muted">
                Branches work like ministries. A branch can only be deleted after it is removed from every member.
              </p>
            </div>
            <button className="icon-button" type="button" onClick={() => setShowBranchManager(false)} aria-label="Close branch management">
              <X size={20} />
            </button>
          </div>

          <div className="ministry-create-row">
            <input
              value={newManagedBranchName}
              onChange={(event) => setNewManagedBranchName(event.target.value)}
              placeholder="Add a branch, e.g. LifeCity - North"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void addManagedBranch()
                }
              }}
            />
            <button className="secondary-button" type="button" onClick={() => void addManagedBranch()}>
              <Plus size={17} />
              Add branch
            </button>
          </div>

          {branchMessage && (
            <div className="ministry-message">
              <p>{branchMessage}</p>
              {blockedBranchId && (
                <button className="secondary-button" onClick={() => viewAffectedBranchMembers(blockedBranchId)}>
                  View affected members
                </button>
              )}
            </div>
          )}

          <div className="ministry-management-list">
            {branches.map((branch) => {
              const count = branchMemberCount(branch.id)
              const isRenaming = renamingBranchId === branch.id
              return (
                <article className="ministry-management-row" key={branch.id}>
                  <div className="ministry-management-name">
                    {isRenaming ? (
                      <input value={branchRenameValue} onChange={(event) => setBranchRenameValue(event.target.value)} autoFocus />
                    ) : (
                      <strong>{branch.name}</strong>
                    )}
                    <span>{count} assigned member{count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="ministry-management-actions">
                    {isRenaming ? (
                      <>
                        <button className="edit-icon-button save-ministry-button" onClick={() => void saveBranchRename(branch)} aria-label={`Save ${branch.name}`} title="Save name"><Check size={18} /></button>
                        <button className="edit-icon-button" onClick={() => { setRenamingBranchId(''); setBranchRenameValue('') }} aria-label="Cancel rename" title="Cancel"><X size={18} /></button>
                      </>
                    ) : (
                      <>
                        <button className="edit-icon-button" onClick={() => beginBranchRename(branch)} aria-label={`Rename ${branch.name}`} title="Rename branch"><Pencil size={18} /></button>
                        <button className="delete-icon-button" onClick={() => void deleteBranch(branch)} aria-label={`Delete ${branch.name}`} title="Delete branch"><Trash2 size={18} /></button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {showForm && (
        <section className="form-card member-editor-card" ref={memberFormRef}>
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
              <span className="field-label-text">
                First name <span className="required-mark">*</span>
              </span>
              <input
                value={form.firstName}
                onChange={(event) =>
                  setForm({ ...form, firstName: event.target.value })
                }
                required
              />
            </label>

            <label>
              <span className="field-label-text">
                Last name <span className="required-mark">*</span>
              </span>
              <input
                value={form.lastName}
                onChange={(event) =>
                  setForm({ ...form, lastName: event.target.value })
                }
                required
              />
            </label>

            <label>
              <span className="contact-field-label">
                <span>Email</span>
                {contactFieldErrors.email && (
                  <span className="field-error">{contactFieldErrors.email}</span>
                )}
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => {
                  setForm({ ...form, email: event.target.value })
                  setContactFieldErrors((current) => ({
                    ...current,
                    email: undefined,
                  }))
                }}
                className={contactFieldErrors.email ? 'input-error' : ''}
                aria-invalid={Boolean(contactFieldErrors.email)}
              />
            </label>

            <label>
              <span className="contact-field-label">
                <span>Mobile #</span>
                {contactFieldErrors.mobile && (
                  <span className="field-error">{contactFieldErrors.mobile}</span>
                )}
              </span>
              <input
                value={form.mobile}
                onChange={(event) => {
                  setForm({ ...form, mobile: event.target.value })
                  setContactFieldErrors((current) => ({
                    ...current,
                    mobile: undefined,
                  }))
                }}
                inputMode="numeric"
                maxLength={11}
                className={contactFieldErrors.mobile ? 'input-error' : ''}
                aria-invalid={Boolean(contactFieldErrors.mobile)}
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

            <label className="wide-field admin-note-field">
              <span className="field-label-text">Admin note</span>
              <span className="admin-note-help">
                Private to admins. This will not appear on the member ID.
              </span>
              <textarea
                value={form.adminNote}
                onChange={(event) =>
                  setForm({ ...form, adminNote: event.target.value })
                }
                placeholder="Add a helpful reminder about this member"
                rows={3}
                maxLength={1000}
              />
            </label>

            <section className="ministry-picker wide-field branch-picker">
              <div className="ministry-picker-heading">
                <div>
                  <strong>Branches <span className="required-mark">*</span></strong>
                  <p>Choose at least one branch this member serves in.</p>
                </div>
              </div>

              {branches.length === 0 ? (
                <p className="muted">Add your first branch below.</p>
              ) : (
                <div className="ministry-options">
                  {branches.map((branch) => {
                    const checked = form.branchIds.includes(branch.id)
                    return (
                      <label className={`ministry-option ${checked ? 'selected' : ''}`} key={branch.id}>
                        <input type="checkbox" checked={checked} onChange={() => toggleBranch(branch.id)} />
                        <span>{branch.name}</span>
                        {checked && <Check size={15} />}
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="add-ministry-row">
                <input
                  value={newBranchName}
                  onChange={(event) => setNewBranchName(event.target.value)}
                  placeholder="Add a new branch, e.g. LifeCity - North"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void addBranch()
                    }
                  }}
                />
                <button className="secondary-button" type="button" onClick={() => void addBranch()}>
                  <Plus size={17} />
                  Add branch
                </button>
              </div>
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
              {editingMember && (
                <button
                  type="button"
                  className="danger-button form-delete-button"
                  onClick={() => {
                    setDeleteConfirmation('')
                    setDeleteTarget(editingMember)
                  }}
                >
                  <Trash2 size={18} />
                  Delete member
                </button>
              )}

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
                <option value="none">No ministry</option>
                {ministries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-select">
              <Settings2 size={17} />
              <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>

            <label className="filter-select">
              <Star size={17} />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All members</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="vip">VIP</option>
              </select>
            </label>

            <button
              className={`bulk-mode-button ${bulkMode ? 'is-active' : ''}`}
              type="button"
              onClick={() => (bulkMode ? closeBulkMode() : setBulkMode(true))}
            >
              <ListChecks size={17} />
              {bulkMode ? 'Done' : 'Bulk actions'}
            </button>
          </div>
        </div>

        {bulkMode && (
          <div className="bulk-action-bar">
            <span className="bulk-selection-count">
              {selectedMemberIds.length === 0
                ? 'Select members to begin'
                : `${selectedMemberIds.length} selected`}
            </span>
            {selectedMemberIds.length > 0 && (
              <>
                <button
                  className="bulk-action-button"
                  disabled={bulkSaving}
                  onClick={() => void updateSelectedMembersStatus('active')}
                >
                  Mark active
                </button>
                <button
                  className="bulk-action-button"
                  disabled={bulkSaving}
                  onClick={() => void updateSelectedMembersStatus('inactive')}
                >
                  Mark inactive
                </button>
                <button
                  className="bulk-delete-button"
                  disabled={bulkSaving}
                  onClick={() => {
                    setBulkDeleteConfirmation('')
                    setShowBulkDelete(true)
                  }}
                >
                  Delete selected
                </button>
                <button
                  className="text-button"
                  onClick={() => setSelectedMemberIds([])}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}

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
          <div className={`member-list ${bulkMode ? 'is-bulk-mode' : ''}`}>
            <div className="member-list-heading">
              {bulkMode && (
                <label className="member-select-control" title="Select visible members">
                  <input
                    type="checkbox"
                    checked={
                      visibleMembers.length > 0 &&
                      visibleMembers.every((member) =>
                        selectedMemberIds.includes(member.id),
                      )
                    }
                    onChange={toggleVisibleMemberSelection}
                    aria-label="Select visible members"
                  />
                </label>
              )}

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
              <span>Branches</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {visibleMembers.map((member) => {
              const memberMinistries = getMemberMinistries(member)
                const memberBranches = getMemberBranches(member)
                const displayedMinistries = memberMinistries.slice(0, 2)
                const remainingMinistryCount =
                  memberMinistries.length - displayedMinistries.length

                return (
                <article className="member-row member-management-row" key={member.id}>
                  {bulkMode && (
                    <label className="member-select-control">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(member.id)}
                        onChange={() => toggleMemberSelection(member.id)}
                        aria-label={`Select ${memberName(member)}`}
                      />
                    </label>
                  )}

                  <div className="avatar">
                    {member.first_name[0]}
                    {member.last_name[0]}
                  </div>

                  <div className="member-name">
                    <div className="member-name-title">
                      <button
                        className={`member-star-button ${
                          member.is_starred ? 'is-starred' : ''
                        }`}
                        onClick={() => void toggleStar(member)}
                        aria-label={
                          member.is_starred
                            ? `Remove VIP status from ${memberName(member)}`
                            : `Mark ${memberName(member)} as VIP`
                        }
                        title={
                          member.is_starred
                            ? 'Remove VIP pin'
                            : 'Pin as VIP member'
                        }
                      >
                        <Star
                          size={18}
                          fill={member.is_starred ? 'currentColor' : 'none'}
                        />
                      </button>
                      <strong>{memberName(member)}</strong>
                      {member.admin_note?.trim() && (
                        <button
                          className="member-note-button"
                          onClick={() => setNoteMember(member)}
                          aria-label={`View admin note for ${memberName(member)}`}
                          title="View admin note"
                        >
                          <StickyNote size={17} />
                        </button>
                      )}
                    </div>
                    <span>
                      {member.member_number} · Added {formatDate(member.created_at)}
                    </span>

                    {(member.email || member.mobile) && (
                      <small>
                        {[member.email, member.mobile].filter(Boolean).join(' · ')}
                      </small>
                    )}
                  </div>

                  <div className="member-ministries">
                    {memberMinistries.length > 0 ? (
                      <>
                        <span className="ministry-inline-list">
                          {displayedMinistries
                            .map((ministry) => ministry.name)
                            .join(', ')}
                        </span>

                        {remainingMinistryCount > 0 && (
                          <span
                            className="more-ministries-label"
                          >
                            +{remainingMinistryCount} more
                          </span>
                        )}
                      </>
                      ) : (
                        <span className="no-ministry">None</span>
                      )}
                  </div>

                  <div className="member-ministries member-branches">
                    {memberBranches.length > 0 ? (
                      <span className="ministry-inline-list">
                        {memberBranches.map((branch) => branch.name).join(', ')}
                      </span>
                    ) : (
                      <span className="no-ministry">None</span>
                    )}
                  </div>

                  <span className={`member-status-icon ${member.status}`} title={member.status === 'active' ? 'Active member' : 'Inactive member'} aria-label={member.status === 'active' ? 'Active member' : 'Inactive member'}>
                    {member.status === 'active' ? <Check size={16} /> : <X size={16} />}
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
                      className="edit-icon-button member-view-button"
                      onClick={() => void openMemberDetails(member)}
                      aria-label={`View ${memberName(member)}`}
                      title={`View ${memberName(member)}`}
                    >
                      <Eye size={18} />
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
              onClick={() => void downloadMemberId(selectedMember)}
            >
              <Download size={18} />
              Download member ID
            </button>
          </section>
        </div>
      )}

      {detailMember && (
        <div className="modal-backdrop" onMouseDown={() => setDetailMember(null)}>
          <section
            className="member-details-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="member-details-heading">
              <div className="avatar details-avatar">
                {detailMember.first_name[0]}
                {detailMember.last_name[0]}
              </div>
              <div>
                <p className="eyebrow">Member details</p>
                <h2>{memberName(detailMember)}</h2>
                <p className="muted">{detailMember.member_number}</p>
              </div>
              <div className="member-details-actions">
                <button
                  className="secondary-button details-edit-button"
                  onClick={() => {
                    setDetailMember(null)
                    openEditForm(detailMember)
                  }}
                >
                  <Pencil size={17} />
                  Edit
                </button>
                <button
                  className="icon-button details-close-button"
                  onClick={() => setDetailMember(null)}
                  aria-label="Close member details"
                  title="Close details"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="member-details-grid">
              <section className="member-details-section">
                <h3>Contact</h3>
                <dl className="member-details-list">
                  <div>
                    <dt>Email</dt>
                    <dd>{detailMember.email || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Mobile #</dt>
                    <dd>{detailMember.mobile || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Registered</dt>
                    <dd>{formatDate(detailMember.created_at)}</dd>
                  </div>
                </dl>
              </section>

              <section className="member-details-section qr-details-section">
                <h3>Private QR code</h3>
                <div className="details-qr-frame">
                  <QRCodeSVG
                    id="member-details-qr-code"
                    value={`att:${detailMember.qr_token}`}
                    size={142}
                    level="M"
                    includeMargin
                  />
                </div>
                <button
                  className="text-button details-download-button"
                  onClick={() =>
                    void downloadMemberId(
                      detailMember,
                      'member-details-qr-code',
                    )
                  }
                >
                  <Download size={16} />
                  Download member ID
                </button>
              </section>
            </div>

            <section className="member-details-section">
              <h3>Ministries</h3>
              <div className="details-ministry-list">
                {getMemberMinistries(detailMember).length === 0 ? (
                  <span className="no-ministry">No ministry assigned</span>
                ) : (
                  getMemberMinistries(detailMember).map((ministry) => (
                    <span className="details-ministry-pill" key={ministry.id}>
                      {ministry.name}
                    </span>
                  ))
                )}
              </div>
            </section>

            <section className="member-details-section">
              <h3>Branches</h3>
              <div className="details-ministry-list">
                {getMemberBranches(detailMember).map((branch) => (
                  <span className="details-ministry-pill" key={branch.id}>
                    {branch.name}
                  </span>
                ))}
              </div>
            </section>

            {detailMember.admin_note?.trim() && (
              <section className="member-details-section admin-note-details">
                <div className="admin-note-heading">
                  <div>
                    <h3>Admin note</h3>
                    <p className="muted">Private to administrators.</p>
                  </div>
                  <button
                    className="edit-icon-button"
                    onClick={() => {
                      setDetailMember(null)
                      openEditForm(detailMember)
                    }}
                    aria-label={`Edit admin note for ${memberName(detailMember)}`}
                    title="Edit admin note"
                  >
                    <Pencil size={17} />
                  </button>
                </div>
                <p className="admin-note-copy">{detailMember.admin_note}</p>
              </section>
            )}

            <section className="member-details-section attendance-summary-section">
              <div className="attendance-summary-heading">
                <div>
                  <h3>Attendance</h3>
                  <p className="muted">Check-in history for this member.</p>
                </div>
                <strong className="attendance-total">
                  {detailsLoading ? '…' : attendanceTotal} total
                </strong>
              </div>

              {detailsLoading ? (
                <p className="muted">Loading attendance…</p>
              ) : memberAttendance.length === 0 ? (
                <p className="muted">No attendance recorded yet.</p>
              ) : (
                <>
                  <div className="attendance-table">
                    <div className="attendance-table-heading">
                      <span>Event</span>
                      <span>Checked in</span>
                      <span>Status</span>
                    </div>
                    {memberAttendance.map((record) => (
                      <div className="attendance-table-row" key={record.id}>
                        <strong>{record.events?.name ?? 'Event'}</strong>
                        <span>{formatDateTime(record.checked_in_at)}</span>
                        <span className="attendance-record-status">{record.status}</span>
                      </div>
                    ))}
                  </div>

                  {attendanceTotal > attendancePageSize && (
                    <div className="attendance-pagination">
                      <button
                        className="text-button"
                        disabled={attendancePage === 1}
                        onClick={() => void goToAttendancePage(attendancePage - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        Page {attendancePage} of{' '}
                        {Math.ceil(attendanceTotal / attendancePageSize)}
                      </span>
                      <button
                        className="text-button"
                        disabled={
                          attendancePage >=
                          Math.ceil(attendanceTotal / attendancePageSize)
                        }
                        onClick={() => void goToAttendancePage(attendancePage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </section>
        </div>
      )}

      {noteMember && (
        <div className="modal-backdrop" onMouseDown={() => setNoteMember(null)}>
          <section
            className="member-note-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setNoteMember(null)}
              aria-label="Close admin note"
            >
              <X size={20} />
            </button>
            <p className="eyebrow">Private admin note</p>
            <h2>{memberName(noteMember)}</h2>
            <p className="admin-note-copy">{noteMember.admin_note}</p>
            <div className="confirmation-actions">
              <button className="secondary-button" onClick={() => setNoteMember(null)}>
                Close
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setNoteMember(null)
                  openEditForm(noteMember)
                }}
              >
                <Pencil size={18} />
                Edit note
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onMouseDown={() => setDeleteTarget(null)}>
          <section
            className="confirmation-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setDeleteTarget(null)}
              aria-label="Close delete confirmation"
            >
              <X size={20} />
            </button>
            <p className="eyebrow">Permanent action</p>
            <h2>Delete {memberName(deleteTarget)}?</h2>
            <p className="muted">
              This permanently removes the member and their related attendance
              records. Type the member’s full name to confirm.
            </p>
            <label className="confirmation-input">
              Type <strong>{memberName(deleteTarget)}</strong>
              <input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <div className="confirmation-actions">
              <button className="secondary-button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={deleteConfirmation.trim() !== memberName(deleteTarget) || saving}
                onClick={() => void deleteMember()}
              >
                <Trash2 size={18} />
                {saving ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showBulkDelete && (
        <div className="modal-backdrop" onMouseDown={() => setShowBulkDelete(false)}>
          <section
            className="confirmation-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setShowBulkDelete(false)}
              aria-label="Close bulk delete confirmation"
            >
              <X size={20} />
            </button>
            <p className="eyebrow">Permanent bulk action</p>
            <h2>Delete {selectedMemberIds.length} members?</h2>
            <p className="muted">
              This removes every selected member and their related attendance
              records. To continue, type the exact phrase below.
            </p>
            <label className="confirmation-input">
              Type <strong>{bulkDeletePhrase}</strong>
              <input
                value={bulkDeleteConfirmation}
                onChange={(event) => setBulkDeleteConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <div className="confirmation-actions">
              <button className="secondary-button" onClick={() => setShowBulkDelete(false)}>
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={bulkDeleteConfirmation.trim() !== bulkDeletePhrase || bulkSaving}
                onClick={() => void deleteSelectedMembers()}
              >
                <Trash2 size={18} />
                {bulkSaving ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
