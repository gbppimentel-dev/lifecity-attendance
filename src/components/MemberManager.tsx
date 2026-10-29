import BorderGlow from './BorderGlow'
import FoldText from './FoldText'
import { useToast } from '../lib/toasts'
import { useNoticeToast } from '../lib/useNoticeToast'
import {MobileFold} from './CompactMobile'
import {ResponsiveSelect} from './CompactMobile'
import ExportPanel from './ExportPanel'
import GlideSelect from './GlideSelect'
import MemberDirectoryRow from './MemberDirectoryRow'
import MemberEditor from './MemberEditor'
import { MemberNotePanel, MemberQrDialog, MemberProfilePanel } from './MemberViews'
import { saveMemberAdminNote } from '../lib/memberNotes'
import { MotionPresence, motionEnabled } from '../lib/motion'
import { setMemberStatusWithUndo } from '../lib/memberStatusActions'
import './MemberDirectory.css'
import { useWorkspaceCache } from '../lib/workspaceCache'
import DirectorySwipeItem from './DirectorySwipeItem'
import DirectoryNotice, { type DirectoryNoticeTone } from './DirectoryNotice'
import { deleteDirectoryEntryWithUndo, DirectoryEntryInUseError } from '../lib/directoryActions'
// Change ID: LC-P08N-v1
// UI refinement: LC-P08A-UI-v2
// Change ID: LC-P08A-v1
// Change ID: LC-P07A-v1
import { uiMessage } from '../lib/uiText'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Upload,
  Church,
  HandHeart,
  Plus,
  Search,
  ListChecks,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
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

type MemberPageSnapshot = {
  rows: Member[]; ministries: Ministry[]; branches: Branch[]
  total: number; registered: number; active: number; page: number
  ministry_counts: Record<string, number>; branch_counts: Record<string, number>
}
const initialMemberParams = {p_search:'',p_ministry:'all',p_church:'all',p_status:'all',p_sort:'name-asc',p_page:1,p_size:25}

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

const sortLabels: Record<SortOption, string> = {
  'name-asc': 'Name · A–Z',
  'name-desc': 'Name · Z–A',
  'added-oldest': 'Added · Oldest First',
  'added-newest': 'Added · Newest First',
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

export default function MemberManager() {
  const cache = useWorkspaceCache()
  const [initialPage] = useState(() => cache.get<MemberPageSnapshot>('members:'+JSON.stringify(initialMemberParams)))
  const { notify: emitToast, dismiss: dismissToast } = useToast()
  const noticeAlive = useRef(true)
  useEffect(() => { noticeAlive.current = true; return () => { noticeAlive.current = false } }, [])
  const notify = (options: Parameters<typeof emitToast>[0]) => noticeAlive.current ? emitToast(options) : ''
  const [csvBusy,setCsvBusy]=useState(false)
  const [csvMessage,setCsvMessage]=useState('')
  const [csvError,setCsvError]=useState('')
  useNoticeToast(csvMessage, 'info')
  useNoticeToast(csvError, 'error')
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
      setCsvMessage(`CSV prepared with ${rows.length.toLocaleString()} matching members across all pages.`)
    }catch(failure){if(csvMounted.current)setCsvError((failure as {code?:string}).code==='P0001'?(failure as {message:string}).message:'Could not export members. Confirm LC-P08A-v1.sql is installed and your admin access is active, then try again.')}
    finally{csvLock.current=false;if(csvMounted.current)setCsvBusy(false)}
  }
  const [members, setMembers] = useState<Member[]>(initialPage?.rows ?? [])
  const [ministries, setMinistries] = useState<Ministry[]>(initialPage?.ministries ?? [])
  const [branches, setBranches] = useState<Branch[]>(initialPage?.branches ?? [])
  const [branchLoadError, setBranchLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [ministryFilter, setMinistryFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [message, setMessage] = useState('')
  useNoticeToast(message, 'error')
  const [loading, setLoading] = useState(!initialPage)
  const [saving, setSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [importToolbarTarget, setImportToolbarTarget] = useState<HTMLDivElement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showMinistryManager, setShowMinistryManager] = useState(false)
  const [showBranchManager, setShowBranchManager] = useState(false)
  const activeDirectoryTool = useRef<'import' | 'ministry' | 'branch' | null>(null)
  activeDirectoryTool.current = showImport ? 'import' : showMinistryManager ? 'ministry' : showBranchManager ? 'branch' : null
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const currentEditorId = useRef<string | null>(null)
  currentEditorId.current = editingMember?.id ?? null
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [detailMember, setDetailMember] = useState<Member | null>(null)
  const [noteMember, setNoteMember] = useState<Member | null>(null)
  const noteWriteLock = useRef(new Set<string>())
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
  const [openDirectoryRow, setOpenDirectoryRow] = useState('')
  const [managerBusy, setManagerBusy] = useState(false)
  const managerLock = useRef(false)
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
  const [statusBusyIds, setStatusBusyIds] = useState<string[]>([])
  const statusLocks = useRef(new Set<string>())
  const statusToastIds = useRef(new Map<string, string>())
  const latestMemberWrites = useRef({ saving, bulkSaving })
  latestMemberWrites.current = { saving, bulkSaving }
  useEffect(() => () => {
    statusToastIds.current.forEach(id => dismissToast(id))
    statusToastIds.current.clear()
  }, [dismissToast])
  const [filterSpotlight, setFilterSpotlight] = useState<'ministry' | 'branch' | null>(null)
  const [memberPage, setMemberPage] = useState(1)
  const [membersPerPage, setMembersPerPage] = useState(25)
  const [searchQuery, setSearchQuery] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [directoryStats, setDirectoryStats] = useState(initialPage ? {total:initialPage.total,registered:initialPage.registered,active:initialPage.active,page:initialPage.page,ministry_counts:initialPage.ministry_counts,branch_counts:initialPage.branch_counts} : {total:0,registered:0,active:0,page:1,ministry_counts:{} as Record<string,number>,branch_counts:{} as Record<string,number>})
  const requestSequence = useRef(0)
  const filterKey = JSON.stringify([searchQuery,ministryFilter,branchFilter,statusFilter,sortBy,membersPerPage])
  const requestKey = JSON.stringify([filterKey,memberPage,search.trim()])
  const currentRequestKey = useRef(requestKey)
  currentRequestKey.current = requestKey
  const pageRequest = {p_search:searchQuery,p_ministry:ministryFilter,p_church:branchFilter,p_status:statusFilter,p_sort:sortBy,p_page:memberPage,p_size:membersPerPage}
  const latestPageRequest = useRef({key:requestKey,params:pageRequest,pending:false})
  latestPageRequest.current = {key:requestKey,params:pageRequest,pending:search.trim() !== searchQuery}
  const [loadedKey, setLoadedKey] = useState(initialPage ? requestKey : '')
  const [dataKey, setDataKey] = useState(initialPage ? requestKey : '')
  const directoryBusy = loading || loadedKey !== requestKey || search.trim() !== searchQuery


  const importRef = useRef<HTMLDivElement | null>(null)
  const ministryManagerRef = useRef<HTMLElement | null>(null)
  const branchManagerRef = useRef<HTMLElement | null>(null)
  const directoryToolsRef = useRef<HTMLElement | null>(null)
  const directoryToolsNavRef = useRef<HTMLDivElement | null>(null)
  const memberFormRef = useRef<HTMLElement | null>(null)
  const directoryListRef = useRef<HTMLElement | null>(null)
  const bulkToolbarRef = useRef<HTMLDivElement | null>(null)

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

  const refreshDirectory = useRef(loadData)
  refreshDirectory.current = loadData
  useEffect(() => {
    const refresh = () => { void refreshDirectory.current() }
    window.addEventListener('lifecity-directory-change', refresh)
    return () => window.removeEventListener('lifecity-directory-change', refresh)
  }, [])

  function scrollToDirectoryTools(kind?: 'ministry' | 'branch') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const tools = directoryToolsNavRef.current
      if (!tools || !noticeAlive.current || !activeDirectoryTool.current) return
      // A late response or Undo must not pull a different panel into view.
      if (kind && activeDirectoryTool.current !== kind) return
      const headerHeight = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0
      const bounds = tools.getBoundingClientRect()
      // Feedback should leave an already-visible toolbar steady.
      if (kind && bounds.top >= headerHeight + 12 && bounds.bottom <= window.innerHeight - 16) return
      window.scrollTo({
        top: Math.max(0, window.scrollY + bounds.top - headerHeight - 20),
        behavior: motionEnabled() ? 'smooth' : 'auto',
      })
    }))
  }

  function showManagerFeedback(kind: 'ministry' | 'branch', message: string) {
    if (!noticeAlive.current) return
    const setFeedback = kind === 'ministry' ? setMinistryMessage : setBranchMessage
    setFeedback(message)
    if (message) scrollToDirectoryTools(kind)
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
        form.querySelector<HTMLInputElement>('input[autocomplete="given-name"]')?.focus({ preventScroll: true })

        window.scrollTo({
          top: Math.max(0, formTop - topbarHeight - 16),
          behavior: motionEnabled() ? 'smooth' : 'auto',
        })
      })
    })
  }

  async function loadData(): Promise<boolean> {
    if (!csvMounted.current || latestPageRequest.current.pending) return false
    const {key,params} = latestPageRequest.current
    const sequence = ++requestSequence.current
    const isCurrent = () => csvMounted.current && sequence === requestSequence.current && key === currentRequestKey.current
    setLoading(true)
    setDirectoryError('')
    try {
      const {data,error} = await supabase.rpc('lc_members_page', params)
      if (!isCurrent()) return false
      if (error) throw error
      if (!data || !Array.isArray(data.rows) || !Array.isArray(data.ministries) || !Array.isArray(data.branches)) throw new Error('Invalid directory response')
      setMembers(data.rows as Member[])
      setMinistries(data.ministries as Ministry[])
      setBranches(data.branches as Branch[])
      setDirectoryStats({total:data.total,registered:data.registered,active:data.active,page:data.page,ministry_counts:data.ministry_counts,branch_counts:data.branch_counts})
      setDataKey(key)
      cache.set('members:'+JSON.stringify(params), data as MemberPageSnapshot)
      setBranchLoadError('')
      return true
    } catch {
      if (isCurrent()) {
        setDirectoryError('Could not load members. Please try again.')
        setBranchLoadError('Directory data is unavailable. Please retry loading members.')
      }
      return false
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
    if (statusLocks.current.has(member.id)) return
    supersedeMemberStatusUndo([member.id])
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
      scrollToDirectoryTools()
    }
  }

  function toggleMinistryManager() {
    const nextOpen = !showMinistryManager
    setShowMinistryManager(nextOpen)
    setShowImport(false)
    setShowBranchManager(false)

    if (nextOpen) {
      scrollToDirectoryTools()
    }
  }

  function toggleBranchManager() {
    const nextOpen = !showBranchManager
    setShowBranchManager(nextOpen)
    setShowImport(false)
    setShowMinistryManager(false)

    if (nextOpen) scrollToDirectoryTools()
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
    if (managerLock.current) return
    const name = newManagedMinistryName.trim()
    setBlockedMinistryId('')
    if (!name) { showManagerFeedback('ministry', 'A ministry name is required.'); return }
    if (ministries.some(ministry => ministry.name.toLowerCase() === name.toLowerCase())) {
      showManagerFeedback('ministry', 'A ministry with that name already exists.')
      return
    }
    managerLock.current = true; setManagerBusy(true); setMinistryMessage('')
    try {
      const { data, error } = await supabase.from('ministries').insert({ name }).select('id, name').single()
      if (error) throw error
      if (!data?.id || typeof data.name !== 'string') throw new Error('Invalid ministry response')
      cache.invalidate('members:')
      const ministry = data as Ministry
      if (noticeAlive.current) {
        requestSequence.current++
        setMinistries(current => [...current.filter(item => item.id !== ministry.id), ministry].sort((a, b) => a.name.localeCompare(b.name)))
        setNewManagedMinistryName('')
        showManagerFeedback('ministry', `${ministry.name} was added.`)
      }
      window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
    } catch (error) {
      if (noticeAlive.current) showManagerFeedback('ministry', (error as {code?: string}).code === '23505' ? 'A ministry with that name already exists.' : 'Could not add this ministry. Check your connection and try again.')
    } finally {
      managerLock.current = false
      if (noticeAlive.current) setManagerBusy(false)
    }
  }

  async function addManagedBranch() {
    if (managerLock.current) return
    const name = newManagedBranchName.trim()
    setBlockedBranchId('')
    if (!name) { showManagerFeedback('branch', 'A church name is required.'); return }
    if (branches.some((branch) => branch.name.toLowerCase() === name.toLowerCase())) {
      showManagerFeedback('branch', 'A church with that name already exists.')
      return
    }

    managerLock.current = true; setManagerBusy(true); setBranchMessage('')
    try {
      const { data, error } = await supabase.from('branches').insert({ name }).select('id, name').single()
      if (error) throw error
      if (!data?.id || typeof data.name !== 'string') throw new Error('Invalid church response')
      cache.invalidate('members:')
      const branch = data as Branch
      if (noticeAlive.current) {
        requestSequence.current++
        setBranches(current => [...current.filter(item => item.id !== branch.id), branch].sort((a, b) => a.name.localeCompare(b.name)))
        setNewManagedBranchName('')
        showManagerFeedback('branch', `${branch.name} was added.`)
      }
      window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
    } catch (error) {
      if (noticeAlive.current) showManagerFeedback('branch', (error as {code?: string}).code === '23505' ? 'A church with that name already exists.' : 'Could not add this church. Check your connection and try again.')
    } finally {
      managerLock.current = false
      if (noticeAlive.current) setManagerBusy(false)
    }
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

    notify({ title: editingMember ? 'Member updated' : 'Member created', tone: 'success' })
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

    notify({ title: member.is_starred ? 'Star removed' : 'Member starred', description: memberName(member), tone: 'success' })
    await loadData()
  }

  function syncMemberStatus(id: string, status: Member['status']) {
    cache.invalidate('members:')
    cache.invalidate('dashboard:')
    if (noticeAlive.current) {
      requestSequence.current++
      setMembers(current => current.map(member => member.id === id ? { ...member, status } : member))
      setDetailMember(current => current?.id === id ? { ...current, status } : current)
      setSelectedMember(current => current?.id === id ? { ...current, status } : current)
    }
    window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
  }

  function supersedeMemberStatusUndo(ids: string[]) {
    for (const id of ids) {
      const toastId = statusToastIds.current.get(id)
      if (toastId) dismissToast(toastId)
      statusToastIds.current.delete(id)
    }
  }

  async function toggleMemberStatus(member: Member) {
    if (statusLocks.current.has(member.id) || saving || bulkSaving || directoryBusy) return
    statusLocks.current.add(member.id)
    setStatusBusyIds(current => [...current, member.id])
    try {
      const next = member.status === 'active' ? 'inactive' : 'active'
      const change = await setMemberStatusWithUndo(supabase, member.id, member.status, next)
      syncMemberStatus(change.id, change.status)
      if (!noticeAlive.current) return
      const previousToast = statusToastIds.current.get(member.id)
      if (previousToast) dismissToast(previousToast)
      const toastId: string = emitToast({
        title: `${memberName(member)} marked ${next}`,
        tone: 'success', duration: 10000, actionLabel: 'Undo',
        onDismiss: () => { if (statusToastIds.current.get(member.id) === toastId) statusToastIds.current.delete(member.id) },
        onAction: async () => {
          if (!noticeAlive.current || statusToastIds.current.get(member.id) !== toastId) throw new Error('This status action has been superseded. Refresh the directory to review the current status.')
          if (latestMemberWrites.current.saving || latestMemberWrites.current.bulkSaving) throw new Error('A member update is in progress. Try Undo again in a moment.')
          if (statusLocks.current.has(member.id)) throw new Error('A status update is in progress. Try Undo again in a moment.')
          statusLocks.current.add(member.id)
          if (noticeAlive.current) setStatusBusyIds(current => [...current, member.id])
          try {
            const restored = await change.undo()
            syncMemberStatus(restored.id, restored.status)
          } catch (error) {
            cache.invalidate('members:')
            cache.invalidate('dashboard:')
            window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
            throw error
          } finally {
            statusLocks.current.delete(member.id)
            if (noticeAlive.current) setStatusBusyIds(current => current.filter(id => id !== member.id))
          }
        },
      })
      statusToastIds.current.set(member.id, toastId)
    } catch (error) {
      if (noticeAlive.current) emitToast({ title: 'Status update not confirmed', description: error instanceof Error ? error.message : 'Refresh the directory and try again.', tone: 'error' })
      cache.invalidate('members:')
      cache.invalidate('dashboard:')
      window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
    } finally {
      statusLocks.current.delete(member.id)
      if (noticeAlive.current) setStatusBusyIds(current => current.filter(id => id !== member.id))
    }
  }

  async function savePrivateNote(member: Member, draft: string) {
    if (noteWriteLock.current.has(member.id) || latestMemberWrites.current.saving || latestMemberWrites.current.bulkSaving) {
      throw new Error('Another member update is in progress. Please try again in a moment.')
    }
    noteWriteLock.current.add(member.id)
    try {
      const saved = await saveMemberAdminNote(supabase, member.id, member.admin_note, draft)
      cache.invalidate('members:')
      if (noticeAlive.current) {
        requestSequence.current++
        setMembers(current => current.map(entry => entry.id === saved.id ? { ...entry, admin_note: saved.admin_note } : entry))
        const syncNote = (current: Member | null) => current?.id === saved.id ? { ...current, admin_note: saved.admin_note } : current
        setNoteMember(syncNote)
        setDetailMember(syncNote)
        setSelectedMember(syncNote)
        setEditingMember(syncNote)
        if (currentEditorId.current === saved.id) setForm(current => ({ ...current, adminNote: saved.admin_note ?? '' }))
      }
      window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
    } catch (error) {
      // An interrupted response may follow a committed write; refresh snapshots.
      cache.invalidate('members:')
      window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
      throw error
    } finally { noteWriteLock.current.delete(member.id) }
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

  function openBulkMode() {
    setBulkMode(true)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const toolbar = bulkToolbarRef.current
      if (!toolbar || !noticeAlive.current) return
      const headerHeight = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0
      const bounds = toolbar.getBoundingClientRect()
      if (bounds.top >= headerHeight + 12 && bounds.bottom <= window.innerHeight - 16) return
      window.scrollTo({
        top: Math.max(0, window.scrollY + bounds.top - headerHeight - 16),
        behavior: motionEnabled() ? 'smooth' : 'auto',
      })
    }))
  }

  async function updateSelectedMembersStatus(status: 'active' | 'inactive') {
    if (selectedMemberIds.length === 0 || statusLocks.current.size) return

    supersedeMemberStatusUndo(selectedMemberIds)
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

    cache.invalidate('members:'); cache.invalidate('dashboard:')
    notify({ title: `${selectedMemberIds.length} member${selectedMemberIds.length === 1 ? '' : 's'} marked ${status}`, tone: 'success' })
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

    notify({ title: 'Member deleted', description: memberName(deleteTarget), tone: 'success' })
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

    notify({ title: `${selectedMemberIds.length} members deleted`, tone: 'success' })
    setSelectedMemberIds([])
    setBulkDeleteConfirmation('')
    setShowBulkDelete(false)
    setBulkSaving(false)
    await loadData()
  }

  function ministryMemberCount(ministryId: string) {
    return directoryStats.ministry_counts[ministryId] ?? 0
  }

  function managerNoticeDetails(message: string, blockedId: string): { tone: DirectoryNoticeTone; title: string } {
    if (blockedId) return { tone: 'warning', title: 'Assigned to members' }
    if (/was added|was deleted|was restored|renamed successfully/i.test(message)) {
      const title = /was deleted/i.test(message) ? 'Entry deleted'
        : /was restored/i.test(message) ? 'Entry restored'
        : /was added/i.test(message) ? 'Added to the directory' : 'Name updated'
      return { tone: 'success', title }
    }
    if (/Undo|could not be restored/i.test(message)) return { tone: 'error', title: 'Restore not completed' }
    if (/name is required|with that name already exists/i.test(message)) return { tone: 'info', title: 'Check the name' }
    if (/Wait for the directory/i.test(message)) return { tone: 'info', title: 'Waiting for the directory' }
    return { tone: 'error', title: 'Update not completed' }
  }

  function managerMessageContent(message: string) {
    const subjectEnd = message.search(/\s+(was|cannot)\s/i)

    if (subjectEnd <= 0) return message

    return <><strong>{message.slice(0, subjectEnd)}</strong>{message.slice(subjectEnd)}</>
  }

  function branchMemberCount(branchId: string) {
    return directoryStats.branch_counts[branchId] ?? 0
  }

  function beginRename(ministry: Ministry) {
    if (managerLock.current) return
    setOpenDirectoryRow('')
    setManagerDeleteTarget(null)
    setMinistryMessage('')
    setBlockedMinistryId('')
    setRenamingMinistryId(ministry.id)
    setRenameValue(ministry.name)
  }

  async function saveMinistryRename(ministry: Ministry) {
    await saveDirectoryRename('ministry', ministry, renameValue)
  }

  async function saveDirectoryRename(kind: 'ministry' | 'branch', item: Ministry | Branch, value: string) {
    if (managerLock.current) return
    const name = value.trim(), isMinistry = kind === 'ministry'
    const setFeedback = (message: string) => showManagerFeedback(kind, message)
    const subject = isMinistry ? 'ministry' : 'church'
    if (!name) { setFeedback(`A ${subject} name is required.`); return }
    if ((isMinistry ? ministries : branches).some(entry => entry.id !== item.id && entry.name.toLowerCase() === name.toLowerCase())) {
      setFeedback(`A ${subject} with that name already exists.`); return
    }
    managerLock.current = true; setManagerBusy(true); setFeedback('')
    try {
      const { data, error } = await supabase.from(isMinistry ? 'ministries' : 'branches').update({ name }).eq('id', item.id).select('id, name').single()
      if (error) throw error
      if (!data?.id || typeof data.name !== 'string') throw new Error('Invalid update response')
      cache.invalidate('members:')
      if (noticeAlive.current) {
        requestSequence.current++
        if (isMinistry) {
          setMinistries(current => current.map(entry => entry.id === item.id ? data as Ministry : entry).sort((a, b) => a.name.localeCompare(b.name)))
          setRenamingMinistryId(''); setRenameValue('')
        } else {
          setBranches(current => current.map(entry => entry.id === item.id ? data as Branch : entry).sort((a, b) => a.name.localeCompare(b.name)))
          setRenamingBranchId(''); setBranchRenameValue('')
        }
        setFeedback(`${isMinistry ? 'Ministry' : 'Church'} renamed successfully.`)
      }
      window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
    } catch (error) {
      if (noticeAlive.current) setFeedback((error as {code?: string}).code === '23505' ? `A ${subject} with that name already exists.` : `Could not rename this ${subject}. Check your connection and try again.`)
    } finally {
      managerLock.current = false
      if (noticeAlive.current) setManagerBusy(false)
    }
  }

  async function deleteMinistry(ministry: Ministry) {
    if (managerLock.current) return
    setOpenDirectoryRow(''); setMinistryMessage(''); setBlockedMinistryId('')
    if (directoryBusy || directoryError) {showManagerFeedback('ministry', 'Wait for the directory to finish loading, or retry if it failed.');return}
    const count = ministryMemberCount(ministry.id)

    if (count > 0) {
      setBlockedMinistryId(ministry.id)
      showManagerFeedback('ministry',
        `${ministry.name} cannot be deleted because it is assigned to ${count} member${count === 1 ? '' : 's'}, including inactive members if applicable.`,
      )
      return
    }

    setManagerDeleteTarget({ kind: 'ministry', item: ministry })
  }

  async function confirmManagerDelete() {
    if (!managerDeleteTarget || managerLock.current) return
    if (directoryBusy || directoryError) {
      showManagerFeedback(managerDeleteTarget.kind, 'Wait for the directory to finish loading, or retry if it failed.')
      return
    }
    const assigned = managerDeleteTarget.kind === 'ministry' ? ministryMemberCount(managerDeleteTarget.item.id) : branchMemberCount(managerDeleteTarget.item.id)
    const { kind, item } = managerDeleteTarget
    const setFeedback = (message: string) => showManagerFeedback(kind, message)
    const setBlocked = kind === 'ministry' ? setBlockedMinistryId : setBlockedBranchId
    if (assigned > 0) {
      setBlocked(item.id); setFeedback(`${item.name} cannot be deleted because it is assigned to ${assigned} member${assigned === 1 ? '' : 's'}.`)
      setManagerDeleteTarget(null); return
    }
    const table = kind === 'ministry' ? 'ministries' : 'branches'
    let finishDelete!: () => void
    const deletionFinished = new Promise<void>(resolve => { finishDelete = resolve })
    managerLock.current = true; setManagerBusy(true); setFeedback(''); setBlocked('')
    try {
      const deleted = await deleteDirectoryEntryWithUndo(supabase, table, item.id)
      cache.invalidate('members:')
      if (noticeAlive.current) {
        requestSequence.current++
        if (kind === 'ministry') {
          setMinistries(current => current.filter(entry => entry.id !== deleted.entry.id))
          setForm(current => ({ ...current, ministryIds: current.ministryIds.filter(id => id !== deleted.entry.id) }))
          setMinistryFilter(current => current === deleted.entry.id ? 'all' : current)
        } else {
          setBranches(current => current.filter(entry => entry.id !== deleted.entry.id))
          setForm(current => ({ ...current, branchIds: current.branchIds.filter(id => id !== deleted.entry.id) }))
          setBranchFilter(current => current === deleted.entry.id ? 'all' : current)
        }
        setFeedback(`${deleted.entry.name} was deleted.`)
        setManagerDeleteTarget(null)
      }
      // The delete was committed even if its page was closed while awaiting
      // the server. Keep its real Undo available in the workspace toast.
      emitToast({ title: `${deleted.entry.name} deleted`, tone: 'success', onAction: async () => {
        await deletionFinished
        if (managerLock.current) throw new Error('Another directory update is in progress. Please try Undo again in a moment.')
        managerLock.current = true
        if (noticeAlive.current) setManagerBusy(true)
        try {
          await deleted.undo()
          cache.invalidate('members:')
          if (noticeAlive.current) {
            requestSequence.current++
            if (kind === 'ministry') setMinistries(current => [...current.filter(entry => entry.id !== deleted.entry.id), deleted.entry].sort((a, b) => a.name.localeCompare(b.name)))
            else setBranches(current => [...current.filter(entry => entry.id !== deleted.entry.id), deleted.entry].sort((a, b) => a.name.localeCompare(b.name)))
            setFeedback(`${deleted.entry.name} was restored.`); setBlocked('')
          }
          window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
        } catch (error) {
          const feedback = error instanceof Error ? error.message : 'Could not undo this deletion. Check your connection and try Undo again.'
          if (noticeAlive.current) setFeedback(feedback)
          throw new Error(feedback)
        } finally {
          managerLock.current = false
          if (noticeAlive.current) setManagerBusy(false)
        }
      } })
      window.dispatchEvent(new CustomEvent('lifecity-directory-change'))
    } catch (error) {
      if (!noticeAlive.current) return
      if (error instanceof DirectoryEntryInUseError || (error as {code?: string}).code === '23503') {
        setBlocked(item.id)
        setFeedback(`${item.name} cannot be deleted because it is assigned to members. View the affected members and remove their assignment first.`)
        setManagerDeleteTarget(null)
        await loadData()
      } else {
        setFeedback(error instanceof Error ? error.message : 'Could not delete this entry. Check your connection and try again. The entry has been kept.')
      }
    } finally {
      managerLock.current = false
      if (noticeAlive.current) setManagerBusy(false)
      finishDelete()
    }
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
    if (managerLock.current) return
    setOpenDirectoryRow('')
    setManagerDeleteTarget(null)
    setBranchMessage('')
    setBlockedBranchId('')
    setRenamingBranchId(branch.id)
    setBranchRenameValue(branch.name)
  }

  async function saveBranchRename(branch: Branch) {
    await saveDirectoryRename('branch', branch, branchRenameValue)
  }

  async function deleteBranch(branch: Branch) {
    if (managerLock.current) return
    setOpenDirectoryRow(''); setBranchMessage(''); setBlockedBranchId('')
    if (directoryBusy || directoryError) {showManagerFeedback('branch', 'Wait for the directory to finish loading, or retry if it failed.');return}
    const count = branchMemberCount(branch.id)
    if (count > 0) {
      setBlockedBranchId(branch.id)
      showManagerFeedback('branch', `${branch.name} cannot be deleted because it is assigned to ${count} member${count === 1 ? '' : 's'}, including inactive members if applicable.`)
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

  const activeDirectoryFilters = [
    ...(search.trim() ? [{ key: 'search', label: `Search: ${search.trim()}`, clear: () => setSearch('') }] : []),
    ...(ministryFilter !== 'all' ? [{ key: 'ministry', label: ministryFilter === 'none' ? 'No Ministry' : `Ministry: ${ministries.find(item => item.id === ministryFilter)?.name ?? 'Selected'}`, clear: () => setMinistryFilter('all') }] : []),
    ...(branchFilter !== 'all' ? [{ key: 'church', label: `Church: ${branches.find(item => item.id === branchFilter)?.name ?? 'Selected'}`, clear: () => setBranchFilter('all') }] : []),
    ...(statusFilter !== 'all' ? [{ key: 'status', label: statusFilter === 'vip' ? 'Starred Members' : `${statusFilter === 'active' ? 'Active' : 'Inactive'} members`, clear: () => setStatusFilter('all') }] : []),
  ]

  function clearDirectoryFilters() {
    setSearch(''); setMinistryFilter('all'); setBranchFilter('all'); setStatusFilter('all')
  }

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
      <BorderGlow as="section" className="members-editorial-hero" borderRadius={18} animated>
        <div className="members-hero-copy">
          <p className="eyebrow">Member Directory</p>
          <h1><FoldText text="Members"/></h1>
          <p>
            Manage contact details, ministries, member status, and private QR
            codes.
          </p>
          <span className="members-hero-caption">
            {directoryStats.active} Active People in Your Directory
          </span>

          <div className="members-hero-tools" ref={directoryToolsNavRef}>
          <button
            className={showImport ? 'member-hero-tool is-open' : 'member-hero-tool'}
            onClick={toggleImport}
            aria-expanded={showImport}
          >
            <Upload size={18} />
            Import Members
          </button>

          <button
            className={`member-hero-tool${showMinistryManager ? ' is-open' : ''}`}
            onClick={toggleMinistryManager}
            aria-expanded={showMinistryManager}
          >
            <HandHeart size={18} />
            Ministries
          </button>

          <button
            className={`member-hero-tool${showBranchManager ? ' is-open' : ''}`}
            onClick={toggleBranchManager}
            aria-expanded={showBranchManager}
          >
            <Church size={18} />
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
      </BorderGlow>

      <MotionPresence show={Boolean((showImport || showMinistryManager || showBranchManager))} motionKey={showImport ? "import" : showMinistryManager ? "ministries" : "churches"}>{(showImport || showMinistryManager || showBranchManager) && (
        <section className="directory-tools-workspace" ref={directoryToolsRef} aria-label="Directory Tools">
          <div className="directory-tools-workspace-header">
            <div className="directory-tools-workspace-label">
              <span>Directory Tools</span>
              <strong>{showImport ? 'Import Members' : showMinistryManager ? 'Ministries' : 'Churches'}</strong>
            </div>
            {showImport ? <div className="directory-tools-header-actions" ref={setImportToolbarTarget}/> :
              <div className="directory-tools-header-actions">
                <button className="directory-tools-close" type="button"
                  onClick={() => showMinistryManager ? setShowMinistryManager(false) : setShowBranchManager(false)}
                  aria-label={showMinistryManager ? 'Close Ministry Management' : 'Close Church Management'}
                  title={showMinistryManager ? 'Close Ministries' : 'Close Churches'}><X size={18}/></button>
              </div>}
          </div>

          {!showImport && directoryError && <DirectoryNotice tone="error" title="Directory unavailable"
            actionLabel="Retry Directory" actionDisabled={directoryBusy} onAction={() => void loadData()}>
            {directoryError} Refresh the directory before deleting an entry.
          </DirectoryNotice>}

      {showImport && (
        <div ref={importRef}>
          <MemberImport
            onImported={async () => { await loadData() }}
            onClose={() => setShowImport(false)}
            toolbarTarget={importToolbarTarget}
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

          </div>

          <div className="ministry-create-row">
            <input
              aria-label="New ministry name"
              disabled={managerBusy}
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
              disabled={managerBusy}
              onClick={() => void addManagedMinistry()}
            >
              <Plus size={17} />
              Add Ministry
            </button>
          </div>

          {ministryMessage && <DirectoryNotice {...managerNoticeDetails(ministryMessage, blockedMinistryId)}
            actionLabel={blockedMinistryId ? 'View Affected Members' : undefined}
            onAction={blockedMinistryId ? () => viewAffectedMembers(blockedMinistryId) : undefined}>
            {managerMessageContent(ministryMessage)}
          </DirectoryNotice>}

          <div className="lc-directory-list-heading"><strong>Ministries <span>{ministries.length}</span></strong><small>Swipe left or use ⋯ for actions.</small></div>
          {ministries.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <p>No ministries have been created yet.</p>
            </div>
          ) : (
            <div className="ministry-management-list lc-directory-list" aria-label="Ministries">
              {ministries.map((ministry) => {
                const count = ministryMemberCount(ministry.id)
                const isRenaming = renamingMinistryId === ministry.id
                const isConfirmingDelete = managerDeleteTarget?.kind === 'ministry' && managerDeleteTarget.item.id === ministry.id

                return (
                  <DirectorySwipeItem key={ministry.id} name={ministry.name} kind="ministry" assigned={count}
                    busy={managerBusy} open={openDirectoryRow === `ministry:${ministry.id}`}
                    onOpenChange={open => setOpenDirectoryRow(open ? `ministry:${ministry.id}` : '')}
                    editing={isRenaming} confirming={isConfirmingDelete} value={renameValue}
                    onChange={setRenameValue} onRename={() => beginRename(ministry)}
                    onDelete={() => void deleteMinistry(ministry)} onSave={() => void saveMinistryRename(ministry)}
                    onCancelEdit={() => { setRenamingMinistryId(''); setRenameValue('') }}
                    onConfirmDelete={() => void confirmManagerDelete()} onCancelDelete={() => setManagerDeleteTarget(null)}/>
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
          </div>

          <div className="ministry-create-row">
            <input
              aria-label="New church name"
              disabled={managerBusy}
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
            <button className="secondary-button" type="button" disabled={managerBusy} onClick={() => void addManagedBranch()}>
              <Plus size={17} />
              Add Church
            </button>
          </div>

          {branchMessage && <DirectoryNotice {...managerNoticeDetails(branchMessage, blockedBranchId)}
            actionLabel={blockedBranchId ? 'View Affected Members' : undefined}
            onAction={blockedBranchId ? () => viewAffectedBranchMembers(blockedBranchId) : undefined}>
            {managerMessageContent(branchMessage)}
          </DirectoryNotice>}

          <div className="lc-directory-list-heading"><strong>Churches <span>{branches.length}</span></strong><small>Swipe left or use ⋯ for actions.</small></div>
          {branches.length === 0 && <div className="empty-state compact-empty-state"><p>No churches have been created yet.</p></div>}
          <div className="ministry-management-list lc-directory-list" aria-label="Churches">
            {branches.map((branch) => {
              const count = branchMemberCount(branch.id)
              const isRenaming = renamingBranchId === branch.id
              const isConfirmingDelete = managerDeleteTarget?.kind === 'branch' && managerDeleteTarget.item.id === branch.id
              return (
                <DirectorySwipeItem key={branch.id} name={branch.name} kind="church" assigned={count}
                  busy={managerBusy} open={openDirectoryRow === `branch:${branch.id}`}
                  onOpenChange={open => setOpenDirectoryRow(open ? `branch:${branch.id}` : '')}
                  editing={isRenaming} confirming={isConfirmingDelete} value={branchRenameValue}
                  onChange={setBranchRenameValue} onRename={() => beginBranchRename(branch)}
                  onDelete={() => void deleteBranch(branch)} onSave={() => void saveBranchRename(branch)}
                  onCancelEdit={() => { setRenamingBranchId(''); setBranchRenameValue('') }}
                  onConfirmDelete={() => void confirmManagerDelete()} onCancelDelete={() => setManagerDeleteTarget(null)}/>
              )
            })}
          </div>
        </section>
      )}
        </section>
      )}</MotionPresence>

      <MotionPresence show={Boolean(showForm)}>{showForm && (
        <MemberEditor key={editingMember?.id ?? 'new'} sectionRef={memberFormRef} editingName={editingMember ? memberName(editingMember) : undefined}
          value={form} onChange={patch => setForm(current => ({ ...current, ...patch }))}
          errors={contactFieldErrors} onClearContactError={key => setContactFieldErrors(current => ({ ...current, [key]: undefined }))}
          churches={branches} ministries={ministries} onToggleChurch={toggleBranch} onToggleMinistry={toggleMinistry}
          newChurchName={newBranchName} newMinistryName={newMinistryName}
          onNewChurchName={setNewBranchName} onNewMinistryName={setNewMinistryName}
          onAddChurch={() => void addBranch()} onAddMinistry={() => void addMinistry()}
          branchLoadError={branchLoadError} saving={saving} message={message ? uiMessage(message) : ''}
          onSubmit={handleSave} onClose={closeForm}
          onDelete={editingMember ? () => { setDeleteConfirmation(''); setDeleteTarget(editingMember) } : undefined}/>
      )}</MotionPresence>

      <section className="directory-card members-directory-workspace" ref={directoryListRef} aria-label="Member Directory">
        <div className="directory-toolbar member-toolbar members-directory-toolbar">
          <div className="members-directory-heading">
            <div>
              <p className="members-directory-kicker">People &amp; Community</p>
              <h2>Member Directory</h2>
              <p className="members-directory-count" aria-live="polite">
                <strong>{directoryBusy ? 'Updating…' : directoryStats.total.toLocaleString() + ' matching'}</strong>
                <span>of {directoryStats.registered.toLocaleString()} registered members</span>
              </p>
            </div>
            <button className={`bulk-mode-button ${bulkMode ? 'is-active' : ''}`} type="button"
              disabled={bulkSaving || statusBusyIds.length > 0} aria-pressed={bulkMode}
              onClick={() => bulkMode ? closeBulkMode() : openBulkMode()}>
              <ListChecks size={16}/>{bulkMode ? 'Done Selecting' : 'Select Members'}
            </button>
          </div>
          <div className="member-directory-controls">
            <div className="members-directory-search">
              <label htmlFor="members-directory-search">Search Directory</label>
              <div className="members-directory-search-field">
                <Search size={17} aria-hidden="true"/>
                <input id="members-directory-search" aria-label="Search Members" value={search}
                  onChange={event => setSearch(event.target.value)} placeholder="Name, member no. or contact"/>
                {search && <button type="button" aria-label="Clear Member Search" onClick={() => setSearch('')}><X size={15}/></button>}
              </div>
            </div>
            <MobileFold title="Refine Directory">
              <label className={`members-directory-filter ${filterSpotlight === 'ministry' ? 'filter-select-spotlight' : ''}`}>
                <span>Ministry</span>
                <ResponsiveSelect aria-label="Filter by Ministry" value={ministryFilter} onChange={event => setMinistryFilter(event.target.value)}>
                  <option value="all">All Ministries</option><option value="none">No Ministry</option>
                  {ministries.map(ministry => <option key={ministry.id} value={ministry.id}>{ministry.name}</option>)}
                </ResponsiveSelect>
              </label>
              <label className={`members-directory-filter ${filterSpotlight === 'branch' ? 'filter-select-spotlight' : ''}`}>
                <span>Church</span>
                <ResponsiveSelect aria-label="Filter by Church" value={branchFilter} onChange={event => setBranchFilter(event.target.value)}>
                  <option value="all">All Churches</option>
                  {branchesForFilter.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </ResponsiveSelect>
              </label>
              <label className="members-directory-filter">
                <span>Show</span>
                <ResponsiveSelect aria-label="Member Status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                  <option value="all">Everyone</option><option value="active">Active Members</option>
                  <option value="inactive">Inactive Members</option><option value="vip">Starred Members</option>
                </ResponsiveSelect>
              </label>
            </MobileFold>
            <label className="members-directory-filter members-directory-sort">
              <span>Sort By</span>
              <GlideSelect ariaLabel="Sort Members" value={sortBy} menuWidth={230} align="right" searchable={false}
                options={Object.entries(sortLabels).map(([value,label]) => ({value,label}))}
                onChange={value => setSortBy(value as SortOption)}/>
            </label>
          </div>
        </div>
        <div className="members-directory-scope">
          {activeDirectoryFilters.length > 0 ? <>
            <div className="members-directory-filter-chips">
              {activeDirectoryFilters.map(filter => <button type="button" key={filter.key} onClick={filter.clear}
                title={filter.label} aria-label={`Remove ${filter.key} filter`}><span>{filter.label}</span><X size={12} aria-hidden="true"/></button>)}
            </div>
            <button type="button" className="members-directory-reset" onClick={clearDirectoryFilters}>Clear Filters</button>
          </> : <p>Open a name for their profile. Change status directly in the list.</p>}
        </div>
        <ExportPanel label="Export Members" title="Choose Your CSV"
          summaryText={directoryBusy ? 'Updating directory…' : `${directoryStats.total.toLocaleString()} matching · All Pages`}
          subtitle="All matching members, with your current filters and sort order."
          quick="Contact details, status, stars, churches and ministries."
          detailed="Quick CSV plus member IDs, registration dates and private admin notes."
          hint="Latest saved data · Starred first · Up to 20,000 members. Selections do not limit this export. In Excel, import Mobile as Text to keep leading zeros."
          disabled={csvBusy||directoryBusy||!!directoryError||saving||bulkSaving||statusBusyIds.length > 0}
          onQuick={()=>void exportDirectory(false)} onDetailed={()=>void exportDirectory(true)}>
          {csvBusy&&<p className="lcse-message" role="status">Preparing your member export…</p>}
          {csvMessage&&<p className="lcse-message" role="status">{csvMessage}</p>}
          {csvError&&<p className="lcse-message lcse-error" role="alert">{csvError}</p>}
        </ExportPanel>

        {bulkMode && (
          <div ref={bulkToolbarRef} className="bulk-action-bar members-selection-toolbar" role="group" aria-label="Bulk Member Actions"
            data-has-selection={selectedMemberIds.length > 0 || undefined}>
            <div className="members-selection-summary">
              <span className="members-selection-symbol" aria-hidden="true"><ListChecks size={18}/></span>
              <span role="status"><strong>{bulkSaving ? 'Saving Changes…' : selectedMemberIds.length === 0
                ? 'No Members Selected'
                : `${selectedMemberIds.length} Member${selectedMemberIds.length === 1 ? '' : 's'} Selected`}</strong>
                <small>{selectedMemberIds.length === 0 ? 'Use the checkboxes below, or select this page.' : 'Selections stay with you across pages.'}</small>
              </span>
            </div>
            {selectedMemberIds.length === 0 && <button type="button" className="bulk-action-button members-selection-page"
              disabled={directoryBusy || !pageMembers.length || bulkSaving || statusBusyIds.length > 0}
              onClick={togglePageMemberSelection}><ListChecks size={14} aria-hidden="true"/>Select This Page</button>}
            {selectedMemberIds.length > 0 && (
              <div className="members-selection-actions">
                <button
                  type="button"
                  className="bulk-action-button"
                  disabled={bulkSaving || statusBusyIds.length > 0}
                  onClick={() => void updateSelectedMembersStatus('active')}
                >
                  <Check size={14} aria-hidden="true"/>Mark Active
                </button>
                <button
                  type="button"
                  className="bulk-action-button"
                  disabled={bulkSaving || statusBusyIds.length > 0}
                  onClick={() => void updateSelectedMembersStatus('inactive')}
                >
                  <X size={14} aria-hidden="true"/>Mark Inactive
                </button>
                <button
                  type="button"
                  className="bulk-delete-button"
                  disabled={bulkSaving || statusBusyIds.length > 0}
                  onClick={() => {
                    setBulkDeleteConfirmation('')
                    setShowBulkDelete(true)
                  }}
                >
                  <Trash2 size={14} aria-hidden="true"/>Delete Selected
                </button>
                <button
                  type="button"
                  className="members-selection-clear"
                  disabled={bulkSaving}
                  onClick={() => setSelectedMemberIds([])}
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>
        )}

        {directoryBusy && dataKey !== requestKey ? (
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
          <div className={`member-list members-directory-list ${bulkMode ? 'is-bulk-mode' : ''}`}>
            <div className="members-directory-list-heading">
              {bulkMode && <label className="members-directory-select-all" title="Select Members on this page">
                <input type="checkbox" aria-label="Select Members on This Page"
                  checked={pageMembers.length > 0 && pageMembers.every(member => selectedMemberIds.includes(member.id))}
                  onChange={togglePageMemberSelection}/>
              </label>}
              <span>Member</span><span>Community</span><span>Status</span><span className="members-directory-actions-label">Actions</span>
            </div>
            {pageMembers.map(member => <MemberDirectoryRow key={member.id} member={member}
              ministryNames={getMemberMinistries(member).map(ministry => ministry.name)}
              churchNames={getMemberBranches(member).map(church => church.name)}
              bulkMode={bulkMode} selected={selectedMemberIds.includes(member.id)}
              statusBusy={statusBusyIds.includes(member.id)}
              disabled={directoryBusy || saving || bulkSaving || statusBusyIds.includes(member.id) || editingMember?.id === member.id}
              onSelect={() => toggleMemberSelection(member.id)} onView={() => void openMemberDetails(member)}
              onQr={() => setSelectedMember(member)} onEdit={() => openEditForm(member)}
              onStar={() => void toggleStar(member)} onNote={() => setNoteMember(member)}
              onToggleStatus={() => void toggleMemberStatus(member)}/>)}
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
                <ResponsiveSelect id="members-page-size" aria-label="Members per Page" value={membersPerPage} onChange={(event) => setMembersPerPage(Number(event.target.value))}>
                  <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                </ResponsiveSelect>
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

      {selectedMember && <MemberQrDialog key={`qr:${selectedMember.id}`} member={selectedMember}
        onClose={() => setSelectedMember(null)} onDownload={() => void downloadMemberId(selectedMember)}/>}

      {detailMember && <MemberProfilePanel key={`profile:${detailMember.id}`} member={detailMember}
        onClose={closeMemberDetails} onEdit={() => { closeMemberDetails(); openEditForm(detailMember) }}
        onQr={() => { closeMemberDetails(); setSelectedMember(detailMember) }}
        onNote={() => { closeMemberDetails(); setNoteMember(detailMember) }}
        churches={getMemberBranches(detailMember)} ministries={getMemberMinistries(detailMember)}
        attendance={memberAttendance} attendanceLoading={detailsLoading} attendanceError={attendanceError}
        attendanceTotal={attendanceTotal} attendancePage={attendancePage} attendancePageSize={attendancePageSize}
        onAttendancePage={page => void goToAttendancePage(page)}
        onAttendanceRetry={() => void loadMemberAttendance(detailMember.id, attendancePage)}/>}

      {noteMember && <MemberNotePanel key={`note:${noteMember.id}`} member={noteMember}
        onClose={() => setNoteMember(null)} onSave={note => savePrivateNote(noteMember, note)}
        onViewProfile={() => { setNoteMember(null); void openMemberDetails(noteMember) }}/>}

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
