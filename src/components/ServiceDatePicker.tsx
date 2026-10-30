import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import GlideSelect from './GlideSelect';
import ServicePickerDialog from './ServicePickerDialog';
import {
  addCalendarDays,
  calendarDate,
  isoDate,
  manilaToday,
  moveCalendarMonth,
  parseServiceDate,
} from '../lib/serviceSchedule';
import './service-date-picker.css';

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const readable = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const fullDate = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export default function ServiceDatePicker({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const uid = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const selected = parseServiceDate(value),
    today = manilaToday();
  const [open, setOpen] = useState(false),
    [invalid, setInvalid] = useState(false);
  const [view, setView] = useState(() => selected ?? today);
  const [focused, setFocused] = useState(() => isoDate(selected ?? today));
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (parseServiceDate(value)) setInvalid(false);
  }, [value]);
  const start = calendarDate(view.getUTCFullYear(), view.getUTCMonth(), 1);
  const first = addCalendarDays(start, -start.getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => addCalendarDays(first, index));
  const firstYear = Math.min(1900, view.getUTCFullYear() - 20),
    lastYear = Math.max(today.getUTCFullYear() + 30, view.getUTCFullYear() + 20);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) =>
    String(firstYear + index),
  );
  function show() {
    if (disabled || trigger.current?.matches(':disabled')) return;
    const date = parseServiceDate(value) ?? manilaToday();
    setView(date);
    setFocused(isoDate(date));
    setOpen(true);
  }
  function choose(date: Date) {
    onChange(isoDate(date));
    setInvalid(false);
    close();
  }
  function moveView(date: Date) {
    setView(date);
    setFocused(isoDate(calendarDate(date.getUTCFullYear(), date.getUTCMonth(), 1)));
  }
  function focusDay(date: Date) {
    const next = isoDate(date);
    setFocused(next);
    setView(date);
    requestAnimationFrame(() =>
      grid.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
        ?.focus({ preventScroll: true }),
    );
  }
  function dayKey(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    let next: Date;
    if (event.key === 'ArrowRight') next = addCalendarDays(date, 1);
    else if (event.key === 'ArrowLeft') next = addCalendarDays(date, -1);
    else if (event.key === 'ArrowDown') next = addCalendarDays(date, 7);
    else if (event.key === 'ArrowUp') next = addCalendarDays(date, -7);
    else if (event.key === 'Home') next = addCalendarDays(date, -date.getUTCDay());
    else if (event.key === 'End') next = addCalendarDays(date, 6 - date.getUTCDay());
    else if (event.key === 'PageUp') next = moveCalendarMonth(date, event.shiftKey ? -12 : -1);
    else if (event.key === 'PageDown') next = moveCalendarMonth(date, event.shiftKey ? 12 : 1);
    else return;
    event.preventDefault();
    focusDay(next);
  }
  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="lc-service-schedule-trigger"
        data-empty={!selected || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${uid}-dialog`}
        aria-label={selected ? `Service Date, ${readable.format(selected)}` : 'Choose Service Date'}
        aria-required={required}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${uid}-error` : undefined}
        disabled={disabled}
        onClick={show}
      >
        <span>{selected ? readable.format(selected) : 'Choose a Date'}</span>
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      <input
        className="lc-service-schedule-validation"
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        value={selected ? value : ''}
        onChange={() => {}}
        required={required}
        disabled={disabled}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          if (event.currentTarget.form?.querySelector('input:invalid') === event.currentTarget)
            trigger.current?.focus();
        }}
      />
      {invalid && (
        <span className="lc-service-schedule-error" id={`${uid}-error`} role="alert">
          Choose a service date.
        </span>
      )}
      <ServicePickerDialog
        id={`${uid}-dialog`}
        open={open}
        onClose={close}
        disabled={disabled}
        trigger={trigger}
        labelledBy={`${uid}-title`}
        className="lc-service-date-picker"
      >
        <header className="lc-service-picker__header">
          <span className="lc-service-picker__symbol" aria-hidden="true">
            <CalendarDays size={19} />
          </span>
          <div>
            <h3 id={`${uid}-title`}>Choose a Date</h3>
            <p>Pick the day for your gathering.</p>
          </div>
          <button
            type="button"
            className="lc-service-picker__close"
            aria-label="Close Date Picker"
            onClick={close}
          >
            <X size={17} />
          </button>
        </header>
        <div className="lc-service-date-picker__navigation">
          <button
            type="button"
            className="lc-service-date-picker__arrow"
            aria-label="Previous Month"
            onClick={() => moveView(moveCalendarMonth(start, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <GlideSelect
            ariaLabel="Calendar Month"
            value={String(view.getUTCMonth())}
            options={monthNames.map((label, month) => ({ value: String(month), label }))}
            onChange={(month) => moveView(calendarDate(view.getUTCFullYear(), Number(month), 1))}
            showTags={false}
            searchable={false}
            menuWidth={150}
            size="sm"
          />
          <GlideSelect
            ariaLabel="Calendar Year"
            value={String(view.getUTCFullYear())}
            options={years}
            onChange={(year) => moveView(calendarDate(Number(year), view.getUTCMonth(), 1))}
            showTags={false}
            menuWidth={130}
            size="sm"
          />
          <button
            type="button"
            className="lc-service-date-picker__arrow"
            aria-label="Next Month"
            onClick={() => moveView(moveCalendarMonth(start, 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <p className="lc-service-date-picker__month" aria-live="polite">
          {monthNames[view.getUTCMonth()]} {view.getUTCFullYear()}
        </p>
        <div className="lc-service-date-picker__weekdays" aria-hidden="true">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div
          ref={grid}
          className="lc-service-date-picker__grid"
          role="grid"
          aria-label={`${monthNames[view.getUTCMonth()]} ${view.getUTCFullYear()}`}
        >
          {Array.from({ length: 6 }, (_, week) => (
            <div role="row" key={week}>
              {days.slice(week * 7, week * 7 + 7).map((date) => {
                const key = isoDate(date),
                  isSelected = value === key;
                return (
                  <div role="gridcell" key={key} aria-selected={isSelected}>
                    <button
                      type="button"
                      data-date={key}
                      data-picker-autofocus={key === focused || undefined}
                      data-outside={date.getUTCMonth() !== view.getUTCMonth() || undefined}
                      data-selected={isSelected || undefined}
                      data-today={key === isoDate(today) || undefined}
                      tabIndex={key === focused ? 0 : -1}
                      aria-label={fullDate.format(date)}
                      aria-current={key === isoDate(today) ? 'date' : undefined}
                      onClick={() => choose(date)}
                      onFocus={() => setFocused(key)}
                      onKeyDown={(event) => dayKey(event, date)}
                    >
                      {date.getUTCDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <footer className="lc-service-picker__footer">
          <button
            type="button"
            className="lc-service-picker__clear"
            disabled={!value}
            onClick={() => {
              onChange('');
              setInvalid(false);
              close();
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="lc-service-picker__primary"
            onClick={() => choose(manilaToday())}
          >
            <Check size={13} aria-hidden="true" />
            Use Today
          </button>
        </footer>
      </ServicePickerDialog>
    </>
  );
}
