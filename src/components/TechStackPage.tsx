import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Braces, Check, ChevronDown, ChevronLeft, ChevronRight, Cloud, Database, Github, Layers3, Monitor, Network, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { techGroups, techStack, type TechGroup } from '../lib/techStack'
import { techLogos } from '../lib/techLogos'
import { motionEnabled } from '../lib/motion'
import BorderGlow from './BorderGlow'
import TechArchitecture from './TechArchitecture'
import TechStackCore from './TechStackCore'

type Technology = (typeof techStack)[number]
type GroupFilter = TechGroup | 'all'
const groups: Record<TechGroup, { icon: typeof Monitor; tone: string; description: string }> = {
  Interface: { icon: Monitor, tone: 'teal', description: 'The screens, controls, typography and motion people use.' },
  'Data & Identity': { icon: Database, tone: 'lavender', description: 'Sign-in, stored records, access policies and live updates.' },
  'QR & Reports': { icon: Braces, tone: 'amber', description: 'QR codes, camera decoding, CSV imports and downloadable IDs.' },
  'Browser Tools': { icon: Sparkles, tone: 'blue', description: 'Camera, sound, dates and preferences built into the browser.' },
  'Build & Delivery': { icon: Cloud, tone: 'rose', description: 'The tools that check, package, version and host the app.' },
}

function Logos({ item, large = false }: { item: Pick<Technology, 'logos' | 'mark'>; large?: boolean }) {
  return <span className={`lc-stack-logo${large ? ' is-large' : ''}`} data-pair={(item.logos?.length ?? 0) > 1 || undefined} aria-hidden="true">
    {item.logos?.length ? item.logos.map(key => <img key={key} src={techLogos[key].src} alt="" width={large ? 36 : 26} height={large ? 36 : 26}/>) : <span>{item.mark}</span>}
  </span>
}

function ToolDetails({ item, titleId }: { item: Technology; titleId: string }) {
  const meta = groups[item.group]
  return <div className="lc-stack-detail-content" key={item.name} data-tone={meta.tone}>
    <div className="lc-stack-detail-identity"><Logos item={item} large/><span className="lc-stack-detail-group"><meta.icon size={14} aria-hidden="true"/>{item.group}</span></div>
    <h2 id={titleId} tabIndex={-1}>{item.name}</h2>
    <p className="lc-stack-detail-purpose">{item.purpose}</p>
    <section className="lc-stack-explanation"><h3>What It Does</h3><p>{item.about}</p></section>
    <section className="lc-stack-explanation"><h3>Inside LifeCity</h3><p>{item.description}</p></section>
    <section className="lc-stack-steps" aria-label={`${item.name} example flow`}>
      <div className="lc-stack-steps-heading"><span className="lc-stack-steps-symbol" aria-hidden="true"><Network size={17}/></span><div><h3>In Practice</h3><p>A Simple Example</p></div></div>
      <ol role="list">{item.flow.map((step, index) => <li key={step}>
        <span className="lc-stack-step-meta"><span className="lc-stack-step-number" aria-hidden="true">0{index + 1}</span><span>{['Start', 'Process', 'Result'][index]}</span>{index === item.flow.length - 1 && <Check size={12} aria-hidden="true"/>}</span>
        <strong>{step}</strong>
        {index < item.flow.length - 1 && <span className="lc-stack-step-link" aria-hidden="true"><ArrowRight size={12}/></span>}
      </li>)}</ol>
    </section>
  </div>
}

export default function TechStackPage({ onClose }: { onClose: () => void }) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const sheet = useRef<HTMLDialogElement>(null)
  const explorer = useRef<HTMLElement>(null)
  const flow = useRef<HTMLElement>(null)
  const index = useRef<HTMLUListElement>(null)
  const inspector = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const sheetTrigger = useRef<HTMLButtonElement | null>(null)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<GroupFilter>('all')
  const [selectedName, setSelectedName] = useState(techStack[0].name)
  const [flowOpen, setFlowOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [isMobile, setIsMobile] = useState(() => matchMedia('(max-width:760px)').matches)
  const pageSize = 9
  const results = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return techStack.filter(tool => (group === 'all' || tool.group === group) && terms.every(term =>
      `${tool.name} ${tool.mark} ${tool.group} ${tool.purpose} ${tool.about} ${tool.description}`.toLocaleLowerCase().includes(term)))
  }, [query, group])
  const selected = results.find(tool => tool.name === selectedName) ?? results[0] ?? null
  const pageCount = Math.ceil(results.length / pageSize)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const visible = isMobile ? results.slice(currentPage * pageSize, (currentPage + 1) * pageSize) : results

  useEffect(() => {
    const media = matchMedia('(max-width:760px)')
    const update = () => { setIsMobile(media.matches); if (!media.matches) setSheetOpen(false) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => { if (!isMobile && inspector.current) inspector.current.scrollTop = 0 }, [selected?.name, isMobile])

  useLayoutEffect(() => {
    const node = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow, padding = document.body.style.paddingRight
    const gap = Math.max(0, innerWidth - document.documentElement.clientWidth)
    if (gap) document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + gap}px`
    document.body.style.overflow = 'hidden'
    if (node && !node.open) node.showModal()
    return () => {
      sheet.current?.close(); node?.close()
      document.body.style.overflow = overflow; document.body.style.paddingRight = padding
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    const node = sheet.current
    if (!node || !sheetOpen || !isMobile || !selected) return
    if (!node.open) node.showModal()
    node.scrollTop = 0
    const trigger = sheetTrigger.current
    return () => {
      node.close()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [sheetOpen, isMobile, selected?.name])

  function filter(next: GroupFilter) { setGroup(next); setPage(0); setSheetOpen(false) }
  function clearFilters() { setQuery(''); setGroup('all'); setPage(0); setSheetOpen(false); search.current?.focus({ preventScroll: true }) }
  function select(tool: Technology, trigger: HTMLButtonElement, readDetails: boolean) {
    setSelectedName(tool.name)
    if (isMobile) { sheetTrigger.current = trigger; setSheetOpen(true) }
    else if (readDetails) requestAnimationFrame(() => document.getElementById(`${id}-desktop-title`)?.focus({ preventScroll: true }))
  }
  function focusSelectedTool() {
    const button = index.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
    if (button) { button.scrollIntoView({ block: 'nearest', behavior: 'auto' }); button.focus({ preventScroll: true }) }
  }
  function scrollTo(ref: { current: HTMLElement | null }) {
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start', behavior: motionEnabled() ? 'smooth' : 'auto' }))
  }
  function revealFlow() { setFlowOpen(true); scrollTo(flow) }
  function toolKeys(event: KeyboardEvent<HTMLUListElement>) {
    const buttons = Array.from(index.current?.querySelectorAll<HTMLButtonElement>('.lc-stack-tool') ?? [])
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    const columns = isMobile ? 3 : matchMedia('(min-width:1180px)').matches ? 2 : 1
    let next = at
    if (event.key === 'ArrowRight') next = (at + 1) % buttons.length
    else if (event.key === 'ArrowLeft') next = (at - 1 + buttons.length) % buttons.length
    else if (event.key === 'ArrowDown') next = Math.min(at + columns, buttons.length - 1)
    else if (event.key === 'ArrowUp') next = Math.max(at - columns, 0)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else return
    event.preventDefault(); buttons[next]?.focus()
  }

  return createPortal(<dialog ref={dialog} className="lc-tech-page lc-stack-page" aria-labelledby={`${id}-title`}
    onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); onClose() } }}>
    <header className="lc-stack-top"><div className="lc-stack-top-inner">
        <button type="button" className="lc-stack-back" autoFocus onClick={onClose}><ArrowLeft size={16} aria-hidden="true"/>Back to LifeCity</button>
        <span className="lc-stack-top-label"><Layers3 size={15} aria-hidden="true"/>Behind the Experience</span>
        <a className="lc-stack-source" aria-label="Source Code (opens in a new tab)" href="https://github.com/gbppimentel-dev/lifecity-attendance" target="_blank" rel="noopener noreferrer"><Github size={16} aria-hidden="true"/><span>Source Code</span><ArrowUpRight size={13} aria-hidden="true"/><span className="lc-stack-sr"> (opens in a new tab)</span></a>
    </div></header>
    <div className="lc-stack-shell">
      <BorderGlow as="section" className="lc-stack-hero" borderRadius={25} animateBorder>
        <div className="lc-stack-hero-copy"><p className="lc-stack-eyebrow">LifeCity Attendance · Under the Hood</p><h1 id={`${id}-title`}>Tech Stack<span>Built for LifeCity.</span></h1>
          <p className="lc-stack-lead">A closer look at the tools behind your community, check-ins, and everyday moments.</p>
          <div className="lc-stack-hero-actions"><button type="button" onClick={() => scrollTo(explorer)}>Explore the Tech Stack<ArrowDown size={15} aria-hidden="true"/></button><button type="button" onClick={revealFlow}>See the App Flow<Network size={15} aria-hidden="true"/></button></div>
        </div>
        <TechStackCore toolCount={techStack.length} layerCount={techGroups.length}/>
      </BorderGlow>

      <section ref={flow} className="lc-stack-flow" aria-label="Application architecture">
        <button type="button" className="lc-stack-flow-toggle" aria-expanded={flowOpen} aria-controls={`${id}-flow`} onClick={() => setFlowOpen(current => !current)}>
          <span className="lc-stack-flow-symbol"><Network size={21} aria-hidden="true"/></span><span><strong>How It All Connects</strong><small>From the browser to check-ins, records and delivery.</small></span><span className="lc-stack-flow-action">{flowOpen ? 'Hide App Flow' : 'View App Flow'}<ChevronDown size={16} aria-hidden="true"/></span>
        </button>
        {flowOpen && <div id={`${id}-flow`} className="lc-stack-flow-body"><TechArchitecture activeGroup={group === 'all' ? null : group} onExploreGroup={next => { filter(next); scrollTo(explorer) }}/></div>}
      </section>

      <section ref={explorer} className="lc-stack-explorer" aria-labelledby={`${id}-explore-title`}>
        <div className="lc-stack-discovery">
        <div className="lc-stack-explorer-heading"><div className="lc-stack-explorer-intro"><span className="lc-stack-explorer-emblem" aria-hidden="true"><Layers3 size={23}/><i/><i/></span><div><p className="lc-stack-eyebrow"><Sparkles size={11} aria-hidden="true"/>Explore the Building Blocks</p><h2 id={`${id}-explore-title`}>One App. <span>Many Moving Parts.</span></h2><p className="lc-stack-explorer-caption">Find a tool. Follow its role. See LifeCity come together.</p></div></div>
          <label className="lc-stack-search"><Search size={17} aria-hidden="true"/><span className="lc-stack-sr">Search Technologies</span><input ref={search} type="search" aria-label="Search Technologies" value={query} onChange={event => { setQuery(event.target.value); setPage(0); setSheetOpen(false) }} placeholder="Find a tool or capability…"/>{query && <button type="button" aria-label="Clear Technology Search" onClick={() => { setQuery(''); setPage(0); search.current?.focus({ preventScroll: true }) }}><X size={14} aria-hidden="true"/></button>}</label>
        </div>
        <div className="lc-stack-filters" role="group" aria-label="Technology Categories">
          <button type="button" aria-pressed={group === 'all'} onClick={() => filter('all')}><span className="lc-stack-filter-icon"><Layers3 size={16} aria-hidden="true"/></span><span className="lc-stack-filter-name">All Technologies</span><span className="lc-stack-filter-count">{techStack.length}</span></button>
          {techGroups.map(key => { const meta = groups[key]; return <button key={key} type="button" data-tone={meta.tone} aria-pressed={group === key} onClick={() => filter(key)}><span className="lc-stack-filter-icon"><meta.icon size={16} aria-hidden="true"/></span><span className="lc-stack-filter-name">{key}</span><span className="lc-stack-filter-count">{techStack.filter(tool => tool.group === key).length}</span></button> })}
        </div>
        <div className="lc-stack-scope"><p role="status">{results.length} of {techStack.length} tools & capabilities{group !== 'all' ? ` · ${group}` : ''}</p></div>
        </div>
        <span className="lc-stack-sr" role="status">{!isMobile && selected ? `${selected.name} selected. Technology details updated.` : ''}</span>
        <div className="lc-stack-workspace">
          <div className="lc-stack-library">
            <div className="lc-stack-library-heading"><span>{group === 'all' ? 'Technology Library' : group}</span><small>{group === 'all' ? 'Select a technology to see its role.' : groups[group].description}</small></div>
            {results.length ? <ul ref={index} className="lc-stack-list" onKeyDown={toolKeys}>{visible.map(tool => { const meta = groups[tool.group]; return <li key={tool.name}><button type="button" className="lc-stack-tool" data-tone={meta.tone} aria-pressed={selected?.name === tool.name} aria-controls={isMobile ? `${id}-sheet` : `${id}-detail`} aria-haspopup={isMobile ? 'dialog' : undefined} onClick={event => select(tool, event.currentTarget, event.detail === 0)}>
              <Logos item={tool}/><span className="lc-stack-tool-copy"><strong>{tool.name}</strong><small>{tool.purpose}</small></span><span className="lc-stack-tool-arrow" aria-hidden="true">{selected?.name === tool.name ? <Check size={14}/> : <ArrowUpRight size={14}/>}</span>
            </button></li> })}</ul> : <div className="lc-stack-empty"><Search size={26} aria-hidden="true"/><h3>No Technologies Found</h3><p>Try a tool name, a capability, or a different category.</p><button type="button" onClick={clearFilters}>Reset the Library<ArrowRight size={15} aria-hidden="true"/></button></div>}
            {isMobile && results.length > pageSize && <nav className="lc-stack-pagination" aria-label="Technology Pages"><button type="button" disabled={currentPage === 0} aria-label="Previous Technologies" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} aria-hidden="true"/></button><span aria-live="polite">{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, results.length)} of {results.length}</span><button type="button" disabled={currentPage >= pageCount - 1} aria-label="Next Technologies" onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} aria-hidden="true"/></button></nav>}
          </div>
          {!isMobile && <aside ref={inspector} id={`${id}-detail`} className="lc-stack-inspector" tabIndex={0} aria-label={selected ? `${selected.name} Details` : 'Technology Details'}>
            <div className="lc-stack-inspector-bar"><span><span/>A Closer Look</span><button type="button" disabled={!selected} onClick={focusSelectedTool}>Back to Library<ArrowLeft size={12} aria-hidden="true"/></button></div>
            {selected ? <ToolDetails item={selected} titleId={`${id}-desktop-title`}/> : <div className="lc-stack-inspector-placeholder"><Layers3 size={28} aria-hidden="true"/><h3>A Place for Every Part</h3><p>Your selected technology will appear here when the library has a matching result.</p></div>}
          </aside>}
        </div>
      </section>
      <footer className="lc-stack-end"><span><Layers3 size={15} aria-hidden="true"/>LifeCity Attendance · Web Edition</span><p>Built with care. Logos belong to their respective owners; browser marks represent platform capabilities.</p></footer>
    </div>
    <dialog ref={sheet} id={`${id}-sheet`} className="lc-stack-sheet" aria-labelledby={selected ? `${id}-sheet-title` : undefined} aria-label={selected ? undefined : 'Technology Details'}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); setSheetOpen(false) }}
      onClose={() => setSheetOpen(false)} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setSheetOpen(false) } }}>
      <header className="lc-stack-sheet-bar"><span>Technology Details</span><button type="button" autoFocus aria-label="Close Technology Details" onClick={() => setSheetOpen(false)}><X size={19} aria-hidden="true"/></button></header>
      {sheetOpen && selected && <ToolDetails item={selected} titleId={`${id}-sheet-title`}/>}
    </dialog>
  </dialog>, document.body)
}
