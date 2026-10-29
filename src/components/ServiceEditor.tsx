import { useId, type FormEventHandler, type Ref } from 'react'
import { CalendarCheck, CalendarDays, Check, Clock3, Globe2, LoaderCircle, LockKeyhole, MapPin, X } from 'lucide-react'
import ServiceDatePicker from './ServiceDatePicker'
import ServiceTimePicker from './ServiceTimePicker'
import './ServiceEditor.css'

export type ServiceEditorValue = {
  name: string
  startsDate: string
  startsTime: string
  location: string
  adminNote: string
  isSundayService: boolean
  isPublic: boolean
}

type Props = {
  sectionRef: Ref<HTMLElement>
  editingName?: string
  value: ServiceEditorValue
  onChange: (patch: Partial<ServiceEditorValue>) => void
  saving: boolean
  message: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export default function ServiceEditor({ sectionRef, editingName, value, onChange, saving, message, onSubmit, onClose }: Props) {
  const id = useId()
  return <section id="service-editor" ref={sectionRef} className="form-card lc-service-editor" aria-labelledby={`${id}-title`}>
    <header className="lc-service-editor__header">
      <span className="lc-service-editor__header-icon" aria-hidden="true"><CalendarDays size={23}/></span>
      <div className="lc-service-editor__intro">
        <p className="lc-service-editor__eyebrow">{editingName ? 'Service Details' : 'Bring People Together'}</p>
        <h2 id={`${id}-title`} tabIndex={-1}>{editingName ? 'Update This Service' : 'Create a Service'}</h2>
        <p>{editingName ? editingName : 'A time, a place, and a gathering to remember.'}</p>
      </div>
      <button type="button" className="lc-service-editor__close" aria-label="Close Service Form" onClick={onClose} disabled={saving}><X size={18}/></button>
    </header>
    <form className="lc-service-editor__form" onSubmit={onSubmit} aria-busy={saving}>
      <fieldset className="lc-service-editor__fieldset" disabled={saving}>
        <div className="lc-service-editor__layout">
          <section className="lc-service-editor__details" aria-label="Service Details">
            <label className="lc-service-editor__field lc-service-editor__field--wide" htmlFor={`${id}-name`}>
              <span>Service Name <b className="lc-service-editor__required">*</b></span>
              <input id={`${id}-name`} value={value.name} onChange={event => onChange({ name: event.target.value })} placeholder="e.g. Sunday Celebration" required/>
            </label>
            <div className="lc-service-editor__field">
              <label className="lc-service-editor__schedule-label" htmlFor={`${id}-date`}><CalendarDays size={13} aria-hidden="true"/>Date <b className="lc-service-editor__required">*</b></label>
              <ServiceDatePicker id={`${id}-date`} value={value.startsDate} onChange={date => onChange({ startsDate: date })} disabled={saving} required/>
            </div>
            <div className="lc-service-editor__field">
              <label className="lc-service-editor__schedule-label" htmlFor={`${id}-time`}><Clock3 size={13} aria-hidden="true"/>Time <b className="lc-service-editor__required">*</b></label>
              <ServiceTimePicker id={`${id}-time`} value={value.startsTime} onChange={time => onChange({ startsTime: time })} disabled={saving} required/>
            </div>
            <label className="lc-service-editor__field lc-service-editor__field--wide" htmlFor={`${id}-location`}>
              <span><MapPin size={13} aria-hidden="true"/>Location <small>Optional</small></span>
              <input id={`${id}-location`} value={value.location} onChange={event => onChange({ location: event.target.value })} placeholder="e.g. Main Worship Hall"/>
            </label>
          </section>
          <section className="lc-service-editor__note" aria-labelledby={`${id}-note-title`}>
            <div className="lc-service-editor__section-heading">
              <span className="lc-service-editor__section-icon" aria-hidden="true"><LockKeyhole size={17}/></span>
              <div><h3 id={`${id}-note-title`}>A Private Service Note</h3><p>Context for your administrators, kept out of Guest Preview.</p></div>
              <span className="lc-service-editor__optional">Optional</span>
            </div>
            <label className="lc-service-editor__sr" htmlFor={`${id}-note`}>Service Note</label>
            <textarea id={`${id}-note`} value={value.adminNote} onChange={event => onChange({ adminNote: event.target.value })} placeholder="Add a reminder, special arrangement, or context for attendance…" rows={5}/>
          </section>
          <section className="lc-service-editor__options" aria-labelledby={`${id}-options-title`}>
            <div className="lc-service-editor__options-heading"><h3 id={`${id}-options-title`}>Service Options</h3><p>Choose how this service appears and tracks attendance.</p></div>
            <div className="lc-service-editor__choice-grid">
              <label className="lc-service-editor__choice lc-service-editor__choice--sunday" data-selected={value.isSundayService || undefined}>
                <input type="checkbox" checked={value.isSundayService} onChange={event => onChange({ isSundayService: event.target.checked })} aria-labelledby={`${id}-sunday-title`} aria-describedby={`${id}-sunday-description`}/>
                <span className="lc-service-editor__choice-icon" aria-hidden="true"><CalendarCheck size={20}/></span>
                <span className="lc-service-editor__choice-copy"><strong id={`${id}-sunday-title`}>Sunday Service</strong><small id={`${id}-sunday-description`}>Show check-ins alongside the percentage of active members attending.</small></span>
                <span className="lc-service-editor__choice-check" aria-hidden="true"><Check size={13}/></span>
              </label>
              <label className="lc-service-editor__choice lc-service-editor__choice--public" data-selected={value.isPublic || undefined}>
                <input type="checkbox" checked={value.isPublic} onChange={event => onChange({ isPublic: event.target.checked })} aria-labelledby={`${id}-public-title`} aria-describedby={`${id}-public-description`}/>
                <span className="lc-service-editor__choice-icon" aria-hidden="true"><Globe2 size={20}/></span>
                <span className="lc-service-editor__choice-copy"><strong id={`${id}-public-title`}>Show in Guest Preview</strong><small id={`${id}-public-description`}>Share the name, schedule, and venue for current and upcoming services. Notes and attendance stay private.</small></span>
                <span className="lc-service-editor__choice-check" aria-hidden="true"><Check size={13}/></span>
              </label>
            </div>
          </section>
        </div>
        {message && <div className="lc-service-editor__feedback" role="alert">{message}</div>}
        <footer className="lc-service-editor__footer">
          <p><CalendarDays size={14} aria-hidden="true"/>{editingName ? 'Your updates appear in the service directory.' : 'You can update these details after saving.'}</p>
          <div className="lc-service-editor__actions">
            <button type="button" className="lc-service-editor__cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="lc-service-editor__save">{saving ? <LoaderCircle size={17} className="lc-service-editor__spinner" aria-hidden="true"/> : <Check size={17} aria-hidden="true"/>}{saving ? 'Saving…' : editingName ? 'Save Changes' : 'Save Service'}</button>
          </div>
        </footer>
      </fieldset>
    </form>
  </section>
}
