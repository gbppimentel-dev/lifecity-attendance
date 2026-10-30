import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import SwipeRow from './SwipeRow';
import './directory-swipe-item.css';

type Props = {
  name: string;
  kind: 'ministry' | 'church';
  assigned: number;
  open: boolean;
  busy: boolean;
  editing: boolean;
  confirming: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

export default function DirectorySwipeItem({
  name,
  kind,
  assigned,
  open,
  busy,
  editing,
  confirming,
  value,
  onOpenChange,
  onRename,
  onDelete,
  onChange,
  onSave,
  onCancelEdit,
  onConfirmDelete,
  onCancelDelete,
}: Props) {
  const content = useRef<HTMLElement>(null);
  const previousMode = useRef<'editing' | 'confirming' | null>(null);
  useLayoutEffect(() => {
    const mode = editing ? 'editing' : confirming ? 'confirming' : null;
    if (mode && previousMode.current !== mode) {
      content.current
        ?.querySelector<HTMLElement>('[data-directory-initial-focus]')
        ?.focus({ preventScroll: true });
    } else if (previousMode.current && !mode && document.activeElement === document.body) {
      content.current
        ?.closest('.lc-directory-swipe')
        ?.querySelector<HTMLButtonElement>('.lc-swipe-row__toggle')
        ?.focus({ preventScroll: true });
    }
    previousMode.current = mode;
  }, [editing, confirming]);

  return (
    <SwipeRow
      label={name}
      className={`lc-directory-swipe${editing ? ' is-editing' : confirming ? ' is-confirming' : ''}`}
      radius={0}
      height={84}
      actionWidth={80}
      fullSwipe={false}
      open={open && !editing && !confirming}
      onOpenChange={onOpenChange}
      disabled={busy || editing || confirming}
      actions={[
        {
          id: 'edit',
          label: 'Rename',
          icon: <Pencil size={18} />,
          title: `Rename ${kind}`,
          onSelect: onRename,
        },
        {
          id: 'delete',
          label: 'Delete',
          icon: <Trash2 size={18} />,
          title: `Delete ${kind}`,
          onSelect: onDelete,
        },
      ]}
    >
      <article
        ref={content}
        className="lc-directory-swipe__content"
        aria-busy={busy}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && confirming && !busy) {
            event.preventDefault();
            event.stopPropagation();
            onCancelDelete();
          }
        }}
      >
        {editing ? (
          <div className="lc-directory-swipe__editor" data-no-swipe>
            <label className="lc-directory-swipe__field">
              <span>
                <Pencil size={13} aria-hidden="true" />
                Rename {kind}
              </span>
              <input
                aria-label={`New name for ${name}`}
                data-directory-initial-focus
                disabled={busy}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy && value.trim()) {
                    event.preventDefault();
                    onSave();
                  }
                  if (event.key === 'Escape' && !busy) {
                    event.preventDefault();
                    event.stopPropagation();
                    onCancelEdit();
                  }
                }}
              />
            </label>
            <div className="lc-directory-swipe__buttons">
              <button
                className="lc-directory-swipe__button is-quiet"
                type="button"
                disabled={busy}
                onClick={onCancelEdit}
                aria-label={`Cancel renaming ${name}`}
              >
                <X size={16} aria-hidden="true" />
                Cancel
              </button>
              <button
                className="lc-directory-swipe__button is-save"
                type="button"
                disabled={busy || !value.trim()}
                onClick={onSave}
                aria-label={`Save ${name}`}
              >
                <Check size={16} aria-hidden="true" />
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : confirming ? (
          <div className="lc-directory-swipe__confirm" data-no-swipe>
            <span className="lc-directory-swipe__confirm-icon" aria-hidden="true">
              <Trash2 size={20} />
            </span>
            <div className="lc-directory-swipe__confirm-copy">
              <strong>Delete {name}?</strong>
              <span>You can undo this for 10 seconds.</span>
            </div>
            <div className="lc-directory-swipe__buttons">
              <button
                className="lc-directory-swipe__button is-quiet"
                type="button"
                data-directory-initial-focus
                disabled={busy}
                onClick={onCancelDelete}
                aria-label={`Keep ${name}`}
              >
                Keep
              </button>
              <button
                className="lc-directory-swipe__button is-delete"
                type="button"
                disabled={busy}
                onClick={onConfirmDelete}
                aria-label={`Confirm delete ${name}`}
              >
                <Trash2 size={16} aria-hidden="true" />
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <div className="lc-directory-swipe__name">
            <strong>{name}</strong>
            <span>
              {assigned} Assigned Member{assigned === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </article>
    </SwipeRow>
  );
}
