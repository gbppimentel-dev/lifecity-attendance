import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, Info } from 'lucide-react';
import SwipeToast, { type ToastCloseReason, type ToastTone } from '../components/SwipeToast';

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  onDismiss?: (reason: ToastCloseReason) => void | Promise<void>;
};
type Entry = ToastOptions & { id: string; open: boolean };
type ToastAPI = {
  notify: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};
const ToastContext = createContext<ToastAPI | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const sequence = useRef(0);
  const activeIds = useRef(new Set<string>());
  const notify = useCallback((options: ToastOptions) => {
    const id = `lc-toast-${Date.now()}-${++sequence.current}`;
    activeIds.current.add(id);
    setEntries((current) => [...current, { ...options, id, open: true }]);
    return id;
  }, []);
  const dismiss = useCallback(
    (id: string) =>
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, open: false } : entry)),
      ),
    [],
  );
  const clear = useCallback(() => {
    activeIds.current.clear();
    setEntries([]);
    setExpanded(false);
  }, []);
  const api = useMemo(() => ({ notify, dismiss, clear }), [notify, dismiss, clear]);
  const remove = (entry: Entry, reason: ToastCloseReason) => {
    if (!activeIds.current.delete(entry.id)) return;
    setEntries((current) => current.filter((item) => item.id !== entry.id));

    try {
      void Promise.resolve(entry.onDismiss?.(reason)).catch((error) =>
        notify({
          title: 'Action could not be completed',
          description: error instanceof Error ? error.message : 'Please try again.',
          tone: 'error',
        }),
      );
    } catch (error) {
      notify({
        title: 'Action could not be completed',
        description: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <section className="lc-toast-stack" aria-label="Notifications">
          {}
          {!expanded && entries.length > 3 && (
            <button type="button" className="lc-toast-queue" onClick={() => setExpanded(true)}>
              Show {entries.length - 3} more notification{entries.length - 3 === 1 ? '' : 's'}
            </button>
          )}
          {entries.slice(0, expanded ? entries.length : 3).map((entry) => (
            <SwipeToast
              key={entry.id}
              inline
              open={entry.open}
              title={entry.title}
              description={entry.description}
              tone={entry.tone}
              icon={
                entry.tone === 'error' ? (
                  <CircleAlert />
                ) : entry.tone === 'info' ? (
                  <Info />
                ) : (
                  <CheckCircle2 />
                )
              }
              duration={
                entry.duration ?? (entry.tone === 'error' ? 0 : entry.onAction ? 10000 : 5000)
              }
              actionLabel={entry.actionLabel ?? (entry.onAction ? 'Undo' : undefined)}
              onAction={entry.onAction}
              onClose={(reason) => remove(entry, reason)}
            />
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastAPI {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
