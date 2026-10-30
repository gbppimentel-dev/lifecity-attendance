import { ArrowRight, Clock3, MapPin, RefreshCw, ScanLine } from 'lucide-react';
import GlideSelect from './GlideSelect';
import './service-scanner-hub.css';

type ScannerOption = {
  id: string;
  name: string;
  starts_at: string;
  location: string | null;
  state: 'upcoming' | 'in-progress';
};
type Props = {
  services: ScannerOption[];
  value: string;
  loading: boolean;
  busy: boolean;
  error: string;
  onChange: (id: string) => void;
  onOpen: () => void;
  onRetry: () => void;
};
const schedule = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function ServiceScannerHub({
  services,
  value,
  loading,
  busy,
  error,
  onChange,
  onOpen,
  onRetry,
}: Props) {
  const selected = services.find((service) => service.id === value);
  const unavailable = loading || busy || !!error || !selected;
  return (
    <section
      className="lc-service-scanner-hub"
      aria-labelledby="service-scanner-hub-title"
      data-live={selected?.state === 'in-progress' || undefined}
    >
      <div className="lc-service-scanner-hub__intro">
        <span className="lc-service-scanner-hub__symbol" aria-hidden="true">
          <ScanLine size={23} />
        </span>
        <div>
          <p>Check-In Desk</p>
          <h3 id="service-scanner-hub-title">
            {selected?.state === 'in-progress' ? 'Ready for Check-In' : 'Your Next Check-In'}
          </h3>
          <small>Upcoming & In Progress Services</small>
        </div>
      </div>
      <div className="lc-service-scanner-hub__selection">
        <span className="lc-service-scanner-hub__label" id="service-scanner-hub-label">
          Choose a Service
        </span>
        <GlideSelect
          ariaLabel="Choose a Service for Scanner"
          aria-describedby="service-scanner-hub-context"
          value={value}
          onChange={onChange}
          options={services.map((service) => ({
            value: service.id,
            label: (
              <span className="lc-service-scanner-hub__option">
                <span>{service.name}</span>
                <small>
                  {schedule.format(new Date(service.starts_at))}
                  {service.location ? ` · ${service.location}` : ''}
                </small>
              </span>
            ),
            tag: service.state === 'in-progress' ? 'Live' : 'Upcoming',
          }))}
          placeholder={loading ? 'Loading Services…' : 'No Available Services'}
          disabled={loading || busy || !!error || !services.length}
          menuWidth={340}
        />
        <p
          id="service-scanner-hub-context"
          className="lc-service-scanner-hub__context"
          role={error ? 'alert' : undefined}
        >
          {loading ? (
            'Finding services available for check-in…'
          ) : error ? (
            'The check-in list could not be loaded.'
          ) : selected ? (
            <>
              <span>
                <Clock3 size={11} aria-hidden="true" />
                {schedule.format(new Date(selected.starts_at))}
              </span>
              {selected.location && (
                <span>
                  <MapPin size={11} aria-hidden="true" />
                  {selected.location}
                </span>
              )}
            </>
          ) : (
            'Create an upcoming service to make check-in available here.'
          )}
        </p>
      </div>
      {error ? (
        <button
          type="button"
          className="lc-service-scanner-hub__open"
          onClick={onRetry}
          disabled={loading || busy}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Try Again
        </button>
      ) : (
        <button
          type="button"
          className="lc-service-scanner-hub__open"
          onClick={onOpen}
          disabled={unavailable}
        >
          <ScanLine size={17} aria-hidden="true" />
          Open Scanner
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
