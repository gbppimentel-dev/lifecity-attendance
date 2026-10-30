import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import './swipe-row.css';

export type SwipeAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  color?: string;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
  onSelect?: () => void;
};

type SwipeRowProps = {
  children: ReactNode;
  actions: SwipeAction[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: (action: SwipeAction) => void;
  disabled?: boolean;
  closeOnAction?: boolean;

  fullSwipe?: false;
  actionWidth?: number;
  direction?: 'left' | 'right';
  snapBounce?: number;
  resistance?: number;
  rowColor?: string;
  drawerColor?: string;
  textColor?: string;
  radius?: number;

  height?: number | 'auto';
  label?: string;
  className?: string;
  style?: CSSProperties;
};

type Grip = {
  id: number;
  x0: number;
  y0: number;
  base: number;
  moved: boolean;
  wasOpen: boolean;
  history: [number, number][];
};

const HYSTERESIS = 10;
const FLICK = 110;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const rubber = (value: number, size: number, resistance: number) =>
  (value * size * resistance) / (size + resistance * Math.abs(value));
const interactive =
  'button,a,input,textarea,select,summary,[contenteditable="true"],[data-no-swipe]';

export default function SwipeRow({
  children,
  actions,
  open: openProp,
  onOpenChange,
  onAction,
  disabled = false,
  closeOnAction = true,
  actionWidth = 76,
  direction = 'left',
  snapBounce = 0.16,
  resistance = 0.55,
  rowColor,
  drawerColor,
  textColor,
  radius = 12,
  height = 'auto',
  label = 'Service',
  className = '',
  style,
}: SwipeRowProps) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const grip = useRef<Grip | null>(null);
  const suppressClickUntil = useRef(0);
  const railHadFocus = useRef(false);
  const changeCallback = useRef(onOpenChange);
  changeCallback.current = onOpenChange;
  const [localOpen, setLocalOpen] = useState(false);
  const [rowWidth, setRowWidth] = useState(360);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [appMotionOff, setAppMotionOff] = useState(
    () => document.documentElement.dataset.lcMotion === 'off',
  );
  const reduced = useReducedMotion() || appMotionOff;
  const open = openProp ?? localOpen;
  const openRef = useRef(open);
  openRef.current = open;
  const sign = direction === 'left' ? -1 : 1;
  const compact = rowWidth <= 480;
  const controlGutter = compact ? 4 : 16;
  const railPadding = compact ? 0 : 12;
  const actionGap = compact ? 0 : 8;
  const controlSpace = 44 + controlGutter * 2;
  const drawerWidth = Math.min(
    Math.max(44, actionWidth) * actions.length +
      railPadding * 2 +
      actionGap * Math.max(0, actions.length - 1),
    Math.max(0, rowWidth - controlSpace),
  );
  const drawerRef = useRef(drawerWidth);
  drawerRef.current = drawerWidth;
  const x = useMotionValue(0);
  const exposure = useTransform(x, (value) => sign * value);
  const railX = useTransform(exposure, (value) => -sign * Math.max(0, drawerWidth - value));

  const restoreToggleFocus = useCallback(() => {
    if (
      rail.current?.contains(document.activeElement) ||
      (railHadFocus.current && document.activeElement === document.body)
    ) {
      toggle.current?.focus({ preventScroll: true });
      railHadFocus.current = false;
    }
  }, []);

  const changeOpen = useCallback(
    (next: boolean, restoreFocus = false) => {
      if (!next && restoreFocus) restoreToggleFocus();
      if (openRef.current === next) return;
      openRef.current = next;
      setLocalOpen(next);
      changeCallback.current?.(next);
      setAnnouncement(next ? `${actions.length} actions revealed` : 'Actions hidden');
    },
    [actions.length, restoreToggleFocus],
  );

  const settle = useCallback(
    (target: number, velocity = 0) => {
      x.stop();
      if (reduced) {
        x.set(sign * target);
        return;
      }
      animate(x, sign * target, {
        type: 'spring',
        duration: Math.abs(velocity) >= FLICK ? 0.35 : 0.28,
        bounce: Math.abs(velocity) >= FLICK ? clamp(snapBounce, 0, 0.35) : 0,
        velocity: sign * clamp(velocity, -1500, 1500),
      });
    },
    [x, sign, reduced, snapBounce],
  );

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    setRowWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setRowWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setAppMotionOff(document.documentElement.dataset.lcMotion === 'off');
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lc-motion'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (disabled && grip.current) {
      const pointerId = grip.current.id;
      grip.current = null;
      setDragging(false);
      if (surface.current?.hasPointerCapture(pointerId))
        surface.current.releasePointerCapture(pointerId);
    }
    if (disabled && open) changeOpen(false, true);
    if (!grip.current) {
      if (!open) restoreToggleFocus();
      settle(open && !disabled ? drawerWidth : 0);
    }
  }, [open, disabled, drawerWidth, settle, changeOpen, restoreToggleFocus]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) changeOpen(false, true);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, changeOpen]);

  useEffect(
    () => () => {
      x.stop();
    },
    [x],
  );

  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = grip.current;
    if (!current || current.id !== event.pointerId) return;
    grip.current = null;
    setDragging(false);
    if (surface.current?.hasPointerCapture(event.pointerId))
      surface.current.releasePointerCapture(event.pointerId);
    if (cancelled) {
      settle(openRef.current ? drawerRef.current : 0);
      return;
    }
    if (!current.moved) {
      if (current.wasOpen) changeOpen(false, true);

      settle(0);
      return;
    }
    suppressClickUntil.current = performance.now() + 350;
    const history = current.history;
    const first = history[0],
      last = history.at(-1);
    const velocity =
      first && last && history.length > 1 && performance.now() - last[0] < 100
        ? ((last[1] - first[1]) / Math.max(1, last[0] - first[0])) * 1000
        : 0;
    const exposed = exposure.get();
    const target =
      Math.abs(velocity) >= FLICK
        ? velocity > 0
          ? drawerWidth
          : 0
        : exposed + velocity * 0.499 > drawerWidth / 2
          ? drawerWidth
          : 0;
    changeOpen(target > 0, target === 0);
    settle(target, velocity);
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    suppressClickUntil.current = 0;
    if (disabled || !actions.length || grip.current || !event.isPrimary || event.button !== 0)
      return;
    if ((event.target as Element).closest(interactive)) return;
    x.stop();
    grip.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      base: clamp(exposure.get(), 0, drawerWidth),
      moved: false,
      wasOpen: openRef.current,
      history: [[performance.now(), clamp(exposure.get(), 0, drawerWidth)]],
    };
    surface.current?.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = grip.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x0,
      dy = event.clientY - current.y0;
    if (!current.moved) {
      if (Math.abs(dy) > HYSTERESIS && Math.abs(dy) > Math.abs(dx)) {
        finish(event, true);
        return;
      }
      if (Math.abs(dx) < HYSTERESIS || Math.abs(dx) < Math.abs(dy)) return;
      current.moved = true;
      setDragging(true);
    }
    event.preventDefault();
    const raw = current.base + sign * (dx - Math.sign(dx) * HYSTERESIS);
    const c = clamp(resistance, 0.05, 1);
    const exposed =
      raw < 0
        ? rubber(raw, rowWidth, c)
        : raw > drawerWidth
          ? drawerWidth + rubber(raw - drawerWidth, rowWidth, c)
          : raw;
    x.set(sign * exposed);
    current.history.push([performance.now(), exposed]);
    if (current.history.length > 4) current.history.shift();
  };

  const act = (action: SwipeAction) => {
    if (disabled || action.disabled) return;
    if (closeOnAction) {
      changeOpen(false, true);
      settle(0);
    }

    onAction?.(action);
    action.onSelect?.();
  };

  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      className={`lc-swipe-row${className ? ` ${className}` : ''}`}
      data-direction={direction}
      data-open={open ? '' : undefined}
      data-compact={compact ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      style={
        {
          '--sr-drawer-width': `${drawerWidth}px`,
          '--sr-radius': `${radius}px`,
          '--sr-control-gutter': `${controlGutter}px`,
          '--sr-control-space': `${controlSpace}px`,
          '--sr-rail-padding': `${railPadding}px`,
          '--sr-action-gap': `${actionGap}px`,
          ...(rowColor ? { '--sr-row': rowColor } : {}),
          ...(drawerColor ? { '--sr-drawer': drawerColor } : {}),
          ...(textColor ? { '--sr-text': textColor } : {}),
          ...(typeof height === 'number' ? { minHeight: height } : {}),
          ...style,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          changeOpen(false, true);
          settle(0);
        }
      }}
      onClickCapture={(event) => {
        if (performance.now() < suppressClickUntil.current) {
          suppressClickUntil.current = 0;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          changeOpen(false);
      }}
    >
      <motion.div
        ref={surface}
        className="lc-swipe-row__surface"
        style={{ x }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
      >
        {children}
        <button
          ref={toggle}
          type="button"
          className="lc-swipe-row__toggle"
          disabled={!actions.length}
          aria-disabled={disabled && !open ? true : undefined}
          aria-label={`${open ? 'Hide' : 'Show'} actions for ${label}`}
          title={`${open ? 'Hide' : 'Show'} actions for ${label}`}
          aria-expanded={open}
          aria-controls={`${uid}-actions`}
          aria-keyshortcuts={
            direction === 'left' ? 'ArrowLeft ArrowRight Escape' : 'ArrowRight ArrowLeft Escape'
          }
          onClick={() => {
            if (disabled && !open) return;
            const next = !open;
            changeOpen(next, !next);
            settle(next ? drawerWidth : 0);
          }}
          onKeyDown={(event) => {
            const openingKey = direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
            const closingKey = direction === 'left' ? 'ArrowRight' : 'ArrowLeft';
            if (event.key === openingKey && !disabled) {
              event.preventDefault();
              changeOpen(true);
              settle(drawerWidth);
            }
            if (event.key === closingKey) {
              event.preventDefault();
              changeOpen(false, true);
              settle(0);
            }
          }}
        >
          {open ? (
            direction === 'left' ? (
              <ChevronRight size={19} aria-hidden="true" />
            ) : (
              <ChevronLeft size={19} aria-hidden="true" />
            )
          ) : (
            <MoreHorizontal size={19} aria-hidden="true" />
          )}
        </button>
      </motion.div>
      <motion.div
        ref={rail}
        id={`${uid}-actions`}
        className="lc-swipe-row__rail"
        style={{ x: railX }}
        inert={!open || undefined}
        aria-hidden={!open}
        onFocusCapture={() => {
          railHadFocus.current = true;
        }}
        onBlurCapture={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
            railHadFocus.current = false;
        }}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="lc-swipe-row__action"
            data-action-id={action.id}
            disabled={disabled || action.disabled}
            aria-label={`${action.label}: ${label}`}
            aria-pressed={action.pressed}
            title={action.title ?? action.label}
            style={action.color ? { background: action.color } : undefined}
            onClick={() => act(action)}
          >
            {action.icon && (
              <span className="lc-swipe-row__icon" aria-hidden="true">
                {action.icon}
              </span>
            )}
            <span>{action.label}</span>
          </button>
        ))}
      </motion.div>
      <span className="lc-swipe-row__sr" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
