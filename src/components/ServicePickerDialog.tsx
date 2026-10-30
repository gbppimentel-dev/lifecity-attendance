import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import './service-picker-dialog.css';

export default function ServicePickerDialog({
  id,
  open,
  onClose,
  disabled,
  trigger,
  labelledBy,
  className = '',
  children,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  disabled: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!open || disabled) return;
    const node = dialog.current;
    if (!node) return;
    const overflow = document.body.style.overflow,
      padding = document.body.style.paddingRight;
    const gap = Math.max(0, innerWidth - document.documentElement.clientWidth);
    if (gap)
      document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + gap}px`;
    document.body.style.overflow = 'hidden';
    if (!node.open) node.showModal();
    const place = () => {
      const anchor = trigger.current;
      if (!anchor?.isConnected) {
        onClose();
        return;
      }
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0,
        y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth,
        height = viewport?.height ?? innerHeight;
      const box = anchor.getBoundingClientRect(),
        margin = 12,
        gap = 8;
      const panelWidth = Math.min(364, width - margin * 2);
      const panelHeight = Math.min(node.scrollHeight + 2, height - margin * 2);
      const below = y + height - box.bottom - gap - margin,
        above = box.top - y - gap - margin;
      const left = Math.max(x + margin, Math.min(box.left, x + width - panelWidth - margin));
      let top =
        below >= panelHeight
          ? box.bottom + gap
          : above >= panelHeight
            ? box.top - gap - panelHeight
            : y + (height - panelHeight) / 2;
      top = Math.max(y + margin, Math.min(top, y + height - panelHeight - margin));
      const next = {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(panelWidth),
        maxHeight: Math.max(100, Math.floor(height - margin * 2)),
        visibility: 'visible' as const,
      };
      setPosition((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    place();
    const frame = requestAnimationFrame(() =>
      node.querySelector<HTMLElement>('[data-picker-autofocus]')?.focus({ preventScroll: true }),
    );
    const reposition = (event: Event) => {
      if (!(event.target instanceof Node) || !node.contains(event.target)) place();
    };
    const resize = new ResizeObserver(place);
    resize.observe(node);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      node.close();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = padding;
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, [open, disabled, onClose, trigger]);
  useLayoutEffect(() => {
    if (open && disabled) onClose();
  }, [open, disabled, onClose]);
  return createPortal(
    <dialog
      ref={dialog}
      id={id}
      className={`lc-service-picker ${className}`}
      aria-labelledby={labelledBy}
      style={position}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
