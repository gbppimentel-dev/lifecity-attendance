import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Clock3, X } from 'lucide-react'
import ServicePickerDialog from './ServicePickerDialog'
import { formatServiceTime, nextQuarterTime, parseServiceTime, quarterMinutes, quarterTime, type Period } from '../lib/serviceSchedule'
import './ServiceTimePicker.css'

export default function ServiceTimePicker({ id, value, onChange, disabled = false, required = false }: {
  id: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean
}) {
  const uid = useId(), trigger = useRef<HTMLButtonElement>(null)
  const selected = parseServiceTime(value)
  const [open, setOpen] = useState(false), [invalid, setInvalid] = useState(false)
  const [draft, setDraft] = useState(() => selected ?? nextQuarterTime())
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => { if (parseServiceTime(value)) setInvalid(false) }, [value])
  const next = quarterTime(draft.hour, draft.minute, draft.period)
  const legacyMinute = selected && !quarterMinutes.some(minute => minute === selected.minute)
  function show() {
    if (disabled || trigger.current?.matches(':disabled')) return
    setDraft(parseServiceTime(value) ?? nextQuarterTime()); setOpen(true)
  }
  function choiceKey<T extends string | number>(event: KeyboardEvent<HTMLButtonElement>, values: readonly T[], current: T, columns: number, choose: (value: T) => void) {
    const at = values.indexOf(current)
    let next: number
    if (event.key === 'ArrowRight') next = (at + 1) % values.length
    else if (event.key === 'ArrowLeft') next = (at - 1 + values.length) % values.length
    else if (event.key === 'ArrowDown') next = (at + columns) % values.length
    else if (event.key === 'ArrowUp') next = (at - columns + values.length) % values.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = values.length - 1
    else return
    event.preventDefault(); choose(values[next])
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }
  return <>
    <button ref={trigger} id={id} type="button" className="lc-service-schedule-trigger" data-empty={!selected || undefined}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={`${uid}-dialog`} aria-label={selected ? `Service Time, ${formatServiceTime(value)}` : 'Choose Service Time'}
      aria-required={required} aria-invalid={invalid} aria-describedby={invalid ? `${uid}-error` : undefined} disabled={disabled} onClick={show}>
      <span>{selected ? formatServiceTime(value) : 'Choose a Time'}</span><Clock3 size={16} aria-hidden="true"/>
    </button>
    <input className="lc-service-schedule-validation" type="text" tabIndex={-1} aria-hidden="true" value={selected ? value : ''} onChange={() => {}} required={required} disabled={disabled}
      onInvalid={event => { event.preventDefault(); setInvalid(true); if (event.currentTarget.form?.querySelector('input:invalid') === event.currentTarget) trigger.current?.focus() }}/>
    {invalid && <span className="lc-service-schedule-error" id={`${uid}-error`} role="alert">Choose a service time.</span>}
    <ServicePickerDialog id={`${uid}-dialog`} open={open} onClose={close} disabled={disabled} trigger={trigger} labelledBy={`${uid}-title`} className="lc-service-time-picker">
      <header className="lc-service-picker__header"><span className="lc-service-picker__symbol" aria-hidden="true"><Clock3 size={19}/></span><div><h3 id={`${uid}-title`}>Choose a Time</h3><p>Easy quarter-hour scheduling.</p></div><button type="button" className="lc-service-picker__close" aria-label="Close Time Picker" onClick={close}><X size={17}/></button></header>
      <div className="lc-service-time-picker__preview"><strong>{draft.hour}<span>:</span>{draft.minute}</strong><span>{draft.period}</span></div>
      <div className="lc-service-time-picker__section"><p id={`${uid}-hour`}>Hour</p><div className="lc-service-time-picker__hours" role="group" aria-labelledby={`${uid}-hour`}>{Array.from({ length: 12 }, (_, index) => index + 1).map(hour => <button key={hour} type="button" tabIndex={draft.hour === hour ? 0 : -1} aria-pressed={draft.hour === hour} aria-label={`Hour ${hour}`} data-picker-autofocus={draft.hour === hour || undefined} onClick={() => setDraft(current => ({ ...current, hour }))} onKeyDown={event => choiceKey(event, [1,2,3,4,5,6,7,8,9,10,11,12], hour, 6, nextHour => setDraft(current => ({ ...current, hour: nextHour })))}>{String(hour).padStart(2, '0')}</button>)}</div></div>
      <div className="lc-service-time-picker__section"><p id={`${uid}-minute`}>Minute<span>15-Minute Steps</span></p><div className="lc-service-time-picker__minutes" role="group" aria-labelledby={`${uid}-minute`}>{quarterMinutes.map(minute => <button key={minute} type="button" tabIndex={draft.minute === minute || (!next && minute === '00') ? 0 : -1} aria-pressed={draft.minute === minute} aria-label={`Minute ${minute}`} onClick={() => setDraft(current => ({ ...current, minute }))} onKeyDown={event => choiceKey(event, quarterMinutes, minute, 1, nextMinute => setDraft(current => ({ ...current, minute: nextMinute })))}>{minute}</button>)}</div></div>
      <div className="lc-service-time-picker__period" role="group" aria-label="Time of Day">{(['AM', 'PM'] as Period[]).map(period => <button key={period} type="button" tabIndex={draft.period === period ? 0 : -1} aria-pressed={draft.period === period} onClick={() => setDraft(current => ({ ...current, period }))} onKeyDown={event => choiceKey(event, ['AM', 'PM'] as const, period, 1, nextPeriod => setDraft(current => ({ ...current, period: nextPeriod })))}>{period}<small>{period === 'AM' ? 'Morning' : 'Afternoon / Evening'}</small></button>)}</div>
      {legacyMinute && !next && <p className="lc-service-time-picker__legacy">Current time: {formatServiceTime(value)}. Choose 00, 15, 30 or 45 to update it. Cancel keeps the saved time.</p>}
      <footer className="lc-service-picker__footer"><button type="button" className="lc-service-picker__clear" disabled={!value} onClick={() => { onChange(''); setInvalid(false); close() }}>Clear</button><div><button type="button" onClick={close}>Cancel</button><button type="button" className="lc-service-picker__primary" disabled={!next} onClick={() => { if (next) { onChange(next); setInvalid(false); close() } }}><Check size={13} aria-hidden="true"/>Set Time</button></div></footer>
    </ServicePickerDialog>
  </>
}
