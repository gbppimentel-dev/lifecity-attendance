import { useEffect, useRef, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ChevronDown,
  Download,
  FileSearch,
  FileSpreadsheet,
  Info,
  X,
} from 'lucide-react';
import { motionEnabled } from '../lib/motion';
import { revealWorkspaceRegion } from '../lib/workspaceViewport';
import './export-panel.css';

type Props = {
  label: string;
  title: string;
  subtitle: string;
  quick: string;
  detailed: string;
  hint: string;
  disabled: boolean;
  onQuick: () => void;
  onDetailed: () => void;
  children?: ReactNode;
  summaryText?: string;
};
export default function ExportPanel({
  label,
  title,
  subtitle,
  quick,
  detailed,
  hint,
  disabled,
  onQuick,
  onDetailed,
  children,
  summaryText = 'Current filters · All matching results',
}: Props) {
  const panel = useRef<HTMLDetailsElement>(null),
    summary = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null),
    target = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (!motionEnabled()) animation.current?.finish();
    };
    window.addEventListener('lifecity-motion-change', stop);
    window.addEventListener('storage', stop);
    media.addEventListener('change', stop);
    return () => {
      alive.current = false;
      animation.current?.cancel();
      window.removeEventListener('lifecity-motion-change', stop);
      window.removeEventListener('storage', stop);
      media.removeEventListener('change', stop);
    };
  }, []);
  function toggle(next: boolean) {
    const node = panel.current;
    if (!node) return;
    const from = node.getBoundingClientRect().height;
    animation.current?.cancel();
    animation.current = null;
    target.current = next;
    const finish = () => {
      node.open = next;
      if (body.current) body.current.style.display = next ? '' : 'none';
      if (next)
        node.querySelector<HTMLButtonElement>('.lcse-close')?.focus({ preventScroll: true });
      else summary.current?.focus({ preventScroll: true });
      if (next) revealWorkspaceRegion(node);
    };
    if (!motionEnabled() || !node.animate) {
      finish();
      return;
    }

    node.open = next;
    if (body.current) body.current.style.display = next ? '' : 'none';
    if (!next) summary.current?.focus({ preventScroll: true });
    const to = node.getBoundingClientRect().height;
    const run = node.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 240,
      easing: 'cubic-bezier(.2,.7,.2,1)',
      fill: 'both',
    });
    animation.current = run;
    void run.finished
      .then(() => {
        if (alive.current && animation.current === run) {
          finish();
          run.cancel();
          animation.current = null;
        }
      })
      .catch(() => {});
  }
  return (
    <details
      ref={panel}
      className="lc-export-panel lc-export-panel--compact"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && target.current) {
          event.preventDefault();
          event.stopPropagation();
          toggle(false);
        }
      }}
    >
      <summary
        ref={summary}
        onClick={(e) => {
          e.preventDefault();
          toggle(!target.current);
        }}
      >
        <span className="lcse-summary-icon" aria-hidden="true">
          <Download size={17} />
        </span>
        <span className="lcse-summary-copy">
          <strong>{label}</strong>
          <small>{summaryText}</small>
        </span>
        <span className="lcse-format-tag" aria-hidden="true">
          CSV
        </span>
        <ChevronDown className="lc-export-chevron" size={16} aria-hidden="true" />
      </summary>
      <div ref={body} className="lcse-body" style={{ display: 'none' }}>
        <header className="lcse-heading">
          <div>
            <p className="lcse-kicker">CSV Export</p>
            <h3>{title}</h3>
            <p className="lcse-subtitle">{subtitle}</p>
          </div>
          <button
            type="button"
            className="lcse-close"
            aria-label={`Close ${label.toLowerCase()}`}
            onClick={() => toggle(false)}
          >
            <X size={18} />
          </button>
        </header>
        <div className="lcse-options">
          <button type="button" className="lcse-choice" disabled={disabled} onClick={onQuick}>
            <span className="lcse-choice-icon" aria-hidden="true">
              <FileSpreadsheet size={20} />
            </span>
            <span className="lcse-choice-copy">
              <strong>Quick CSV</strong>
              <small>{quick}</small>
            </span>
            <ArrowDownToLine className="lcse-choice-download" size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="lcse-choice lcse-detailed"
            disabled={disabled}
            onClick={onDetailed}
          >
            <span className="lcse-choice-icon" aria-hidden="true">
              <FileSearch size={20} />
            </span>
            <span className="lcse-choice-copy">
              <strong>Detailed CSV</strong>
              <small>{detailed}</small>
            </span>
            <ArrowDownToLine className="lcse-choice-download" size={17} aria-hidden="true" />
          </button>
        </div>
        <p className="lcse-hint">
          <Info size={14} aria-hidden="true" />
          <span>{hint}</span>
        </p>
        {children}
      </div>
    </details>
  );
}
