import ExportPanel from './ExportPanel'
import { MotionPresence } from '../lib/motion'
// Change ID: LC-P08N-v1
// UI refinement: LC-P08A-UI-v2
// Change ID: LC-P08A-v1
// Change ID: LC-P07A-v1
import { uiMessage, uiStatus } from '../lib/uiText'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
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
import { memberCsv, type ExportMember } from '../lib/memberCsv'

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
  report_snapshot?: {service_name?: string | null} | null
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
  'added-oldest': 'Added: Oldest',
  'added-newest': 'Added: Newest',
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
  const [csvBusy,setCsvBusy]=useState(false)
  const [csvMessage,setCsvMessage]=useState('')
  const [csvError,setCsvError]=useState('')
  const csvLock=useRef(false)
  const csvMounted=useRef(true)
  useEffect(()=>{csvMounted.current=true;return()=>{csvMounted.current=false}},[])
  async function exportDirectory(detailed:boolean){
    if(csvLock.current)return
    csvLock.current=true;setCsvBusy(true);setCsvMessage('');setCsvError('')
    // Capture the current filter and sort selection before the request starts.
    const selectedSort=sortBy
    try{
      const {data,error}=await supabase.rpc('lc_export_members_v2',{p_search:search,p_ministry:ministryFilter,p_church:branchFilter,p_status:statusFilter,p_detailed:detailed,p_sort:selectedSort})
      if(error)throw error
      if(!csvMounted.current)return
      if(!data||!Array.isArray(data.rows))throw new Error('Invalid export response')
      const rows=data.rows as ExportMember[]
      if(!rows.length){setCsvMessage('No members match these filters.');return}
      const content=memberCsv(rows,detailed,'server')
      const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}))
      const link=document.createElement('a');link.href=url;link.download=`LifeCity-Members-${detailed?'Detailed':'Quick'}-${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(link)
      try{link.click()}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000)}
      setCsvMessage(`CSV prepared with ${rows.length.toLocaleString()} matching members across all pages. Your browser handles the download.`)
    }catch(failure){if(csvMounted.current)setCsvError((failure as {code?:string}).code==='P0001'?(failure as {message:string}).message:'Could not export members. Confirm LC-P08A-v1.sql is installed and your admin access is active, then try again.')}
    finally{csvLock.current=false;if(csvMounted.current)setCsvBusy(false)}
  }
  const [members, setMembers] = useState<Member[]>([])
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchLoadError, setBranchLoadError] = useState('')
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
  const [attendanceError, setAttendanceError] = useState('')
  const attendanceRequest = useRef(0)
  const detailMemberId = useRef<string | null>(null)
  useEffect(()=>()=>{attendanceRequest.current++;detailMemberId.current=null},[])
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
  const [managerDeleteTarget, setManagerDeleteTarget] = useState<
    { kind: 'ministry'; item: Ministry } | { kind: 'branch'; item: Branch } | null
  >(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [filterSpotlight, setFilterSpotlight] = useState<'ministry' | 'branch' | null>(null)
  const [memberPage, setMemberPage] = useState(1)
  const [membersPerPage, setMembersPerPage] = useState(25)
  const [searchQuery, setSearchQuery] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [directoryStats, setDirectoryStats] = useState({total:0,registered:0,active:0,page:1,ministry_counts:{} as Record<string,number>,branch_counts:{} as Record<string,number>})
  const requestSequence = useRef(0)
  const filterKey = JSON.stringify([searchQuery,ministryFilter,branchFilter,statusFilter,sortBy,membersPerPage])
  const requestKey = JSON.stringify([filterKey,memberPage,search.trim()])
  const currentRequestKey = useRef(requestKey)
  currentRequestKey.current = requestKey
  const pageRequest = {p_search:searchQuery,p_ministry:ministryFilter,p_church:branchFilter,p_status:statusFilter,p_sort:sortBy,p_page:memberPage,p_size:membersPerPage}
  const latestPageRequest = useRef({key:requestKey,params:pageRequest,pending:false})
  latestPageRequest.current = {key:requestKey,params:pageRequest,pending:search.trim() !== searchQuery}
  const [loadedKey, setLoadedKey] = useState('')
  const directoryBusy = loading || loadedKey !== requestKey || search.trim() !== searchQuery


  const importRef = useRef<HTMLDivElement | null>(null)
  const ministryManagerRef = useRef<HTMLElement | null>(null)
  const branchManagerRef = useRef<HTMLElement | null>(null)
  const directoryToolsRef = useRef<HTMLElement | null>(null)
  const memberFormRef = useRef<HTMLElement | null>(null)
  const directoryListRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setMemberPage(1)
    setSelectedMemberIds([])
  }, [search, ministryFilter, branchFilter, statusFilter, sortBy, membersPerPage])

  useEffect(() => {
    if (search.trim() === searchQuery) void loadData()
  }, [requestKey])

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

  function scrollToMemberFormStart() {
    // Wait for React to mount and lay out the form before measuring it. This
    // keeps both Register and Edit anchored to the top of the card instead of
    // preserving the previous position somewhere inside the form.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const form = memberFormRef.current
        if (!form) return

        const topbarHeight = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0
        const formTop = window.scrollY + form.getBoundingClientRect().top

        window.scrollTo({
          top: Math.max(0, formTop - topbarHeight - 16),
          behavior: 'smooth',
        })
      })
    })
  }

  async function loadData() {
    if (!csvMounted.current || latestPageRequest.current.pending) return
    const {key,params} = latestPageRequest.current
    const sequence = ++requestSequence.current
    const isCurrent = () => csvMounted.current && sequence === requestSequence.current && key === currentRequestKey.current
    setLoading(true)
    setDirectoryError('')
    try {
      const {data,error} = await supabase.rpc('lc_members_page', params)
      if (!isCurrent()) return
      if (error) throw error
      if (!data || !Array.isArray(data.rows) || !Array.isArray(data.ministries) || !Array.isArray(data.branches)) throw new Error('Invalid directory response')
      setMembers(data.rows as Member[])
      setMinistries(data.ministries as Ministry[])
      setBranches(data.branches as Branch[])
      setDirectoryStats({total:data.total,registered:data.registered,active:data.active,page:data.page,ministry_counts:data.ministry_counts,branch_counts:data.branch_counts})
      setBranchLoadError('')
    } catch {
      if (isCurrent()) {
        setDirectoryError('Could not load members. Please try again.')
        setBranchLoadError('Directory data is unavailable. Please retry loading members.')
      }
    } finally {
      if (isCurrent()) { setLoading(false); setLoadedKey(key) }
    }
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
    scrollToMemberFormStart()
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
    scrollToMemberFormStart()
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
    setShowMinistryManager(false)
    setShowBranchManager(false)

    if (nextOpen) {
      scrollToSection(directoryToolsRef)
    }
  }

  function toggleMinistryManager() {
    const nextOpen = !showMinistryManager
    setShowMinistryManager(nextOpen)
    setShowImport(false)
    setShowBranchManager(false)

    if (nextOpen) {
      scrollToSection(directoryToolsRef)
    }
  }

  function toggleBranchManager() {
    const nextOpen = !showBranchManager
    setShowBranchManager(nextOpen)
    setShowImport(false)
    setShowMinistryManager(false)

    if (nextOpen) scrollToSection(directoryToolsRef)
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
      setMessage(error.code === '23505' ? 'That church already exists.' : error.message)
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
      setBranchMessage('A church with that name already exists.')
      return
    }

    const { data, error } = await supabase
      .from('branches')
      .insert({ name })
      .select('id, name')
      .single()

    if (error) {
      setBranchMessage(error.code === '23505' ? 'A church with that name already exists.' : error.message)
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
      setMessage('Choose at least one church before saving this member.')
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

    await loadData()
  }

  async function loadMemberAttendance(memberId: string, page = 1) {
    const request=++attendanceRequest.current
    const isCurrent=()=>request===attendanceRequest.current && detailMemberId.current===memberId
    setDetailsLoading(true)
    setAttendanceError('')
    setMemberAttendance([])
    setAttendancePage(page)
    try {
      const fetchPage=(requestedPage:number)=>supabase.from('attendance')
        .select(`id, checked_in_at, status, report_snapshot, events (name, starts_at)`,{count:'exact'})
        .eq('member_id',memberId)
        .order('checked_in_at',{ascending:false})
        .order('id',{ascending:false})
        .range((requestedPage-1)*attendancePageSize,requestedPage*attendancePageSize-1)
      let response=await fetchPage(page)
      if(!isCurrent())return
      if(response.error)throw response.error
      const lastPage=Math.max(1,Math.ceil((response.count??0)/attendancePageSize))
      if(page>lastPage){
        page=lastPage
        response=await fetchPage(page)
        if(!isCurrent())return
        if(response.error)throw response.error
      }
      setMemberAttendance((response.data??[]) as unknown as AttendanceRecord[])
      setAttendanceTotal(response.count??0)
      setAttendancePage(page)
    }catch{
      if(isCurrent())setAttendanceError('Attendance history could not be loaded. Please try again.')
    }finally{
      if(isCurrent())setDetailsLoading(false)
    }
  }

  async function openMemberDetails(member: Member) {
    detailMemberId.current=member.id
    setDetailMember(member)
    setAttendanceTotal(0)
    await loadMemberAttendance(member.id,1)
  }

  function closeMemberDetails() {
    attendanceRequest.current++
    detailMemberId.current=null
    setDetailMember(null)
    setAttendanceError('')
    setDetailsLoading(false)
  }

  async function goToAttendancePage(page: number) {
    if(!detailMember)return
    await loadMemberAttendance(detailMember.id,Math.max(1,page))
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
    return directoryStats.ministry_counts[ministryId] ?? 0
  }

  function messageTone(message: string) {
    return /was added|was deleted|renamed successfully/i.test(message)
      ? 'is-success'
      : 'is-warning'
  }

  function managerMessageContent(message: string) {
    const subjectEnd = message.search(/\s+(was|cannot)\s/i)

    if (subjectEnd <= 0) return message

    return <><b style={{ fontWeight: 900 }}>{message.slice(0, subjectEnd)}</b>{message.slice(subjectEnd)}</>
  }

  function branchMemberCount(branchId: string) {
    return directoryStats.branch_counts[branchId] ?? 0
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
    if (directoryBusy || directoryError) {setMinistryMessage('Wait for the directory to finish loading, or retry if it failed.');return}
    const count = ministryMemberCount(ministry.id)

    if (count > 0) {
      setBlockedMinistryId(ministry.id)
      setMinistryMessage(
        `${ministry.name} cannot be deleted because it is assigned to ${count} member${count === 1 ? '' : 's'}, including inactive members if applicable.`,
      )
      scrollToSection(ministryManagerRef)
      return
    }

    setManagerDeleteTarget({ kind: 'ministry', item: ministry })
  }

  async function confirmManagerDelete() {
    if (!managerDeleteTarget) return
    if (directoryBusy || directoryError) {
      const notify = managerDeleteTarget.kind === 'ministry' ? setMinistryMessage : setBranchMessage
      notify('Wait for the directory to finish loading, or retry if it failed.')
      return
    }
    const assigned = managerDeleteTarget.kind === 'ministry' ? ministryMemberCount(managerDeleteTarget.item.id) : branchMemberCount(managerDeleteTarget.item.id)
    if (assigned > 0) {setManagerDeleteTarget(null);return}

    const { kind, item } = managerDeleteTarget
    const table = kind === 'ministry' ? 'ministries' : 'branches'
    const { error } = await supabase.from(table).delete().eq('id', item.id)

    if (error) {
      kind === 'ministry' ? setMinistryMessage(error.message) : setBranchMessage(error.message)
      return
    }

    if (kind === 'ministry') setMinistryMessage(`${item.name} was deleted.`)
    else setBranchMessage(`${item.name} was deleted.`)
    setManagerDeleteTarget(null)
    await loadData()
  }

  function viewAffectedMembers(ministryId: string) {
    setMinistryFilter(ministryId)
    setShowMinistryManager(false)
    setBlockedMinistryId('')
    setMinistryMessage('')
    setFilterSpotlight('ministry')
    window.setTimeout(() => {
      directoryListRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    }, 50)
    window.setTimeout(() => setFilterSpotlight(null), 1150)
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
      setBranchMessage('A church name is required.')
      return
    }
    if (branches.some((item) => item.id !== branch.id && item.name.toLowerCase() === name.toLowerCase())) {
      setBranchMessage('A church with that name already exists.')
      return
    }
    const { error } = await supabase.from('branches').update({ name }).eq('id', branch.id)
    if (error) {
      setBranchMessage(error.message)
      return
    }
    setRenamingBranchId('')
    setBranchRenameValue('')
    setBranchMessage('Church renamed successfully.')
    await loadData()
  }

  async function deleteBranch(branch: Branch) {
    if (directoryBusy || directoryError) {setBranchMessage('Wait for the directory to finish loading, or retry if it failed.');return}
    const count = branchMemberCount(branch.id)
    if (count > 0) {
      setBlockedBranchId(branch.id)
      setBranchMessage(`${branch.name} cannot be deleted because it is assigned to ${count} member${count === 1 ? '' : 's'}, including inactive members if applicable.`)
      scrollToSection(branchManagerRef)
      return
    }
    setManagerDeleteTarget({ kind: 'branch', item: branch })
  }

  function viewAffectedBranchMembers(branchId: string) {
    setBranchFilter(branchId)
    setShowBranchManager(false)
    setBlockedBranchId('')
    setBranchMessage('')
    setFilterSpotlight('branch')
    window.setTimeout(() => {
      directoryListRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    }, 50)
    window.setTimeout(() => setFilterSpotlight(null), 1150)
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

      const branchText = getMemberBranches(member)
        .map((branch) => branch.name)
        .join('  •  ') || 'LifeCity'

      const wrapName = (name: string, maxWidth: number, fontSize: number) => {
        context.font = `750 ${fontSize}px system-ui, sans-serif`
        const words = name.split(/\s+/).filter(Boolean)
        const lines: string[] = []
        let current = ''

        words.forEach((word) => {
          const next = current ? `${current} ${word}` : word
          if (context.measureText(next).width <= maxWidth || !current) {
            current = next
            return
          }
          lines.push(current)
          current = word
        })
        if (current) lines.push(current)

        if (lines.length <= 2) return lines
        const firstLine = lines[0]
        let secondLine = lines.slice(1).join(' ')
        while (secondLine.length > 1 && context.measureText(`${secondLine}…`).width > maxWidth) {
          secondLine = secondLine.slice(0, -1).trimEnd()
        }
        return [firstLine, `${secondLine}…`]
      }

      const background = context.createLinearGradient(0, 0, canvas.width, canvas.height)
      background.addColorStop(0, '#effbf8')
      background.addColorStop(.55, '#fbfdff')
      background.addColorStop(1, '#f4f1ff')
      context.fillStyle = background
      context.fillRect(0, 0, canvas.width, canvas.height)

      const cardFill = context.createLinearGradient(40, 40, 1560, 960)
      cardFill.addColorStop(0, 'rgba(255,255,255,.72)')
      cardFill.addColorStop(1, 'rgba(250,252,255,.74)')
      roundedRectangle(32, 30, 1536, 940, 42)
      context.fillStyle = cardFill
      context.fill()
      const cardBorder = context.createLinearGradient(32, 30, 1568, 970)
      cardBorder.addColorStop(0, '#9be3d7')
      cardBorder.addColorStop(.42, '#b8a5ef')
      cardBorder.addColorStop(.72, '#f3ca78')
      cardBorder.addColorStop(1, '#8fddd1')
      roundedRectangle(32, 30, 1536, 940, 42)
      context.lineWidth = 3
      context.strokeStyle = cardBorder
      context.stroke()

      context.strokeStyle = 'rgba(181, 166, 237, .38)'
      context.lineWidth = 2
      context.beginPath()
      context.arc(1380, -82, 250, 0, Math.PI * 2)
      context.stroke()
      context.strokeStyle = 'rgba(121, 217, 202, .13)'
      context.lineWidth = 52
      context.beginPath()
      context.arc(1380, -82, 310, 0, Math.PI * 2)
      context.stroke()

      const header = context.createLinearGradient(72, 60, 1528, 190)
      header.addColorStop(0, '#0f837a')
      header.addColorStop(.55, '#1a9a8d')
      header.addColorStop(1, '#7764bb')
      roundedRectangle(70, 58, 1460, 158, 34)
      context.fillStyle = header
      context.fill()

      // A small member icon aligned directly with the “MEMBER ID” line.
      context.strokeStyle = '#ffffff'
      context.lineWidth = 5
      context.lineCap = 'round'
      context.beginPath()
      context.arc(140, 142, 9, 0, Math.PI * 2)
      context.stroke()
      context.beginPath()
      context.moveTo(118, 169)
      context.bezierCurveTo(120, 154, 130, 151, 140, 151)
      context.bezierCurveTo(150, 151, 160, 154, 162, 169)
      context.stroke()
      context.lineCap = 'butt'

      context.fillStyle = 'rgba(255,255,255,.76)'
      context.font = '700 25px system-ui, sans-serif'
      context.fillText('LIFECITY CHURCH', 116, 114)
      context.fillStyle = '#ffffff'
      context.font = '800 50px system-ui, sans-serif'
      context.fillText('MEMBER ID', 180, 170)

      context.fillStyle = '#173f3b'
      const printedName = memberName(member)
      const nameSize = printedName.length > 34 ? 47 : printedName.length > 24 ? 54 : 62
      const nameLines = wrapName(printedName, 690, nameSize)
      nameLines.forEach((line, index) => context.fillText(line, 100, 330 + index * (nameSize + 10)))
      context.fillStyle = '#64817d'
      context.font = '600 30px system-ui, sans-serif'
      context.fillText(member.member_number, 100, nameLines.length === 2 ? 440 : 378)

      const chipY = nameLines.length === 2 ? 480 : 423
      context.font = '700 24px system-ui, sans-serif'
      roundedRectangle(100, chipY, Math.min(570, Math.max(196, context.measureText(branchText).width + 56)), 54, 27)
      context.fillStyle = '#e4f5f1'
      context.fill()
      context.fillStyle = '#287166'
      context.fillText(branchText.slice(0, 35), 128, chipY + 35)

      context.fillStyle = '#78908c'
      context.font = '600 25px system-ui, sans-serif'
      context.fillText('MINISTRIES', 100, 652)
      const ministryText = getMemberMinistries(member)
        .map((ministry) => ministry.name)
        .join(' • ') || 'Not Assigned'
      const ministryLines = wrapName(ministryText, 670, 24)
      context.fillStyle = '#365c57'
      context.font = '500 24px system-ui, sans-serif'
      ministryLines.forEach((line, index) => {
        context.fillText(line, 100, 703 + index * 31)
      })

      context.fillStyle = '#78908c'
      context.font = '600 25px system-ui, sans-serif'
      const registeredLabelY = ministryLines.length === 2 ? 800 : 788
      context.fillText('REGISTERED', 100, registeredLabelY)
      context.fillStyle = '#365c57'
      context.font = '500 29px system-ui, sans-serif'
      context.fillText(formatDate(member.created_at), 100, registeredLabelY + 51)

      roundedRectangle(910, 278, 520, 562, 34)
      context.fillStyle = '#ffffff'
      context.fill()
      context.strokeStyle = '#cfeae5'
      context.lineWidth = 3
      context.stroke()
      context.fillStyle = '#315854'
      context.font = '800 25px system-ui, sans-serif'
      context.textAlign = 'center'
      context.fillText('SCAN FOR ATTENDANCE', 1170, 354)
      context.drawImage(qrImage, 970, 375, 400, 400)
      context.fillStyle = '#718985'
      context.font = '600 20px system-ui, sans-serif'
      context.fillText('Private Member Token • Keep This ID Safe', 1170, 809)
      context.textAlign = 'left'

      context.fillStyle = 'rgba(225, 244, 240, .88)'
      roundedRectangle(70, 906, 1460, 48, 22)
      context.fill()
      context.fillStyle = '#56736f'
      context.font = '600 20px system-ui, sans-serif'
      context.fillText('LifeCity Attendance Monitoring  •  Digital Member ID', 100, 938)

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

  const visibleMembers = members

  const branchesForFilter = useMemo(
    () => [
      ...branches.filter((branch) => branch.name === 'LifeCity - Main'),
      ...branches.filter((branch) => branch.name !== 'LifeCity - Main'),
    ],
    [branches],
  )

  const memberPageCount = Math.max(1, Math.ceil(directoryStats.total / membersPerPage))
  const activeMemberPage = directoryStats.page
  const pageMembers = members

  function changeMemberPage(nextPage: number) {
    const page = Math.max(1, Math.min(nextPage, memberPageCount))
    if (page === activeMemberPage) return
    setMemberPage(page)
    window.setTimeout(() => {
      directoryListRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    }, 20)
  }

  function togglePageMemberSelection() {
    const pageIds = pageMembers.map((member) => member.id)
    const everyPageMemberIsSelected = pageIds.length > 0 && pageIds.every((id) => selectedMemberIds.includes(id))

    setSelectedMemberIds((current) =>
      everyPageMemberIsSelected
        ? current.filter((id) => !pageIds.includes(id))
        : [...new Set([...current, ...pageIds])],
    )
  }

  return (
    <>
      <section className="members-editorial-hero">
        <div className="members-hero-copy">
          <p className="eyebrow">Member Directory</p>
          <h1>Members</h1>
          <p>
            Manage contact details, ministries, member status, and private QR
            codes.
          </p>
          <span className="members-hero-caption">
            {directoryStats.active} Active People in Your Directory
          </span>

          <div className="members-hero-tools">
          <button
            className={showImport ? 'member-hero-tool is-open' : 'member-hero-tool'}
            onClick={toggleImport}
            aria-expanded={showImport}
          >
            <Download size={18} />
            Import Members
          </button>

          <button
            className={`member-hero-tool${showMinistryManager ? ' is-open' : ''}`}
            onClick={toggleMinistryManager}
            aria-expanded={showMinistryManager}
          >
            <Settings2 size={18} />
            Ministries
          </button>

          <button
            className={`member-hero-tool${showBranchManager ? ' is-open' : ''}`}
            onClick={toggleBranchManager}
            aria-expanded={showBranchManager}
          >
            <Settings2 size={18} />
            Churches
          </button>
          </div>
        </div>

        <button className="members-create-action" onClick={openAddForm}>
          <span className="members-create-action-kicker">Grow the Directory</span>
          <strong>Add Member</strong>
          <span className="members-create-action-note">Create a Private QR Profile</span>
          <span className="members-create-action-icon" aria-hidden="true">
            <UserPlus size={22} />
          </span>
        </button>

        <span className="members-hero-orbit" aria-hidden="true" />
        <span className="members-hero-spark members-hero-spark-one" aria-hidden="true">✦</span>
        <span className="members-hero-spark members-hero-spark-two" aria-hidden="true">✦</span>
      </section>

      <MotionPresence show={Boolean((showImport || showMinistryManager || showBranchManager))} motionKey={showImport ? "import" : showMinistryManager ? "ministries" : "churches"}>{(showImport || showMinistryManager || showBranchManager) && (
        <section className="directory-tools-workspace" ref={directoryToolsRef} aria-label="Directory Tools">
          <div className="directory-tools-workspace-label">
            <span>Directory Tools</span>
            <strong>{showImport ? 'Import Members' : showMinistryManager ? 'Ministries' : 'Churches'}</strong>
          </div>

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
              <p className="eyebrow">Directory Settings</p>
              <h2>Manage Ministries</h2>
              <p className="muted">
                Rename a ministry anytime. A ministry can only be deleted after
                it is removed from every member, active or inactive.
              </p>
            </div>

            <button
              className="icon-button"
              type="button"
              onClick={() => setShowMinistryManager(false)}
              aria-label="Close Ministry Management"
            >
              <X size={20} />
            </button>
          </div>

          <div className="ministry-create-row">
            <input
              value={newManagedMinistryName}
              onChange={(event) => setNewManagedMinistryName(event.target.value)}
              placeholder="Add a new Ministry, e.g. Dance"
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
              Add Ministry
            </button>
          </div>

          {ministryMessage && (
            <div className={`ministry-message ${messageTone(ministryMessage)}`}>
              <p>{managerMessageContent(ministryMessage)}</p>

              {blockedMinistryId && (
                <button
                  className="secondary-button"
                  onClick={() => viewAffectedMembers(blockedMinistryId)}
                >
                  View Affected Members
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
                const isConfirmingDelete = managerDeleteTarget?.kind === 'ministry' && managerDeleteTarget.item.id === ministry.id

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
                        {count} Assigned Member{count === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="ministry-management-actions">
                      {isConfirmingDelete ? (
                        <span className="manager-inline-delete-confirm">
                          <span>Delete?</span>
                          <button type="button" className="manager-inline-keep" onClick={() => setManagerDeleteTarget(null)} aria-label={`Keep ${ministry.name}`} title="Keep"><X size={17} /></button>
                          <button type="button" className="manager-inline-confirm" onClick={() => void confirmManagerDelete()} aria-label={`Confirm Delete ${ministry.name}`} title="Delete"><Check size={17} /></button>
                        </span>
                      ) : isRenaming ? (
                        <>
                          <button
                            className="edit-icon-button save-ministry-button"
                            onClick={() => void saveMinistryRename(ministry)}
                            aria-label={`Save ${ministry.name}`}
                            title="Save Name"
                          >
                            <Check size={18} />
                          </button>

                          <button
                            className="edit-icon-button"
                            onClick={() => {
                              setRenamingMinistryId('')
                              setRenameValue('')
                            }}
                            aria-label="Cancel Rename"
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
                            title="Rename Ministry"
                          >
                            <Pencil size={18} />
                          </button>

                          <button
                            className="delete-icon-button"
                              onClick={() => void deleteMinistry(ministry)}
                              aria-label={`Delete ${ministry.name}`}
                              title="Delete Ministry"
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
              <p className="eyebrow">Directory Settings</p>
              <h2>Manage Churches</h2>
              <p className="muted">
                Churches work like ministries. A church can only be deleted after it is removed from every member.
              </p>
            </div>
            <button className="icon-button" type="button" onClick={() => setShowBranchManager(false)} aria-label="Close Church Management">
              <X size={20} />
            </button>
          </div>

          <div className="ministry-create-row">
            <input
              value={newManagedBranchName}
              onChange={(event) => setNewManagedBranchName(event.target.value)}
              placeholder="Add a new Church, e.g. LifeCity - Main"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void addManagedBranch()
                }
              }}
            />
            <button className="secondary-button" type="button" onClick={() => void addManagedBranch()}>
              <Plus size={17} />
              Add Church
            </button>
          </div>

          {branchMessage && (
            <div className={`ministry-message ${messageTone(branchMessage)}`}>
              <p>{managerMessageContent(branchMessage)}</p>
              {blockedBranchId && (
                <button className="secondary-button" onClick={() => viewAffectedBranchMembers(blockedBranchId)}>
                  View Affected Members
                </button>
              )}
            </div>
          )}

          <div className="ministry-management-list">
            {branches.map((branch) => {
              const count = branchMemberCount(branch.id)
              const isRenaming = renamingBranchId === branch.id
              const isConfirmingDelete = managerDeleteTarget?.kind === 'branch' && managerDeleteTarget.item.id === branch.id
              return (
                <article className="ministry-management-row" key={branch.id}>
                  <div className="ministry-management-name">
                    {isRenaming ? (
                      <input value={branchRenameValue} onChange={(event) => setBranchRenameValue(event.target.value)} autoFocus />
                    ) : (
                      <strong>{branch.name}</strong>
                    )}
                    <span>{count} Assigned Member{count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="ministry-management-actions">
                    {isConfirmingDelete ? (
                      <span className="manager-inline-delete-confirm">
                        <span>Delete?</span>
                        <button type="button" className="manager-inline-keep" onClick={() => setManagerDeleteTarget(null)} aria-label={`Keep ${branch.name}`} title="Keep"><X size={17} /></button>
                        <button type="button" className="manager-inline-confirm" onClick={() => void confirmManagerDelete()} aria-label={`Confirm Delete ${branch.name}`} title="Delete"><Check size={17} /></button>
                      </span>
                    ) : isRenaming ? (
                      <>
                        <button className="edit-icon-button save-ministry-button" onClick={() => void saveBranchRename(branch)} aria-label={`Save ${branch.name}`} title="Save Name"><Check size={18} /></button>
                        <button className="edit-icon-button" onClick={() => { setRenamingBranchId(''); setBranchRenameValue('') }} aria-label="Cancel Rename" title="Cancel"><X size={18} /></button>
                      </>
                    ) : (
                      <>
                        <button className="edit-icon-button" onClick={() => beginBranchRename(branch)} aria-label={`Rename ${branch.name}`} title="Rename Church"><Pencil size={18} /></button>
                        <button className="delete-icon-button" onClick={() => void deleteBranch(branch)} aria-label={`Delete ${branch.name}`} title="Delete Church"><Trash2 size={18} /></button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
        </section>
      )}</MotionPresence>

      <MotionPresence show={Boolean(showForm)}>{showForm && (
        <section
          className={`form-card member-editor-card ${editingMember ? 'is-editing' : 'is-creating'}`}
          ref={memberFormRef}
        >
          <div className="member-editor-heading">
            <div>
              <p className="eyebrow">
                {editingMember ? 'Update Member' : 'New Member'}
              </p>
              <h2>
                {editingMember
                  ? `Edit ${memberName(editingMember)}`
                  : 'Register a Member'}
              </h2>
            </div>

            <div className="member-editor-quick-actions">
              <label className="status-switch editor-status-switch">
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

              <button
                className="icon-button"
                type="button"
                onClick={closeForm}
                aria-label="Close Member Form"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <form className="member-form" onSubmit={handleSave}>
            <label>
              <span className="field-label-text">
                First Name <span className="required-mark">*</span>
              </span>
              <input
                value={form.firstName}
                onChange={(event) =>
                  setForm({ ...form, firstName: event.target.value })
                }
                required
                placeholder="Juan"
              />
            </label>

            <label>
              <span className="field-label-text">
                Last Name <span className="required-mark">*</span>
              </span>
              <input
                value={form.lastName}
                onChange={(event) =>
                  setForm({ ...form, lastName: event.target.value })
                }
                required
                placeholder="Dela Cruz"
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
                placeholder="juan@example.com"
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
                placeholder="0917 123 4567"
              />
            </label>

            <label className="wide-field admin-note-field">
              <span className="field-label-text">Admin Note</span>
              <span className="admin-note-help">
                Private to admins. This will not appear on the member ID.
              </span>
              <textarea
                value={form.adminNote}
                onChange={(event) =>
                  setForm({ ...form, adminNote: event.target.value })
                }
                placeholder="Add a helpful reminder about this member."
                rows={3}
                maxLength={1000}
              />
            </label>

            <section className="ministry-picker wide-field branch-picker">
              <div className="ministry-picker-heading">
                <div>
                  <strong>Churches <span className="required-mark">*</span></strong>
                  <p>Choose at least one church this member serves in.</p>
                </div>
                <span className="picker-count">
                  {form.branchIds.length} Selected
                </span>
              </div>

              {branches.length === 0 ? (
                <>
                  <p className="muted">Add your first church below.</p>
                  {branchLoadError && (
                    <p className="branch-load-error">
                      Could Not Load Churches: {branchLoadError}
                    </p>
                  )}
                </>
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
                  placeholder="Add a new Church, e.g. LifeCity - Main"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void addBranch()
                    }
                  }}
                />
                <button className="secondary-button" type="button" onClick={() => void addBranch()}>
                  <Plus size={17} />
                  Add Church
                </button>
              </div>
            </section>

            <section className="ministry-picker wide-field">
              <div className="ministry-picker-heading">
                <div>
                  <strong>Ministries</strong>
                  <p>Choose every ministry this member belongs to.</p>
                </div>
                <span className="picker-count">
                  {form.ministryIds.length} Selected
                </span>
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
                  placeholder="Add a new Ministry, e.g. Dance"
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
                  Add Ministry
                </button>
              </div>
            </section>

            {message && <p className="error-message wide-field">{uiMessage(message)}</p>}

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
                  Delete
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
                    ? 'Save Changes'
                    : 'Save Member'}
              </button>
            </div>
          </form>
        </section>
      )}</MotionPresence>

      <section className="directory-card" ref={directoryListRef}>
        <div className="directory-toolbar member-toolbar">
          <div>
            <h2>All Members</h2>
            <p>
              {directoryStats.total} of {directoryStats.registered} Registered
            </p>
          </div>

          <div className="member-directory-controls">
            <label className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Members"
              />
            </label>

            <label className={`filter-select ${filterSpotlight === 'ministry' ? 'filter-select-spotlight' : ''}`}>
              <Users size={17} />
              <select
                value={ministryFilter}
                onChange={(event) => setMinistryFilter(event.target.value)}
              >
                <option value="all">All Ministries</option>
                <option value="none">No Ministry</option>
                {ministries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={`filter-select ${filterSpotlight === 'branch' ? 'filter-select-spotlight' : ''}`}>
              <Settings2 size={17} />
              <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="all">All Churches</option>
                {branchesForFilter.map((branch) => (
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
                <option value="all">All Members</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="vip">Starred</option>
              </select>
            </label>

            <button
              className={`bulk-mode-button ${bulkMode ? 'is-active' : ''}`}
              type="button"
              onClick={() => (bulkMode ? closeBulkMode() : setBulkMode(true))}
            >
              <ListChecks size={17} />
              {bulkMode ? 'Done' : 'Bulk Actions'}
            </button>
          </div>
        </div>

        <ExportPanel label="Export Members" title="Your Directory, Ready to Share"
          subtitle="All matching members · All pages · Current filters and sort order"
          quick="Contact details, status, starred members, churches, and ministries."
          detailed="Everything in Quick CSV, plus member IDs, registration time, and private admin notes."
          hint="Uses the latest saved directory data, with starred members first. Bulk selections do not limit the export. Up to 20,000 members per file. In Excel, import Mobile as Text to retain leading zeros."
          disabled={csvBusy||directoryBusy||!!directoryError||saving||bulkSaving}
          onQuick={()=>void exportDirectory(false)} onDetailed={()=>void exportDirectory(true)}>
          {csvBusy&&<p className="lcse-message" role="status">Preparing your member export…</p>}
          {csvMessage&&<p className="lcse-message" role="status">{csvMessage}</p>}
          {csvError&&<p className="lcse-message lcse-error" role="alert">{csvError}</p>}
        </ExportPanel>

        {bulkMode && (
          <div className="bulk-action-bar">
            <span className="bulk-selection-count">
              {selectedMemberIds.length === 0
                ? 'Select Members to Begin'
                : `${selectedMemberIds.length} Selected Across Pages`}
            </span>
            {selectedMemberIds.length > 0 && (
              <>
                <button
                  className="bulk-action-button"
                  disabled={bulkSaving}
                  onClick={() => void updateSelectedMembersStatus('active')}
                >
                  Mark Active
                </button>
                <button
                  className="bulk-action-button"
                  disabled={bulkSaving}
                  onClick={() => void updateSelectedMembersStatus('inactive')}
                >
                  Mark Inactive
                </button>
                <button
                  className="bulk-delete-button"
                  disabled={bulkSaving}
                  onClick={() => {
                    setBulkDeleteConfirmation('')
                    setShowBulkDelete(true)
                  }}
                >
                  Delete Selected
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

        {directoryBusy ? (
          <div className="empty-state">
            <p>Loading Members…</p>
          </div>
        ) : directoryError ? (
          <div className="lcmp-load-error" role="alert"><p>{directoryError}</p><button type="button" className="secondary-button" onClick={() => void loadData()}>Try Again</button></div>
        ) : visibleMembers.length === 0 ? (
          <div className="empty-state">
            <Users size={30} />
            <h3>No Members Found</h3>
            <p>Try another search or add a new member.</p>
          </div>
        ) : (
          <div className={`member-list ${bulkMode ? 'is-bulk-mode' : ''}`}>
            <div className="member-list-heading">
              {bulkMode && (
                <label className="member-select-control" title="Select Visible Members">
                  <input
                    type="checkbox"
                    checked={
                      pageMembers.length > 0 &&
                      pageMembers.every((member) =>
                        selectedMemberIds.includes(member.id),
                      )
                    }
                    onChange={togglePageMemberSelection}
                    aria-label="Select Members on This Page"
                  />
                </label>
              )}

              <span />

              <button
                className={`member-sort-header ${
                  sortBy === 'name-desc' ? 'sort-descending' : ''
                }`}
                onClick={cycleSort}
                title="Change Member Sorting"
              >
                <strong>Member</strong>
                <span>{sortLabels[sortBy]}</span>
                <ChevronDown size={16} />
              </button>

              <span>Ministries</span>
              <span>Churches</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {pageMembers.map((member) => {
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
                            ? `Unstar ${memberName(member)}`
                            : `Mark ${memberName(member)} as Starred`
                        }
                        title={
                          member.is_starred
                            ? 'Remove Star'
                            : 'Mark as Starred'
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
                          aria-label={`View Admin Note for ${memberName(member)}`}
                          title="View Admin Note"
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
                            +{remainingMinistryCount} More
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

                  <span className={`member-status-icon ${member.status}`} title={member.status === 'active' ? 'Active Member' : 'Inactive Member'} aria-label={member.status === 'active' ? 'Active Member' : 'Inactive Member'}>
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

          <div className="member-pagination lcmp-footer" aria-label="Member List Pagination">
            <div className="lcmp-footer-summary">
            <p aria-live="polite">{directoryBusy ? 'Loading members…' : directoryError ? 'Members unavailable' : <>

              Showing {directoryStats.total === 0 ? 0 : (activeMemberPage - 1) * membersPerPage + 1}–{Math.min(activeMemberPage * membersPerPage, directoryStats.total)} of {directoryStats.total} Members
            </>}</p>
            <div className="lcmp-page-size">
              <label htmlFor="members-page-size">Per Page</label>
              <span className="lcmp-size-field">
                <select id="members-page-size" aria-label="Members per Page" value={membersPerPage} onChange={(event) => setMembersPerPage(Number(event.target.value))}>
                  <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </div>
            </div>
            {!directoryBusy && !directoryError && memberPageCount > 1 && (
              <div className="member-pagination-controls">
                <button type="button" onClick={() => changeMemberPage(1)} disabled={activeMemberPage === 1} aria-label="First Page"><ChevronsLeft size={17} /></button>
                <button type="button" onClick={() => changeMemberPage(activeMemberPage - 1)} disabled={activeMemberPage === 1} aria-label="Previous Page"><ChevronLeft size={17} /></button>
                <span>Page {activeMemberPage} of {memberPageCount}</span>
                <button type="button" onClick={() => changeMemberPage(activeMemberPage + 1)} disabled={activeMemberPage === memberPageCount} aria-label="Next Page"><ChevronRight size={17} /></button>
                <button type="button" onClick={() => changeMemberPage(memberPageCount)} disabled={activeMemberPage === memberPageCount} aria-label="Last Page"><ChevronsRight size={17} /></button>
              </div>
            )}
          </div>
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
              aria-label="Close QR Code"
            >
              <X size={20} />
            </button>

            <p className="eyebrow">Member QR Code</p>
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
              Download Member ID
            </button>
          </section>
        </div>
      )}

      {detailMember && (
        <div className="modal-backdrop" onMouseDown={() => closeMemberDetails()}>
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
                <p className="eyebrow">Member Details</p>
                <h2>{memberName(detailMember)}</h2>
                <p className="muted">{detailMember.member_number}</p>
              </div>
              <div className="member-details-actions">
                <button
                  className="secondary-button details-edit-button"
                  onClick={() => {
                    closeMemberDetails()
                    openEditForm(detailMember)
                  }}
                >
                  <Pencil size={17} />
                  Edit
                </button>
                <button
                  className="icon-button details-close-button"
                  onClick={() => closeMemberDetails()}
                  aria-label="Close Member Details"
                  title="Close Details"
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
                    <dd>{detailMember.email || 'Not Provided'}</dd>
                  </div>
                  <div>
                    <dt>Mobile #</dt>
                    <dd>{detailMember.mobile || 'Not Provided'}</dd>
                  </div>
                  <div>
                    <dt>Registered</dt>
                    <dd>{formatDate(detailMember.created_at)}</dd>
                  </div>
                </dl>
              </section>

              <section className="member-details-section qr-details-section">
                <div className="details-qr-actions">
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
                    aria-label="Download Member ID"
                    title="Download Member ID"
                  >
                    <Download size={17} />
                  </button>
                </div>
              </section>
            </div>

            <section className="member-details-section">
              <h3>Ministries</h3>
              <div className="details-ministry-list">
                {getMemberMinistries(detailMember).length === 0 ? (
                  <span className="no-ministry">None</span>
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
              <h3>Churches</h3>
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
                    <h3>Admin Note</h3>
                    <p className="muted">Private to administrators.</p>
                  </div>
                  <button
                    className="edit-icon-button"
                    onClick={() => {
                      closeMemberDetails()
                      openEditForm(detailMember)
                    }}
                    aria-label={`Edit Admin Note for ${memberName(detailMember)}`}
                    title="Edit Admin Note"
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
                  {detailsLoading ? 'Loading…' : attendanceError ? 'Unavailable' : `${attendanceTotal} Total`}
                </strong>
              </div>

              {detailsLoading ? (
                <p className="muted" role="status">Loading attendance…</p>
              ) : attendanceError ? (
                <div role="alert">
                  <p className="muted">{attendanceError}</p>
                  <button type="button" className="text-button" onClick={()=>void loadMemberAttendance(detailMember.id,attendancePage)}>Retry Attendance</button>
                </div>
              ) : memberAttendance.length === 0 ? (
                <p className="muted">No attendance recorded yet.</p>
              ) : (
                <>
                  <div className="attendance-table">
                    <div className="attendance-table-heading">
                      <span>Event</span>
                      <span>Checked In</span>
                      <span>Status</span>
                    </div>
                    {memberAttendance.map((record) => (
                      <div className="attendance-table-row" key={record.id}>
                        <strong>{record.events?.name || record.report_snapshot?.service_name || 'Service Unavailable'}</strong>
                        <span>{formatDateTime(record.checked_in_at)}</span>
                        <span className="attendance-record-status">{uiStatus(record.status)}</span>
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
              aria-label="Close Admin Note"
            >
              <X size={20} />
            </button>
            <p className="eyebrow">Private Admin Note</p>
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
                Edit Note
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
              aria-label="Close Delete Confirmation"
            >
              <X size={20} />
            </button>
            <p className="eyebrow">Permanent Action</p>
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
                {saving ? 'Deleting…' : 'Permanently Delete'}
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
              aria-label="Close Bulk Delete Confirmation"
            >
              <X size={20} />
            </button>
            <p className="eyebrow">Permanent Bulk Action</p>
            <h2>Delete {selectedMemberIds.length} Members?</h2>
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
                {bulkSaving ? 'Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
