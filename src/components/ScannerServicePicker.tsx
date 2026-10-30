import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { CalendarDays, Check, ChevronDown, Clock3, MapPin, Search, X } from 'lucide-react';
import { motionEnabled } from '../lib/motion';
import './scanner-service-picker.css';

type Service = { id: string; name: string; starts_at: string; location: string | null };
type Props = {
  services: Service[];
  value: string;
  disabled: boolean;
  now: number;
  onChange: (id: string) => void;
  formatDate: (date: string) => string;
  triggerRef?: Ref<HTMLButtonElement>;
};
const monthFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', month: 'short' });
const dayFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', day: 'numeric' });

export default function ScannerServicePicker({
  services,
  value,
  disabled,
  now,
  onChange,
  formatDate,
  triggerRef,
}: Props) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = services.find((service) => service.id === value);
  const matches = useMemo(() => {
    const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return services
      .filter((service) =>
        terms.every((term) =>
          `${service.name} ${service.location ?? ''} ${formatDate(service.starts_at)}`
            .toLocaleLowerCase()
            .includes(term),
        ),
      )
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }, [services, search, formatDate]);
  const groups = [
    {
      key: 'live',
      label: 'In Progress',
      rows: matches.filter((service) => Date.parse(service.starts_at) <= now),
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      rows: matches.filter((service) => Date.parse(service.starts_at) > now),
    },
  ];

  useLayoutEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previous = trigger.current;
    const overflow = document.body.style.overflow;
    const padding = document.body.style.paddingRight;
    const x = window.scrollX,
      y = window.scrollY;
    const gap = Math.max(0, innerWidth - document.documentElement.clientWidth);
    if (gap)
      document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + gap}px`;
    document.body.style.overflow = 'hidden';
    if (!element.open) element.showModal();
    const frame = requestAnimationFrame(() => {
      if (matchMedia('(min-width:601px)').matches)
        searchInput.current?.focus({ preventScroll: true });
    });
    let animation: Animation | null = null;
    if (motionEnabled() && element.animate)
      animation = element.animate(
        [
          { opacity: 0.7, transform: 'translateX(12px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        { duration: 180, easing: 'cubic-bezier(.2,.75,.25,1)' },
      );
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (!motionEnabled()) animation?.finish();
    };
    window.addEventListener('lifecity-motion-change', stop);
    window.addEventListener('storage', stop);
    media.addEventListener('change', stop);
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
      window.removeEventListener('lifecity-motion-change', stop);
      window.removeEventListener('storage', stop);
      media.removeEventListener('change', stop);
      element.close();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = padding;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
  }, [open]);

  useEffect(() => {
    if (disabled) closePicker();
  }, [disabled]);

  function closePicker() {
    dialog.current?.close();
    setOpen(false);
  }
  function choose(next: string) {
    if (disabled) return;
    closePicker();
    onChange(next);
  }
  function focusOption(button?: HTMLButtonElement | null) {
    if (!button || !list.current) return;
    button.focus({ preventScroll: true });
    const viewport = list.current.getBoundingClientRect(),
      row = button.getBoundingClientRect();
    if (row.top < viewport.top + 40) list.current.scrollTop -= viewport.top + 40 - row.top;
    else if (row.bottom > viewport.bottom - 8)
      list.current.scrollTop += row.bottom - viewport.bottom + 8;
  }
  function listKeys(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('[data-service-option]') ?? [],
    );
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    let next = at;
    if (event.key === 'ArrowDown') next = Math.min(at + 1, buttons.length - 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    focusOption(buttons[next]);
  }

  return (
    <>
      <button
        ref={(node) => {
          trigger.current = node;
          if (typeof triggerRef === 'function') triggerRef(node);
          else if (triggerRef) triggerRef.current = node;
        }}
        type="button"
        className="lc-service-trigger lc-scanner-service-picker__trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-dialog`}
        onClick={() => {
          if (!disabled) {
            setSearch('');
            setOpen(true);
          }
        }}
      >
        <CalendarDays size={17} aria-hidden="true" />
        <span>{selected ? 'Change Service' : 'Choose a Service'}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        id={`${id}-dialog`}
        className="lc-scanner-service-picker"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          closePicker();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              closePicker();
          }
        }}
      >
        <header className="lc-scanner-service-picker__header">
          <span className="lc-scanner-service-picker__symbol" aria-hidden="true">
            <CalendarDays size={23} />
          </span>
          <div>
            <p>Check-In Service</p>
            <h2 id={`${id}-title`}>Choose a Service</h2>
            <span id={`${id}-description`}>Upcoming and in-progress services.</span>
          </div>
          <button
            type="button"
            className="lc-scanner-service-picker__close"
            aria-label="Close Service Picker"
            onClick={closePicker}
            autoFocus
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="lc-scanner-service-picker__tools">
          <label className="lc-scanner-service-picker__search">
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchInput}
              type="search"
              aria-label="Search check-in services"
              placeholder="Search Services or Locations"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (list.current) list.current.scrollTop = 0;
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusOption(
                    list.current?.querySelector<HTMLButtonElement>('[data-service-option]'),
                  );
                }
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear Service Search"
                onClick={() => {
                  setSearch('');
                  searchInput.current?.focus({ preventScroll: true });
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          <p className="lc-scanner-service-picker__scope" role="status">
            <strong>{matches.length}</strong> {search.trim() ? 'Matching' : 'Available'} Service
            {matches.length === 1 ? '' : 's'}
            <span>Manila Time</span>
          </p>
        </div>
        <div ref={list} className="lc-scanner-service-picker__list" onKeyDown={listKeys}>
          {groups.map(
            (group) =>
              group.rows.length > 0 && (
                <section
                  key={group.key}
                  className="lc-scanner-service-picker__group"
                  data-live={group.key === 'live' || undefined}
                  aria-labelledby={`${id}-${group.key}`}
                >
                  <h3 id={`${id}-${group.key}`}>
                    <i aria-hidden="true" />
                    {group.label}
                    <span>{group.rows.length}</span>
                  </h3>
                  <ul role="list">
                    {group.rows.map((service) => {
                      const start = new Date(service.starts_at);
                      const active = service.id === value;
                      return (
                        <li key={service.id}>
                          <button
                            type="button"
                            className="lc-scanner-service-picker__option"
                            data-service-option
                            data-selected={active || undefined}
                            aria-pressed={active}
                            onClick={() => choose(service.id)}
                          >
                            <span className="lc-scanner-service-picker__date" aria-hidden="true">
                              <small>{monthFormat.format(start)}</small>
                              <strong>{dayFormat.format(start)}</strong>
                            </span>
                            <span className="lc-scanner-service-picker__option-copy">
                              <strong>{service.name}</strong>
                              <span>
                                <Clock3 size={12} aria-hidden="true" />
                                <time dateTime={service.starts_at}>
                                  {formatDate(service.starts_at)}
                                </time>
                              </span>
                              {service.location && (
                                <span>
                                  <MapPin size={12} aria-hidden="true" />
                                  {service.location}
                                </span>
                              )}
                            </span>
                            <span
                              className="lc-scanner-service-picker__selected"
                              aria-hidden="true"
                            >
                              {active ? <Check size={14} /> : <span />}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ),
          )}
          {!matches.length && (
            <div className="lc-scanner-service-picker__empty">
              <Search size={27} aria-hidden="true" />
              <h3>{services.length ? 'No Matching Services' : 'No Available Services'}</h3>
              <p>
                {services.length
                  ? 'Try another name, location or date.'
                  : 'Create an upcoming service to use the scanner.'}
              </p>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchInput.current?.focus({ preventScroll: true });
                  }}
                >
                  Clear Search
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="lc-scanner-service-picker__footer">
          <div>
            <span>{selected ? 'Current Selection' : 'Selection'}</span>
            <strong>{selected?.name ?? 'No Service Selected'}</strong>
          </div>
          {selected && (
            <button
              type="button"
              className="lc-scanner-service-picker__clear"
              onClick={() => choose('')}
            >
              Clear Selection
            </button>
          )}
        </footer>
      </dialog>
    </>
  );
}
