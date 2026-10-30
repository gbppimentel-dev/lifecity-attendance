import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import './border-glow.css';

type BorderGlowProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  animateBorder?: boolean;
  duration?: number;
  colors?: string[];
  fillOpacity?: number;
  disabled?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const defaultColors = [
  'var(--lc-framePrimary, #8ac7b5)',
  'var(--lc-frameSecondary, #b8a4dc)',
  'var(--lc-frameHighlight, #edce83)',
];
const positions = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const colorMap = [0, 1, 2, 0, 1, 2, 1];

function glowVariables(value: string | undefined, intensity: number): Record<string, string> {
  const result: Record<string, string> = {};
  const match = value?.match(/^\s*([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?\s*$/);
  const color = match
    ? `hsl(${Number(match[1])}deg ${clamp(Number(match[2]), 0, 100)}% ${clamp(Number(match[3]), 0, 100)}%)`
    : 'var(--lc-primary, #147d73)';
  for (const opacity of [100, 60, 50, 40, 30, 20, 10]) {
    result[`--lc-bg-glow-${opacity}`] =
      `color-mix(in srgb, ${color} ${Math.min(opacity * intensity, 100)}%, transparent)`;
  }
  return result;
}

export default function BorderGlow({
  as: Tag = 'div',
  children,
  className = '',
  style,
  edgeSensitivity = 30,
  glowColor,
  backgroundColor,
  borderRadius,
  glowRadius = 28,
  glowIntensity = 0.7,
  coneSpread = 25,
  animated = false,
  animateBorder = true,
  duration = 12,
  colors,
  fillOpacity = 0.14,
  disabled = false,
  onPointerMove,
  onPointerLeave,
  ...attributes
}: BorderGlowProps) {
  const card = useRef<HTMLElement>(null);
  const pointerFrame = useRef(0);
  const introFrame = useRef(0);
  const introDone = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const [running, setRunning] = useState(false);
  const interactive = useRef(false);

  useEffect(() => {
    const element = card.current;
    if (!element) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    let inView = true;
    const sync = () => {
      const allowed =
        !disabled &&
        !reduced.matches &&
        document.documentElement.dataset.lcMotion !== 'off' &&
        !document.hidden &&
        inView;
      interactive.current = allowed && fine.matches;
      setRunning(allowed);
      if (!interactive.current) {
        cancelAnimationFrame(pointerFrame.current);
        pointerFrame.current = 0;
        element.style.setProperty('--lc-bg-edge', '0');
      }
    };
    const visibility = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? false;
        sync();
      },
      { rootMargin: '40px' },
    );
    visibility.observe(element);
    const preference = new MutationObserver(sync);
    preference.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lc-motion'],
    });
    reduced.addEventListener('change', sync);
    fine.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      interactive.current = false;
      visibility.disconnect();
      preference.disconnect();
      reduced.removeEventListener('change', sync);
      fine.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(pointerFrame.current);
      pointerFrame.current = 0;
    };
  }, [disabled]);

  useEffect(() => {
    if (!animated || !running || introDone.current || !card.current) return;
    const element = card.current;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = clamp((now - start) / 2400, 0, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const edge = progress < 0.2 ? progress / 0.2 : progress > 0.7 ? (1 - progress) / 0.3 : 1;
      element.style.setProperty('--lc-bg-angle', `${110 + 355 * ease}deg`);
      element.style.setProperty('--lc-bg-edge', `${clamp(edge, 0, 1) * 100}`);
      if (progress < 1) introFrame.current = requestAnimationFrame(tick);
      else {
        introDone.current = true;
        introFrame.current = 0;
      }
    };
    introFrame.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(introFrame.current);
      introFrame.current = 0;
      element.style.setProperty('--lc-bg-edge', '0');
    };
  }, [animated, running]);

  const palette = colors?.filter(Boolean).length ? colors.filter(Boolean) : defaultColors;
  const variables: Record<string, string | number> = {
    '--lc-bg-sensitivity': clamp(edgeSensitivity, 0, 95),
    '--lc-bg-color-sensitivity': clamp(edgeSensitivity + 20, 0, 95),
    '--lc-bg-cone': clamp(coneSpread, 5, 45),
    '--lc-bg-padding': `${clamp(glowRadius, 0, 80)}px`,
    '--lc-bg-fill-opacity': clamp(fillOpacity, 0, 0.6),
    '--lc-bg-duration': `${Math.max(4, duration)}s`,
    '--lc-bg-color-1': palette[0],
    '--lc-bg-color-2': palette[Math.min(1, palette.length - 1)],
    '--lc-bg-color-3': palette[Math.min(2, palette.length - 1)],
    ...glowVariables(glowColor, clamp(glowIntensity, 0.1, 3)),
  };
  positions.forEach((position, index) => {
    variables[`--lc-bg-gradient-${index + 1}`] =
      `radial-gradient(at ${position}, ${palette[Math.min(colorMap[index], palette.length - 1)]} 0px, transparent 50%)`;
  });
  if (borderRadius !== undefined) variables.borderRadius = `${borderRadius}px`;
  if (backgroundColor) variables.backgroundColor = backgroundColor;

  return (
    <Tag
      {...attributes}
      ref={card as RefObject<HTMLDivElement>}
      className={`lc-border-glow${className ? ` ${className}` : ''}`}
      data-bg-running={running && animateBorder ? '' : undefined}
      style={{ ...variables, ...style } as CSSProperties}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (!interactive.current || event.pointerType !== 'mouse') return;
        if (introFrame.current) {
          cancelAnimationFrame(introFrame.current);
          introFrame.current = 0;
          introDone.current = true;
        }
        pointer.current = { x: event.clientX, y: event.clientY };
        if (pointerFrame.current) return;
        pointerFrame.current = requestAnimationFrame(() => {
          pointerFrame.current = 0;
          const element = card.current;
          if (!element || !interactive.current) return;
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const dx = pointer.current.x - rect.left - rect.width / 2;
          const dy = pointer.current.y - rect.top - rect.height / 2;
          const edge = clamp(
            Math.max(Math.abs(dx) / (rect.width / 2), Math.abs(dy) / (rect.height / 2)),
            0,
            1,
          );
          const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
          element.style.setProperty('--lc-bg-edge', `${(edge * 100).toFixed(3)}`);
          element.style.setProperty('--lc-bg-angle', `${angle.toFixed(3)}deg`);
        });
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        cancelAnimationFrame(pointerFrame.current);
        pointerFrame.current = 0;
        card.current?.style.setProperty('--lc-bg-edge', '0');
      }}
    >
      {children}
      <span className="lc-border-glow__frame" aria-hidden="true" />
      <span className="lc-border-glow__mesh" aria-hidden="true" />
      <span className="lc-border-glow__fill" aria-hidden="true" />
      <span className="lc-border-glow__edge" aria-hidden="true" />
    </Tag>
  );
}
