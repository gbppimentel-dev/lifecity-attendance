import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import './magic-bento.css';

export type MagicBentoItem = {
  id?: string | number;
  label?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  visual?: ReactNode;
  content?: ReactNode;
  image?: string;
  href?: string;
  target?: string;
  rel?: string;
  colSpan?: number;
  rowSpan?: number;
  className?: string;
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
};

type Props = {
  items: MagicBentoItem[];
  as?: 'div' | 'section';
  'aria-label'?: string;
  columns?: number;
  rowHeight?: number | 'auto';
  gap?: number;
  radius?: number;
  theme?: 'light' | 'dark';
  glowColor?: string;
  enableBorderGlow?: boolean;
  enableSpotlight?: boolean;
  spotlightRadius?: number;
  enableStars?: boolean;
  particleCount?: number;
  enableTilt?: boolean;
  enableMagnetism?: boolean;
  clickEffect?: boolean;
  textAutoHide?: boolean;
  intro?: boolean;
  disableAnimations?: boolean;
  onItemClick?: (item: MagicBentoItem, index: number) => void;
  className?: string;
  style?: CSSProperties;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  rate: number;
};
type CardState = {
  hot: number;
  rx: number;
  ry: number;
  tx: number;
  ty: number;
  press: number;
  stars: number;
  particles: Particle[];
  written: Record<string, string>;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const interactive =
  'button,a,input,textarea,select,summary,[contenteditable="true"],[data-no-bento-click]';
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const parseRgb = (value?: string): number[] | null => {
  const text = value?.trim() ?? '';
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].replace(/./g, (digit) => digit + digit) : hex[1];
    return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
  }
  const channels = text.match(/[\d.]+/g);
  return channels && channels.length >= 3 && /^(rgba?\(|[\d.\s,]+$)/i.test(text)
    ? channels.slice(0, 3).map((channel) => clamp(Number(channel), 0, 255))
    : null;
};

function useEffectsAllowed(disabled: boolean) {
  const read = () =>
    typeof window !== 'undefined' &&
    !disabled &&
    document.documentElement.dataset.lcMotion !== 'off' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [allowed, setAllowed] = useState(read);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setAllowed(read());
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lc-motion'],
    });
    media.addEventListener('change', sync);
    sync();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
    };
  }, [disabled]);
  return allowed;
}

export default function MagicBento({
  items,
  as: Container = 'section',
  'aria-label': ariaLabel,
  columns = 4,
  rowHeight = 200,
  gap = 18,
  radius = 18,
  theme = 'light',
  glowColor,
  textAutoHide = false,
  enableBorderGlow = true,
  enableSpotlight = true,
  spotlightRadius = 300,
  enableStars = false,
  particleCount = 24,
  enableTilt = false,
  enableMagnetism = false,
  clickEffect = true,
  intro = true,
  disableAnimations = false,
  onItemClick,
  className = '',
  style,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const engine = useRef<{ sync: () => void } | null>(null);
  const columnCount = Math.max(1, Math.round(columns));
  const [cols, setCols] = useState(columnCount);
  const motion = useEffectsAllowed(disableAnimations);
  const settings = useRef({
    items,
    enableBorderGlow,
    enableSpotlight,
    spotlightRadius,
    enableStars,
    particleCount,
    enableTilt,
    enableMagnetism,
    clickEffect,
    glowColor,
  });
  settings.current = {
    items,
    enableBorderGlow,
    enableSpotlight,
    spotlightRadius: Math.max(40, spotlightRadius),
    enableStars,
    particleCount: clamp(Math.round(particleCount), 0, 80),
    enableTilt,
    enableMagnetism,
    clickEffect,
    glowColor,
  };

  useClientLayoutEffect(() => {
    const grid = root.current;
    if (!grid) return;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const pointer = { x: -10000, y: -10000, inside: false, down: -1 };
    const light = { x: -10000, y: -10000, near: 0, ready: false };
    const states: CardState[] = [];
    const wave = { x: 0, y: 0, time: -1, duration: 1.05, reach: 800 };
    let bounds: DOMRect | null = null;
    let rects: (DOMRect | null)[] = [];
    let dirty = true,
      raf = 0,
      last = 0,
      onScreen = true,
      disposed = false;
    let entered = !motion || !intro;
    let introFrame = 0;
    const stateFor = (index: number) =>
      states[index] ??
      (states[index] = {
        hot: 0,
        rx: 0,
        ry: 0,
        tx: 0,
        ty: 0,
        press: 1,
        stars: 0,
        particles: [],
        written: {},
      });
    const write = (card: HTMLElement, state: CardState, name: string, value: string) => {
      if (state.written[name] === value) return;
      state.written[name] = value;
      card.style.setProperty(name, value);
    };
    const measure = () => {
      dirty = false;
      bounds = grid.getBoundingClientRect();
      rects = cells.current.map((cell) => cell?.getBoundingClientRect() ?? null);
      const scale = Math.min(devicePixelRatio || 1, 2);
      canvases.current.forEach((canvas, index) => {
        const rect = rects[index];
        if (!canvas || !rect) return;
        const width = Math.max(1, Math.round(rect.width * scale)),
          height = Math.max(1, Math.round(rect.height * scale));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
      });
    };
    const drawStars = (
      index: number,
      rect: DOMRect,
      state: CardState,
      x: number,
      y: number,
      dt: number,
      now: number,
    ) => {
      const canvas = canvases.current[index],
        context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (state.stars < 0.004) return;
      const s = settings.current;
      if (state.particles.length !== s.particleCount)
        state.particles = Array.from({ length: s.particleCount }, () => ({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          vx: (Math.random() - 0.5) * 6,
          vy: -4 - Math.random() * 10,
          size: 0.6 + Math.random(),
          phase: Math.random() * Math.PI * 2,
          rate: 1.2 + Math.random() * 2.4,
        }));
      const rgb = parseRgb(s.glowColor) ??
        parseRgb(getComputedStyle(grid).getPropertyValue('--lc-primary')) ?? [20, 125, 115];
      const ratio = canvas.width / Math.max(1, rect.width),
        reach = s.spotlightRadius * 0.75;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      state.particles.forEach((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.y < -4) {
          particle.y = rect.height + 4;
          particle.x = Math.random() * rect.width;
        }
        if (particle.x < -4) particle.x = rect.width + 4;
        if (particle.x > rect.width + 4) particle.x = -4;
        const distance = Math.hypot(particle.x - x, particle.y - y) / reach;
        if (distance >= 1) return;
        const fade = 1 - distance * distance * (3 - 2 * distance);
        const alpha =
          state.stars *
          fade *
          (0.55 + 0.45 * Math.sin(now * 0.001 * particle.rate + particle.phase));
        context.fillStyle = `rgba(${rgb.join(',')},${alpha.toFixed(3)})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      });
    };
    const visible = () => onScreen && !document.hidden;
    const frame = (now: number) => {
      raf = 0;
      if (disposed || !motion || !visible()) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
      last = now;
      if (dirty) measure();
      const s = settings.current;
      let busy = false;
      const margin = s.spotlightRadius * 0.5;
      const near =
        pointer.inside &&
        bounds &&
        pointer.x > bounds.left - margin &&
        pointer.x < bounds.right + margin &&
        pointer.y > bounds.top - margin &&
        pointer.y < bounds.bottom + margin
          ? 1
          : 0;
      if (!light.ready && near) {
        light.x = pointer.x;
        light.y = pointer.y;
        light.ready = true;
      }
      const follow = 1 - Math.exp(-dt / 0.05);
      light.x += (pointer.x - light.x) * follow;
      light.y += (pointer.y - light.y) * follow;
      light.near += (near - light.near) * (1 - Math.exp(-dt / (near ? 0.12 : 0.3)));
      if (Math.abs(near - light.near) < 0.002) light.near = near;
      else busy = true;
      if (near && Math.abs(pointer.x - light.x) + Math.abs(pointer.y - light.y) > 0.3) busy = true;
      let waveRadius = 0,
        waveAlpha = 0;
      if (wave.time >= 0) {
        wave.time += dt;
        const progress = Math.min(1, wave.time / wave.duration);
        waveRadius = wave.reach * (1 - Math.pow(1 - progress, 2.2));
        waveAlpha = Math.pow(1 - progress, 1.3);
        if (progress >= 1) wave.time = -1;
        else busy = true;
      }
      cards.current.forEach((card, index) => {
        const rect = rects[index];
        if (!card || !rect) return;
        const state = stateFor(index);
        const px = pointer.x - rect.left,
          py = pointer.y - rect.top;
        const lx = light.x - rect.left,
          ly = light.y - rect.top;
        const inside = Boolean(
          pointer.inside && entered && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height,
        );
        card.toggleAttribute('data-active', inside);
        const targetHot = inside && s.enableSpotlight ? 1 : 0;
        state.hot += (targetHot - state.hot) * (1 - Math.exp(-dt / (targetHot ? 0.14 : 0.28)));
        if (Math.abs(targetHot - state.hot) < 0.002) state.hot = targetHot;
        else busy = true;
        const u = clamp(px / Math.max(1, rect.width), 0, 1) - 0.5,
          v = clamp(py / Math.max(1, rect.height), 0, 1) - 0.5;
        const targets = {
          rx: inside && s.enableTilt ? -v * 10 : 0,
          ry: inside && s.enableTilt ? u * 10 : 0,
          tx: inside && s.enableMagnetism ? u * 8 : 0,
          ty: inside && s.enableMagnetism ? v * 8 : 0,
          press: pointer.down === index && s.clickEffect ? 0.988 : 1,
        };
        for (const key of ['rx', 'ry', 'tx', 'ty', 'press'] as const) {
          state[key] += (targets[key] - state[key]) * (1 - Math.exp(-dt / 0.08));
          if (Math.abs(targets[key] - state[key]) < 0.0005) state[key] = targets[key];
          else busy = true;
        }
        write(card, state, '--mb-x', `${lx.toFixed(1)}px`);
        write(card, state, '--mb-y', `${ly.toFixed(1)}px`);
        write(card, state, '--mb-near', (s.enableBorderGlow ? light.near : 0).toFixed(3));
        write(card, state, '--mb-hot', state.hot.toFixed(3));
        write(card, state, '--mb-rx', `${state.rx.toFixed(3)}deg`);
        write(card, state, '--mb-ry', `${state.ry.toFixed(3)}deg`);
        write(card, state, '--mb-tx', `${state.tx.toFixed(2)}px`);
        write(card, state, '--mb-ty', `${state.ty.toFixed(2)}px`);
        write(card, state, '--mb-press', state.press.toFixed(4));
        write(card, state, '--mb-wx', `${(wave.x - rect.left).toFixed(1)}px`);
        write(card, state, '--mb-wy', `${(wave.y - rect.top).toFixed(1)}px`);
        write(card, state, '--mb-wr', `${waveRadius.toFixed(1)}px`);
        write(card, state, '--mb-wa', waveAlpha.toFixed(3));
        const starTarget = s.enableStars && inside ? 1 : 0;
        if (state.stars || starTarget) {
          state.stars +=
            (starTarget - state.stars) * (1 - Math.exp(-dt / (starTarget ? 0.3 : 0.4)));
          if (state.stars < 0.004 && !starTarget) state.stars = 0;
          drawStars(index, rect, state, lx, ly, dt, now);
          if (state.stars > 0) busy = true;
        }
      });
      if (busy && visible()) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (disposed || raf || !motion || !visible()) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const indexOf = (target: EventTarget | null) =>
      target instanceof Element
        ? cards.current.indexOf(target.closest('.magic-bento__card') as HTMLElement)
        : -1;
    const move = (event: PointerEvent) => {
      if (!finePointer.matches || event.pointerType !== 'mouse') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
      wake();
    };
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      pointer.inside = false;
      pointer.down = -1;
      wake();
    };
    const down = (event: PointerEvent) => {
      if (!finePointer.matches || event.pointerType !== 'mouse' || event.button !== 0) return;
      move(event);
      pointer.down = indexOf(event.target);
      wake();
    };
    const release = () => {
      pointer.down = -1;
      wake();
    };
    const startWave = (event: globalThis.MouseEvent) => {
      if (!motion || !settings.current.clickEffect || event.defaultPrevented) return;
      const index = indexOf(event.target),
        card = cards.current[index];
      if (!card) return;
      if (dirty) measure();
      if (!bounds) return;
      const rect = card.getBoundingClientRect();
      wave.x = event.detail ? event.clientX : rect.left + rect.width / 2;
      wave.y = event.detail ? event.clientY : rect.top + rect.height / 2;
      wave.time = 0;
      wave.reach =
        Math.max(
          Math.hypot(wave.x - bounds.left, wave.y - bounds.top),
          Math.hypot(wave.x - bounds.right, wave.y - bounds.bottom),
        ) + 180;
      wake();
    };
    const clearHover = () => {
      pointer.inside = false;
      pointer.down = -1;
      wake();
    };
    const remeasure = () => {
      dirty = true;
      wake();
    };
    const visibility = () => {
      if (document.hidden) {
        clearHover();
        cancelAnimationFrame(raf);
        raf = 0;
      } else remeasure();
    };
    const resize = new ResizeObserver(() => {
      const width = grid.clientWidth,
        spacing = Math.max(0, gap);
      const cell = (count: number) => (width - spacing * (count - 1)) / count;
      const next =
        cell(columnCount) >= 200 ? columnCount : columnCount >= 2 && cell(2) >= 180 ? 2 : 1;
      setCols(next);
      remeasure();
    });
    resize.observe(grid);
    cells.current.forEach((cell) => {
      if (cell) resize.observe(cell);
    });
    const enter = () => {
      entered = true;
      cells.current.forEach((cell, index) => {
        cell?.style.setProperty('--mb-delay', `${Math.min(index, 6) * 65}ms`);
        cell?.setAttribute('data-state', 'in');
      });
      wake();
    };
    let gate: IntersectionObserver | null = null;
    if (!entered && typeof IntersectionObserver !== 'undefined') {
      cells.current.forEach((cell) => cell?.setAttribute('data-state', 'waiting'));
      gate = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            gate?.disconnect();
            introFrame = requestAnimationFrame(enter);
          }
        },
        { threshold: 0.1 },
      );
      gate.observe(grid);
    } else enter();
    let visibilityGate: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      visibilityGate = new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen) remeasure();
        else {
          cancelAnimationFrame(raf);
          raf = 0;
          clearHover();
        }
      });
      visibilityGate.observe(grid);
    }
    if (motion) {
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerdown', down, { passive: true });
      window.addEventListener('pointerup', release, { passive: true });
      window.addEventListener('pointercancel', clearHover, { passive: true });
      document.addEventListener('pointerout', leave);
      window.addEventListener('blur', clearHover);
      window.addEventListener('scroll', remeasure, { passive: true, capture: true });
      window.addEventListener('resize', remeasure, { passive: true });
      document.addEventListener('visibilitychange', visibility);
      finePointer.addEventListener('change', clearHover);
      grid.addEventListener('click', startWave);
    }
    engine.current = { sync: remeasure };
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(introFrame);
      resize.disconnect();
      gate?.disconnect();
      visibilityGate?.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', clearHover);
      document.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', clearHover);
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
      document.removeEventListener('visibilitychange', visibility);
      finePointer.removeEventListener('change', clearHover);
      grid.removeEventListener('click', startWave);
      cards.current.forEach((card) => {
        if (!card) return;
        card.removeAttribute('data-active');
        for (const name of [
          '--mb-near',
          '--mb-hot',
          '--mb-rx',
          '--mb-ry',
          '--mb-tx',
          '--mb-ty',
          '--mb-press',
          '--mb-wa',
        ])
          card.style.removeProperty(name);
      });
      canvases.current.forEach((canvas) => {
        const context = canvas?.getContext('2d');
        if (canvas && context) {
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
      engine.current = null;
    };
  }, [motion, columnCount, items.length, gap, intro]);

  useClientLayoutEffect(() => {
    engine.current?.sync();
  }, [items, cols, rowHeight, radius, enableStars, enableSpotlight, enableBorderGlow]);
  cells.current.length = items.length;
  cards.current.length = items.length;
  canvases.current.length = items.length;
  const customGlow = parseRgb(glowColor);
  const cardStyle = {
    '--mb-radius': `${Math.max(0, radius)}px`,
    '--mb-pad': `${clamp(radius, 16, 24)}px`,
    '--mb-spot-size': `${Math.max(40, spotlightRadius)}px`,
    '--mb-border-size': `${Math.max(40, spotlightRadius) * 0.85}px`,
    ...(customGlow ? { '--mb-custom-glow': `rgb(${customGlow.join(',')})` } : {}),
    gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`,
    gridAutoRows:
      rowHeight === 'auto' ? 'minmax(150px,auto)' : `minmax(${Math.max(1, rowHeight)}px,auto)`,
    gap: `${Math.max(0, gap)}px`,
    ...style,
  } as CSSProperties;

  return (
    <Container
      ref={(element) => {
        root.current = element;
      }}
      aria-label={ariaLabel}
      className={`magic-bento${className ? ` ${className}` : ''}`}
      data-theme={theme}
      data-motion={motion || undefined}
      data-intro={(motion && intro) || undefined}
      data-autohide={textAutoHide || undefined}
      style={cardStyle}
    >
      {items.map((item, index) => {
        const clickable = Boolean(item.href || item.onClick || onItemClick);
        const Tag = item.href ? 'a' : 'article';
        const activate = (event: ReactMouseEvent<HTMLElement>) => {
          const target = event.target as Element;
          if (target !== event.currentTarget && target.closest(interactive)) return;
          item.onClick?.(event);
          if (!event.defaultPrevented) onItemClick?.(item, index);
        };
        return (
          <div
            key={item.id ?? index}
            ref={(element) => {
              cells.current[index] = element;
            }}
            className="magic-bento__cell"
            style={{
              gridColumn: `span ${Math.min(cols, Math.max(1, Math.round(item.colSpan ?? 1)))}`,
              gridRow: `span ${Math.max(1, Math.round(item.rowSpan ?? 1))}`,
            }}
          >
            <Tag
              ref={(element) => {
                cards.current[index] = element;
              }}
              className={`magic-bento__card${item.className ? ` ${item.className}` : ''}`}
              href={item.href}
              target={item.target}
              rel={item.rel ?? (item.target === '_blank' ? 'noopener noreferrer' : undefined)}
              role={!item.href && clickable ? 'button' : undefined}
              tabIndex={!item.href && clickable ? 0 : undefined}
              aria-label={clickable && typeof item.title === 'string' ? item.title : undefined}
              data-clickable={clickable || undefined}
              data-image={Boolean(item.image) || undefined}
              onClick={clickable ? activate : undefined}
              onKeyDown={(event) => {
                if (
                  event.currentTarget === event.target &&
                  !item.href &&
                  clickable &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              }}
            >
              {item.image && (
                <>
                  <img className="magic-bento__image" src={item.image} alt="" draggable={false} />
                  <span className="magic-bento__scrim" aria-hidden="true" />
                </>
              )}
              {enableSpotlight && <span className="magic-bento__light" aria-hidden="true" />}
              {enableStars && (
                <canvas
                  ref={(element) => {
                    canvases.current[index] = element;
                  }}
                  className="magic-bento__stars"
                  aria-hidden="true"
                />
              )}
              {item.content ?? (
                <div className="magic-bento__content">
                  {(item.icon || item.label) && (
                    <div className="magic-bento__header">
                      {item.icon && (
                        <span className="magic-bento__icon" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      {item.label && <span>{item.label}</span>}
                    </div>
                  )}
                  {item.visual && (
                    <div className="magic-bento__visual" aria-hidden="true">
                      {item.visual}
                    </div>
                  )}
                  {(item.title || item.description) && (
                    <div className="magic-bento__text">
                      {item.title && <h3 className="magic-bento__title">{item.title}</h3>}
                      {item.description && (
                        <p className="magic-bento__description">{item.description}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <span className="magic-bento__rim" aria-hidden="true" />
              <span className="magic-bento__border" aria-hidden="true" />
              <span className="magic-bento__wave" aria-hidden="true" />
            </Tag>
          </div>
        );
      })}
    </Container>
  );
}
