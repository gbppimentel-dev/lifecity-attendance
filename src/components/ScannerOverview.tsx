import { UsersRound } from 'lucide-react';
import BorderGlow from './BorderGlow';
import CountUp from './CountUp';
import FoldText from './FoldText';
import './scanner-overview.css';

type Props = {
  service: { id: string; name: string } | null;
  count: number;
  state: string;
};

export default function ScannerOverview({ service, count, state }: Props) {
  return (
    <BorderGlow
      as="section"
      className={`scanner-editorial-hero lc-scanner-overview${service ? ' has-service' : ''}`}
      borderRadius={22}
      animated
    >
      <div className="lc-scanner-overview__copy">
        <p className="lc-scanner-overview__eyebrow">Scanner</p>
        <h1>
          <FoldText text="Check In Members" />
        </h1>
        <p>Scan a member QR code or use manual check-in.</p>
      </div>
      {service && (
        <div className="lc-scanner-overview__counter" aria-label={`Check-ins for ${service.name}`}>
          <div className="lc-scanner-overview__counter-top">
            <span>
              <UsersRound size={14} aria-hidden="true" />
              Check-Ins
            </span>
            <span
              className="lc-scanner-overview__state"
              data-live={state === 'in-progress' || undefined}
            >
              <i aria-hidden="true" />
              {state === 'in-progress' ? 'In Progress' : 'Upcoming'}
            </span>
          </div>
          <strong className="lc-scanner-overview__number">
            <CountUp key={service.id} to={count} duration={0.45} trigger="load" />
          </strong>
        </div>
      )}
    </BorderGlow>
  );
}
