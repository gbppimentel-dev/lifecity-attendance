import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './hold-button.css';

export type HoldButtonProps = {
  children?: ReactNode;
  label?: string;
  holdingLabel?: ReactNode;
  doneLabel?: ReactNode;
  icon?: ReactNode;
  doneIcon?: ReactNode;
  holdMs?: number;
  holdTime?: number;
  releaseTime?: number;
  resetAfter?: number;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  backgroundColor?: string;
  fillColor?: string;
  textColor?: string;
  fillTextColor?: string;
  fillDirection?: 'right' | 'up';
  pressScale?: number;
  wave?: boolean;
  waveAmplitude?: number;
  glow?: boolean;
  disabled?: boolean;
  className?: string;
  onConfirm: () => void | Promise<void>;
};

type Phase = 'idle' | 'holding' | 'done';
type Input = 'pointer' | 'key' | null;
type Gesture = {
  pointerId: number | null;
  key: string | null;
  start: number;
  rect: DOMRect | null;
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export default function HoldButton({
  children,
  label = 'Hold to delete',
  holdingLabel,
  doneLabel = 'Confirmed',
  icon,
  doneIcon,
  holdMs,
  holdTime,
  releaseTime = 180,
  resetAfter = 1200,
  size = 'md',
  radius = 12,
  backgroundColor,
  fillColor,
  textColor,
  fillTextColor,
  fillDirection = 'right',
  pressScale = 0.98,
  wave = true,
  waveAmplitude = 6,
  glow = false,
  disabled = false,
  className = '',
  onConfirm,
}: HoldButtonProps) {
  const duration = Math.max(300, holdMs ?? holdTime ?? 1300);
  const button = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [input, setInput] = useState<Input>(null);
  const [announcement, setAnnouncement] = useState('');
  const phaseRef = useRef<Phase>('idle');
  const inputRef = useRef<Input>(null);
  const gesture = useRef<Gesture>({ pointerId: null, key: null, start: 0, rect: null });
  const timers = useRef<{
    complete?: ReturnType<typeof setTimeout>;
    reset?: ReturnType<typeof setTimeout>;
  }>({});
  const motion = useRef({ raf: 0, p: 0 });
  const mounted = useRef(true);
  const latest = useRef({ disabled, onConfirm, duration, releaseTime, resetAfter });
  latest.current = { disabled, onConfirm, duration, releaseTime, resetAfter };
  const hintId = useId();

  const go = (next: Phase, kind: Input = null) => {
    phaseRef.current = next;
    inputRef.current = kind;
    setPhase(next);
    setInput(kind);
  };
  const clearTimers = () => {
    clearTimeout(timers.current.complete);
    clearTimeout(timers.current.reset);
  };
  const paint = (p: number) => {
    motion.current.p = p;
    button.current?.style.setProperty('--hb-p', p.toFixed(4));
  };
  const drive = (to: number, ms: number, linear = false) => {
    cancelAnimationFrame(motion.current.raf);
    const from = motion.current.p,
      start = performance.now();
    const step = (now: number) => {
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
      paint(from + (to - from) * (linear ? t : easeOut(t)));
      if (t < 1) motion.current.raf = requestAnimationFrame(step);
      else motion.current.raf = 0;
    };
    motion.current.raf = requestAnimationFrame(step);
  };
  const releaseCapture = () => {
    const id = gesture.current.pointerId;
    gesture.current.pointerId = null;
    gesture.current.key = null;
    if (id !== null && button.current?.hasPointerCapture(id))
      button.current.releasePointerCapture(id);
  };
  const cancel = () => {
    if (phaseRef.current !== 'holding') return;
    clearTimers();
    go('idle');
    releaseCapture();
    drive(0, latest.current.releaseTime);
    setAnnouncement('Hold cancelled. No action was taken.');
  };
  const complete = () => {
    if (
      !mounted.current ||
      latest.current.disabled ||
      phaseRef.current !== 'holding' ||
      document.hidden ||
      !document.hasFocus()
    ) {
      cancel();
      return;
    }

    const remaining = latest.current.duration - (performance.now() - gesture.current.start);
    if (remaining > 0) {
      timers.current.complete = setTimeout(complete, remaining);
      return;
    }
    clearTimers();
    cancelAnimationFrame(motion.current.raf);
    paint(1);
    go('done', inputRef.current);
    setAnnouncement('Hold complete.');
    const reset = () => {
      if (!mounted.current || latest.current.resetAfter <= 0) return;
      timers.current.reset = setTimeout(() => {
        if (!mounted.current) return;
        go('idle');
        drive(0, latest.current.releaseTime);
      }, latest.current.resetAfter);
    };
    try {
      Promise.resolve(latest.current.onConfirm()).then(reset, () => {
        if (!mounted.current) return;
        setAnnouncement('The action could not be completed. Try again.');
        go('idle');
        drive(0, latest.current.releaseTime);
      });
    } catch {
      if (!mounted.current) return;
      setAnnouncement('The action could not be completed. Try again.');
      go('idle');
      drive(0, latest.current.releaseTime);
    }
  };
  const begin = (kind: Input) => {
    if (latest.current.disabled || phaseRef.current !== 'idle' || !button.current) return false;
    clearTimers();
    gesture.current.start = performance.now();
    gesture.current.rect = button.current.getBoundingClientRect();
    paint(0);
    go('holding', kind);
    setAnnouncement('Keep holding to confirm. Release to cancel.');
    drive(1, latest.current.duration, true);
    timers.current.complete = setTimeout(complete, latest.current.duration);
    return true;
  };
  const endPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== gesture.current.pointerId) return;
    if (phaseRef.current === 'holding') cancel();
    else releaseCapture();
  };

  useLayoutEffect(() => {
    const el = button.current;
    if (!el) return;
    const measure = () => {
      el.style.setProperty('--hb-w', `${el.offsetWidth}px`);
      el.style.setProperty('--hb-h', `${el.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useLayoutEffect(() => {
    if (disabled) cancelRef.current();
  }, [disabled]);
  useEffect(() => {
    mounted.current = true;
    const cancelHold = () => cancelRef.current();
    const visibility = () => {
      if (document.hidden) cancelHold();
    };
    window.addEventListener('blur', cancelHold);
    window.addEventListener('scroll', cancelHold, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      clearTimers();
      cancelAnimationFrame(motion.current.raf);
      window.removeEventListener('blur', cancelHold);
      window.removeEventListener('scroll', cancelHold, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const idleLabel = children ?? label;
  const visibleLabel =
    phase === 'done' ? doneLabel : phase === 'holding' ? (holdingLabel ?? idleLabel) : idleLabel;
  const visibleIcon = phase === 'done' ? (doneIcon ?? icon) : icon;
  const visual = (
    <span className="hold-button__label">
      {visibleIcon && <span className="hold-button__icon">{visibleIcon}</span>}
      {visibleLabel}
    </span>
  );

  return (
    <button
      ref={button}
      type="button"
      disabled={disabled}
      className={`hold-button hold-button--${size}${className ? ` ${className}` : ''}`}
      data-phase={phase}
      data-input={input ?? undefined}
      data-direction={fillDirection}
      data-glow={glow ? 'true' : undefined}
      aria-label={typeof idleLabel === 'string' ? idleLabel : label}
      aria-describedby={hintId}
      style={
        {
          '--hb-radius': `${radius}px`,
          '--hb-hold': `${duration}ms`,
          '--hb-release': `${releaseTime}ms`,
          '--hb-press': pressScale,
          '--hb-wave': `${wave ? waveAmplitude : 0}px`,
          '--hb-cycles': duration / 1100,
          ...(backgroundColor ? { '--hb-bg': backgroundColor } : {}),
          ...(fillColor ? { '--hb-fill': fillColor } : {}),
          ...(textColor ? { '--hb-text': textColor } : {}),
          ...(fillTextColor ? { '--hb-fill-text': fillTextColor } : {}),
        } as CSSProperties
      }
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          !event.isPrimary ||
          gesture.current.pointerId !== null ||
          gesture.current.key !== null
        )
          return;
        if (!begin('pointer')) return;
        gesture.current.pointerId = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.pointerId !== gesture.current.pointerId || phaseRef.current !== 'holding') return;
        const rect = gesture.current.rect;
        if (
          rect &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          cancel();
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onLostPointerCapture={endPointer}
      onPointerLeave={endPointer}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          cancel();
          return;
        }
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (event.repeat || gesture.current.key !== null || gesture.current.pointerId !== null)
          return;
        if (begin('key')) gesture.current.key = event.key;
      }}
      onKeyUp={(event) => {
        if (event.key !== gesture.current.key) return;
        event.preventDefault();
        if (phaseRef.current === 'holding') cancel();
        else releaseCapture();
      }}
      onBlur={() => {
        cancel();
        releaseCapture();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="hold-button__pulse" aria-hidden="true" />
      <span aria-hidden="true">{visual}</span>
      <span className="hold-button__clip" aria-hidden="true">
        <span className="hold-button__fill">{visual}</span>
        <span className="hold-button__crest">{visual}</span>
      </span>
      <span id={hintId} className="hold-button__sr">
        Hold the mouse button, Space, or Enter for {Math.round(duration / 100) / 10} seconds to
        confirm. Release early to cancel.
      </span>
      <span className="hold-button__sr" role="status" aria-live="polite">
        {announcement}
      </span>
    </button>
  );
}
