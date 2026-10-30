import { cubicBezier } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

type CountUpProps = {
  to: number;
  from?: number;
  direction?: 'up' | 'down';
  mode?: 'count' | 'roll';
  easing?: 'easeOut' | 'linear' | 'expo' | 'spring';
  format?: 'standard' | 'compact';
  decimals?: number;
  trigger?: 'view' | 'load';
  replayOnHover?: boolean;
  startWhen?: boolean;
  separator?: string;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  onStart?: () => void;
  onEnd?: () => void;
};
type Run = { id: number; from: number; to: number; spin: boolean };
type Column = {
  slot: number;
  index: number;
  place: number;
  from: number;
  to: number;
  enter: boolean;
  leave: boolean;
  delta: number;
};
type Mark = { char: string; enter?: boolean; leave?: boolean; follow?: number };
type Slot = Column | Mark;
const CELL = 1.2;
const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
  userSelect: 'none',
};
const SLOT_STYLE: CSSProperties = {
  display: 'inline-block',
  height: `${CELL}em`,
  lineHeight: `${CELL}em`,
};
const units: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mod10 = (value: number) => ((value % 10) + 10) % 10;
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const decimalPlaces = (value: number) => {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  return Math.min(12, Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent)));
};
const precision = (value: number | undefined, fallback: number) =>
  value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(0, Math.min(12, Math.floor(value)));
const scaleFor = (
  value: number,
  compact: boolean,
  decimals: number | undefined,
  places: number,
) => {
  const [size, label] = compact
    ? (units.find(([threshold]) => Math.abs(value) >= threshold * 0.9995) ?? [1, ''])
    : [1, ''];
  return {
    size,
    label,
    digits: precision(decimals, compact && label ? (Math.abs(value) / size < 100 ? 1 : 0) : places),
  };
};
const split = (value: number, digits: number, size: number) => {
  const [int, frac = ''] = (Math.abs(value) / size).toFixed(digits).split('.');
  return { negative: value < 0 && Number(int + '.' + frac) !== 0, int, frac };
};
const spring = (overshoot: number) => {
  const log = Math.log(Math.max(0.001, Math.min(0.5, overshoot)));
  const zeta = -log / Math.sqrt(Math.PI * Math.PI + log * log);
  const damped = Math.PI / 0.52,
    natural = damped / Math.sqrt(1 - zeta * zeta);
  const raw = (t: number) =>
    1 -
    Math.exp(-zeta * natural * t) *
      (Math.cos(damped * t) + ((zeta * natural) / damped) * Math.sin(damped * t));
  const residual = 1 - raw(1);
  return (t: number) => (t >= 1 ? 1 : raw(t) + residual * t * t * t);
};
const easings = {
  linear: (t: number) => t,
  easeOut: cubicBezier(0.33, 1, 0.68, 1),
  expo: (t: number) => (t >= 1 ? 1 : (1 - 2 ** (-10 * t)) / (1 - 2 ** -10)),
  spring: spring(0.06),
};

function buildRoll(
  a: number,
  b: number,
  spin: boolean,
  compact: boolean,
  decimals: number | undefined,
  places: number,
  separator: string,
) {
  const { size, label, digits } = scaleFor(b, compact, decimals, places);
  const pa = split(a, digits, size),
    pb = split(b, digits, size);
  const slots: Slot[] = [],
    columns: Column[] = [];
  if (pa.negative || pb.negative)
    slots.push({ char: '-', enter: !pa.negative, leave: !pb.negative });
  const digitAt = (parts: typeof pa, place: number) => {
    if (place < 0) return Number(parts.frac[-place - 1] ?? 0);
    const index = parts.int.length - 1 - place;
    return index >= 0 ? Number(parts.int[index]) : null;
  };
  for (let place = Math.max(pa.int.length, pb.int.length) - 1; place >= -digits; place--) {
    if (place === -1) slots.push({ char: '.' });
    const start = digitAt(pa, place),
      end = digitAt(pb, place);
    const column: Column = {
      slot: slots.length,
      index: columns.length,
      place,
      from: start ?? 0,
      to: end ?? 0,
      enter: start === null,
      leave: end === null,
      delta: 0,
    };
    slots.push(column);
    columns.push(column);
    if (separator && place > 0 && place % 3 === 0)
      slots.push({ char: separator, follow: column.index });
  }
  columns.forEach((column, index) => {
    const up = spin || b >= a,
      rank = columns.length - 1 - index;
    const base = up ? mod10(column.to - column.from) : -mod10(column.from - column.to);
    const turns = spin
      ? Math.max(1, 3 - rank)
      : Math.min(
          Math.floor(Math.abs(b - a) / (size * 10 ** (column.place + 1))),
          Math.max(0, 3 - rank),
        );
    column.delta = base + (up ? 10 : -10) * turns;
  });
  return { slots, columns, label };
}

export default function CountUp({
  to,
  from = 0,
  direction = 'up',
  mode = 'count',
  easing = 'easeOut',
  format = 'standard',
  decimals,
  trigger = 'view',
  replayOnHover = false,
  startWhen = true,
  separator = '',
  prefix = '',
  suffix = '',
  duration = 2,
  delay = 0,
  className = '',
  style,
  onStart,
  onEnd,
}: CountUpProps) {
  const safeFrom = Number.isFinite(from) ? from : 0;
  const valid = Number.isFinite(to) && Number.isFinite(direction === 'down' ? from : to);
  const startValue = direction === 'down' ? (Number.isFinite(to) ? to : 0) : safeFrom;
  const endValue = direction === 'down' ? safeFrom : Number.isFinite(to) ? to : 0;
  const compact = format === 'compact';
  const places = precision(decimals, Math.max(decimalPlaces(startValue), decimalPlaces(endValue)));
  const root = useRef<HTMLSpanElement>(null),
    text = useRef<HTMLSpanElement>(null);
  const slotRefs = useRef<(HTMLSpanElement | null)[]>([]),
    filters = useRef<(SVGFEGaussianBlurElement | null)[]>([]);
  const uid = useId().replace(/[^\w-]/g, '');
  const motionRead = () =>
    typeof window === 'undefined' ||
    (document.documentElement.dataset.lcMotion !== 'off' &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [motion, setMotion] = useState(motionRead);
  const [inView, setInView] = useState(trigger === 'load');
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [run, setRun] = useState<Run | null>(null);
  const [replay, setReplay] = useState(0);
  const value = useRef(motion || !startWhen ? startValue : endValue);
  const scheduled = useRef<{ target: number; replay: number } | null>(null);
  const seen = useRef(false);
  const progress = useRef({ id: 0, elapsed: 0, started: false, completed: false });
  const latest = useRef({ onStart, onEnd, duration, delay, easing });
  latest.current = { onStart, onEnd, duration, delay, easing };

  const numberFormats = useMemo(() => new Map<number, Intl.NumberFormat>(), [separator]);
  const formatValue = useCallback(
    (latestValue: number) => {
      const { size, label, digits } = scaleFor(latestValue, compact, decimals, places);
      let formatter = numberFormats.get(digits);
      if (!formatter) {
        formatter = new Intl.NumberFormat('en-PH', {
          useGrouping: !!separator,
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
        numberFormats.set(digits, formatter);
      }
      const normalized =
        Math.abs(latestValue / size) < 0.5 * 10 ** -digits ? 0 : latestValue / size;
      const body = formatter
        .formatToParts(normalized)
        .map((part) => (part.type === 'group' ? separator : part.value))
        .join('');
      return prefix + body + label + suffix;
    },
    [compact, decimals, places, separator, prefix, suffix, numberFormats],
  );
  const finalText = valid ? formatValue(endValue) : '—';
  const model = useMemo(
    () =>
      mode === 'roll' &&
      Math.max(Math.abs(startValue), Math.abs(endValue), Math.abs(value.current)) < 1e21
        ? buildRoll(
            run?.from ?? startValue,
            run?.to ?? endValue,
            run?.spin ?? false,
            compact,
            decimals,
            places,
            separator,
          )
        : null,
    [mode, run, startValue, endValue, compact, decimals, places, separator],
  );
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setMotion(motionRead());
    const syncVisibility = () => setVisible(!document.hidden);
    const observer = new MutationObserver(syncMotion);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lc-motion'],
    });
    media.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    syncMotion();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);
  useEffect(() => {
    if (trigger === 'load') {
      setInView(true);
      seen.current = true;
      return;
    }
    if (!root.current || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      seen.current = true;
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const showing = entries.some((entry) => entry.isIntersecting);
        if (showing) seen.current = true;
        setInView(showing);
      },
      { threshold: 0 },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [trigger]);
  useLayoutEffect(() => {
    if (!scheduled.current) value.current = motion || !startWhen ? startValue : endValue;
    if (text.current)
      text.current.textContent = valid
        ? formatValue(!motion && startWhen ? endValue : value.current)
        : '—';
  }, [formatValue, startValue, endValue, motion, startWhen, valid]);
  useEffect(() => {
    if (!valid || !startWhen || (trigger === 'view' && !seen.current && !inView)) return;
    if (scheduled.current?.target === endValue && scheduled.current.replay === replay) return;
    const isReplay = scheduled.current !== null && scheduled.current.replay !== replay;
    scheduled.current = { target: endValue, replay };
    setRun((previous) => ({
      id: (previous?.id ?? 0) + 1,
      from: isReplay && mode === 'count' ? startValue : value.current,
      to: endValue,
      spin: isReplay && mode === 'roll',
    }));
  }, [endValue, inView, startWhen, trigger, valid, replay, startValue, mode]);

  useLayoutEffect(() => {
    if (!run || !valid || !startWhen) return;
    const live = latest.current,
      ease = easings[live.easing];
    const seconds = Number.isFinite(live.duration) ? Math.max(0, live.duration) : 0;
    const wait = Number.isFinite(live.delay) ? Math.max(0, live.delay) : 0;
    const totalMs = seconds * 1000,
      delayMs = wait * 1000;
    if (progress.current.id !== run.id)
      progress.current = { id: run.id, elapsed: 0, started: false, completed: false };
    const state = progress.current;
    let raf = 0,
      cancelled = false;
    const slots = slotRefs.current;
    const render = (elapsed: number) => {
      const fraction = totalMs ? clamp01(elapsed / totalMs) : 1;
      const eased = ease(fraction);
      const interpolated = run.from * (1 - eased) + run.to * eased;
      const latestValue = fraction >= 1 || !Number.isFinite(interpolated) ? run.to : interpolated;
      value.current = latestValue;
      if (text.current) text.current.textContent = formatRef.current(latestValue);
      if (!model || !motion) return;
      const stagger =
        model.columns.length > 1 ? Math.min(0.07, (seconds * 0.4) / (model.columns.length - 1)) : 0;
      const span = Math.max(0.001, seconds - stagger * (model.columns.length - 1));
      const columnPresence: number[] = [];
      const cell =
        (parseFloat(root.current ? getComputedStyle(root.current).fontSize : '16') || 16) * CELL;
      for (const column of model.columns) {
        const box = slots[column.slot],
          strip = box?.firstElementChild as HTMLSpanElement | null;
        if (!box || !strip) continue;
        const u = fraction >= 1 ? 1 : clamp01((elapsed / 1000 - column.index * stagger) / span);
        const columnEase =
          live.easing === 'spring'
            ? spring(Math.min(0.12, Math.max(0.01, 0.35 / Math.max(1, Math.abs(column.delta)))))
            : ease;
        const pos = column.from + column.delta * columnEase(u),
          base = Math.floor(pos);
        Array.from(strip.children).forEach((node, offset) => {
          node.textContent = String(mod10(base + offset - 1));
        });
        strip.style.transform = `translateY(${(-(1 + pos - base) * CELL).toFixed(4)}em)`;
        const u0 = Math.max(0, u - 0.004),
          u1 = Math.min(1, u + 0.004);
        const speed =
          u1 > u0
            ? (Math.abs(column.delta) * Math.abs(columnEase(u1) - columnEase(u0))) /
              (u1 - u0) /
              span
            : 0;
        const sigma = u > 0 && u < 1 ? Math.min(cell * 0.05, (speed * cell) / 600) : 0;
        filters.current[column.index]?.setAttribute('stdDeviation', `0 ${sigma.toFixed(2)}`);
        strip.style.filter = sigma > 0.2 ? `url(#${uid}-${column.index})` : '';
        const presence = column.enter
          ? smooth(0, 0.45, u)
          : column.leave
            ? 1 - smooth(0.55, 1, u)
            : 1;
        columnPresence[column.index] = presence;
        box.style.width =
          (column.enter && u >= 1) || (!column.enter && !column.leave)
            ? ''
            : `${box.scrollWidth * presence}px`;
        box.style.opacity = String(presence);
      }
      model.slots.forEach((slot, index) => {
        if (!('char' in slot)) return;
        const node = slots[index];
        if (!node) return;
        const presence =
          slot.follow !== undefined
            ? (columnPresence[slot.follow] ?? 1)
            : slot.enter
              ? smooth(0, 0.3, fraction)
              : slot.leave
                ? 1 - smooth(0.7, 1, fraction)
                : 1;
        node.style.opacity = String(presence);
        node.style.width = presence === 1 ? '' : `${node.scrollWidth * presence}px`;
      });
    };
    if (state.completed) {
      render(Infinity);
      return;
    }
    if (motion && (!visible || (trigger === 'view' && !inView))) return;
    const startedAt = performance.now() - state.elapsed;
    const tick = (now: number) => {
      if (cancelled) return;
      state.elapsed = Math.max(0, now - startedAt);
      if (motion && state.elapsed < delayMs) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!state.started) {
        state.started = true;
        latest.current.onStart?.();
      }
      if (cancelled) return;
      const elapsed = motion ? Math.max(0, state.elapsed - delayMs) : Infinity;
      render(elapsed);
      if (!motion || elapsed >= totalMs) {
        state.completed = true;
        latest.current.onEnd?.();
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [run, model, motion, visible, inView, startWhen, trigger, valid, uid]);

  return (
    <span
      ref={root}
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
      onPointerEnter={(event) => {
        if (replayOnHover && event.pointerType === 'mouse' && motion && progress.current.completed)
          setReplay((previous) => previous + 1);
      }}
    >
      {mode === 'roll' && model && motion && valid ? (
        <>
          <span
            aria-hidden="true"
            style={{ display: 'inline-flex', whiteSpace: 'pre', userSelect: 'none' }}
          >
            {prefix && <span style={SLOT_STYLE}>{prefix}</span>}
            {model.slots.map((slot, index) => (
              <span
                key={index}
                ref={(node) => {
                  slotRefs.current[index] = node;
                }}
                style={{
                  ...SLOT_STYLE,
                  position: 'relative',
                  overflow: 'hidden',
                  ...(slot.enter ? { width: 0, opacity: 0 } : {}),
                }}
              >
                {'char' in slot ? (
                  slot.char
                ) : (
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      transform: `translateY(${-CELL}em)`,
                    }}
                  >
                    {[-1, 0, 1, 2].map((offset) => (
                      <span
                        key={offset}
                        style={{ display: 'block', flex: '0 0 auto', height: `${CELL}em` }}
                      >
                        {mod10(slot.from + offset)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            ))}
            {model.label && <span style={SLOT_STYLE}>{model.label}</span>}
            {suffix && <span style={SLOT_STYLE}>{suffix}</span>}
          </span>
          <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              {model.columns.map((column) => (
                <filter
                  key={column.index}
                  id={`${uid}-${column.index}`}
                  x="-20%"
                  y="-50%"
                  width="140%"
                  height="200%"
                  colorInterpolationFilters="sRGB"
                >
                  <feGaussianBlur
                    ref={(node) => {
                      filters.current[column.index] = node;
                    }}
                    stdDeviation="0 0"
                  />
                </filter>
              ))}
            </defs>
          </svg>
        </>
      ) : (
        <span ref={text} aria-hidden="true">
          {valid ? formatValue(!motion && startWhen ? endValue : value.current) : '—'}
        </span>
      )}
      <span style={SR_ONLY} aria-live="polite" aria-atomic="true">
        {finalText}
      </span>
    </span>
  );
}
