import { useId, useState, type FormEventHandler, type Ref } from 'react'
import { Check, ChevronDown, Church, HandHeart, LoaderCircle, LockKeyhole, Mail, Phone, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import './MemberEditor.css'

export type MemberEditorValue = {
  firstName: string
  lastName: string
  email: string
  mobile: string
  status: 'active' | 'inactive'
  branchIds: string[]
  ministryIds: string[]
  adminNote: string
}

type Entry = { id: string; name: string }
type Props = {
  sectionRef: Ref<HTMLElement>
  editingName?: string
  value: MemberEditorValue
  onChange: (patch: Partial<MemberEditorValue>) => void
  errors: { email?: string; mobile?: string }
  onClearContactError: (key: 'email' | 'mobile') => void
  churches: Entry[]
  ministries: Entry[]
  onToggleChurch: (id: string) => void
  onToggleMinistry: (id: string) => void
  newChurchName: string
  newMinistryName: string
  onNewChurchName: (value: string) => void
  onNewMinistryName: (value: string) => void
  onAddChurch: () => void
  onAddMinistry: () => void
  branchLoadError: string
  saving: boolean
  message: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
  onDelete?: () => void
}

function AffiliationPicker({ kind, entries, selected, onToggle, draft, onDraft, onAdd, error }: {
  kind: 'church' | 'ministry'; entries: Entry[]; selected: string[]; onToggle: (id: string) => void
  draft: string; onDraft: (value: string) => void; onAdd: () => void; error?: string
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const id = useId()
  const churches = kind === 'church'
  const title = churches ? 'Churches' : 'Ministries'
  const Icon = churches ? Church : HandHeart
  const matching = entries.filter(entry => entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const selectedNames = entries.filter(entry => selected.includes(entry.id))

  return <section className={`lc-member-editor__affiliations lc-member-editor__affiliations--${kind}`} aria-labelledby={`${id}-title`}>
    <div className="lc-member-editor__section-heading">
      <span className="lc-member-editor__section-icon" aria-hidden="true"><Icon size={18}/></span>
      <div><h3 id={`${id}-title`}>{title}{churches && <span className="lc-member-editor__required"> *</span>}</h3>
        <p>{churches ? 'Choose at least one community.' : 'Choose the teams they serve with.'}</p></div>
      <span className="lc-member-editor__count" aria-label={`${selected.length} ${title.toLowerCase()} selected`}>{selected.length} Selected</span>
    </div>
    {selectedNames.length > 0 && <div className="lc-member-editor__selected" aria-label={`Selected ${title.toLowerCase()}`}>
      {selectedNames.map(entry => <button key={entry.id} type="button" onClick={() => onToggle(entry.id)} aria-label={`Remove ${entry.name} from selected ${title.toLowerCase()}`}>
        <span>{entry.name}</span><X size={12} aria-hidden="true"/>
      </button>)}
    </div>}
    {entries.length > 0 && <>
      <label className="lc-member-editor__search" htmlFor={`${id}-search`}>
        <Search size={15} aria-hidden="true"/>
        <input id={`${id}-search`} type="search" aria-label={`Search ${title.toLowerCase()} to select`} placeholder={churches ? 'Find a Church' : 'Find a Ministry'} value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }}/>
      </label>
      <div className="lc-member-editor__choices" aria-label={`${title} choices`} tabIndex={matching.length > 6 ? 0 : undefined}>
        {matching.map(entry => <label key={entry.id} className="lc-member-editor__choice" data-selected={selected.includes(entry.id) || undefined}>
          <input type="checkbox" checked={selected.includes(entry.id)} onChange={() => onToggle(entry.id)}/>
          <span className="lc-member-editor__choice-mark" aria-hidden="true"><Check size={12}/></span>
          <span>{entry.name}</span>
        </label>)}
        {!matching.length && <p className="lc-member-editor__empty">No {title.toLowerCase()} match “{query}”.</p>}
      </div>
    </>}
    {!entries.length && <p className="lc-member-editor__empty">No {title.toLowerCase()} yet. Add the first one below.</p>}
    {error && <p className="lc-member-editor__field-error" role="alert">Could not load churches. {error}</p>}
    <div className="lc-member-editor__create">
      <button type="button" className="lc-member-editor__create-toggle" aria-expanded={creating} aria-controls={`${id}-create`} onClick={() => setCreating(current => !current)}>
        <Plus size={14} aria-hidden="true"/><span>{churches ? 'Add a New Church' : 'Add a New Ministry'}</span><ChevronDown size={14} aria-hidden="true"/>
      </button>
      {creating && <div className="lc-member-editor__create-fields" id={`${id}-create`}>
        <label className="lc-member-editor__sr" htmlFor={`${id}-name`}>{churches ? 'New Church Name' : 'New Ministry Name'}</label>
        <input id={`${id}-name`} value={draft} onChange={event => onDraft(event.target.value)} placeholder={churches ? 'e.g. LifeCity - Main' : 'e.g. Dance'}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onAdd() } }}/>
        <button type="button" onClick={onAdd} disabled={!draft.trim()} aria-label={churches ? 'Add Church' : 'Add Ministry'}><Plus size={15} aria-hidden="true"/>Add</button>
      </div>}
    </div>
  </section>
}

export default function MemberEditor({ sectionRef, editingName, value, onChange, errors, onClearContactError,
  churches, ministries, onToggleChurch, onToggleMinistry, newChurchName, newMinistryName, onNewChurchName,
  onNewMinistryName, onAddChurch, onAddMinistry, branchLoadError, saving, message, onSubmit, onClose, onDelete }: Props) {
  const id = useId()
  return <section ref={sectionRef} className="form-card lc-member-editor" aria-labelledby={`${id}-title`}>
    <header className="lc-member-editor__header">
      <span className="lc-member-editor__header-icon" aria-hidden="true"><UserRound size={23}/></span>
      <div className="lc-member-editor__intro"><p className="lc-member-editor__eyebrow">{editingName ? 'Member Profile' : 'Grow Your Community'}</p>
        <h2 id={`${id}-title`}>{editingName ? `Edit ${editingName}` : 'Register a Member'}</h2>
        <p>Personal details, community connections, and a private QR ID.</p>
      </div>
      <div className="lc-member-editor__header-actions">
        <div className="lc-member-editor__status" role="group" aria-label="Member Status">
          {(['active', 'inactive'] as const).map(status => <label key={status} data-selected={value.status === status || undefined}>
            <input type="radio" name={`${id}-status`} checked={value.status === status} onChange={() => onChange({ status })} disabled={saving}/>
            <span className="lc-member-editor__status-dot" aria-hidden="true"/>{status === 'active' ? 'Active' : 'Inactive'}
          </label>)}
        </div>
        <button type="button" className="lc-member-editor__close" onClick={onClose} disabled={saving} aria-label="Close Member Form"><X size={18}/></button>
      </div>
    </header>
    <form className="lc-member-editor__form" onSubmit={onSubmit}>
      <fieldset disabled={saving} className="lc-member-editor__fieldset">
        <div className="lc-member-editor__layout">
          <div className="lc-member-editor__personal">
            <section className="lc-member-editor__basics" aria-label="Member Details">
              <div className="lc-member-editor__field-grid">
                <label className="lc-member-editor__field" htmlFor={`${id}-first`}><span>First Name <b className="lc-member-editor__required">*</b></span>
                  <input id={`${id}-first`} value={value.firstName} onChange={event => onChange({ firstName: event.target.value })} required placeholder="Juan" autoComplete="given-name"/>
                </label>
                <label className="lc-member-editor__field" htmlFor={`${id}-last`}><span>Last Name <b className="lc-member-editor__required">*</b></span>
                  <input id={`${id}-last`} value={value.lastName} onChange={event => onChange({ lastName: event.target.value })} required placeholder="Dela Cruz" autoComplete="family-name"/>
                </label>
                <label className="lc-member-editor__field lc-member-editor__field--wide" htmlFor={`${id}-email`}><span><Mail size={13} aria-hidden="true"/>Email <small>Optional</small></span>
                  <input id={`${id}-email`} type="email" value={value.email} onChange={event => { onChange({ email: event.target.value }); onClearContactError('email') }} placeholder="juan@example.com" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-error` : undefined}/>
                  {errors.email && <span id={`${id}-email-error`} className="lc-member-editor__field-error">{errors.email}</span>}
                </label>
                <label className="lc-member-editor__field lc-member-editor__field--wide" htmlFor={`${id}-mobile`}><span><Phone size={13} aria-hidden="true"/>Mobile Number <small>Optional</small></span>
                  <input id={`${id}-mobile`} value={value.mobile} onChange={event => { onChange({ mobile: event.target.value }); onClearContactError('mobile') }} inputMode="numeric" maxLength={11} placeholder="09171234567" autoComplete="tel-national" aria-invalid={Boolean(errors.mobile)} aria-describedby={errors.mobile ? `${id}-mobile-error` : undefined}/>
                  {errors.mobile && <span id={`${id}-mobile-error`} className="lc-member-editor__field-error">{errors.mobile}</span>}
                </label>
              </div>
            </section>
            <section className="lc-member-editor__note" aria-labelledby={`${id}-note-title`}>
              <div className="lc-member-editor__section-heading"><span className="lc-member-editor__section-icon" aria-hidden="true"><LockKeyhole size={17}/></span>
                <div><h3 id={`${id}-note-title`}>A Private Reminder</h3><p>For administrators. Kept off the member ID.</p></div>
              </div>
              <label className="lc-member-editor__sr" htmlFor={`${id}-note`}>Admin Note</label>
              <textarea id={`${id}-note`} value={value.adminNote} onChange={event => onChange({ adminNote: event.target.value })} placeholder="Add context that helps your team care for this member…" rows={4} maxLength={1000} aria-describedby={`${id}-note-count`}/>
              <p id={`${id}-note-count`} className="lc-member-editor__note-count">{value.adminNote.length.toLocaleString()} / 1,000</p>
            </section>
          </div>
          <div className="lc-member-editor__community">
            <AffiliationPicker kind="church" entries={churches} selected={value.branchIds} onToggle={onToggleChurch} draft={newChurchName} onDraft={onNewChurchName} onAdd={onAddChurch} error={branchLoadError}/>
            <AffiliationPicker kind="ministry" entries={ministries} selected={value.ministryIds} onToggle={onToggleMinistry} draft={newMinistryName} onDraft={onNewMinistryName} onAdd={onAddMinistry}/>
          </div>
        </div>
        {message && <div className="lc-member-editor__feedback" role="alert">{message}</div>}
        <footer className="lc-member-editor__footer">
          <p><LockKeyhole size={14} aria-hidden="true"/>{editingName ? 'Your changes update this member’s directory profile.' : 'A private QR ID is created when you save.'}</p>
          <div className="lc-member-editor__actions">
            {onDelete && <button type="button" className="lc-member-editor__delete" onClick={onDelete}><Trash2 size={15} aria-hidden="true"/>Delete Member</button>}
            <button type="button" className="lc-member-editor__cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="lc-member-editor__save">{saving ? <LoaderCircle size={17} className="lc-member-editor__spinner" aria-hidden="true"/> : <Check size={17} aria-hidden="true"/>}{saving ? 'Saving…' : editingName ? 'Save Changes' : 'Save Member'}</button>
          </div>
        </footer>
      </fieldset>
    </form>
  </section>
}
