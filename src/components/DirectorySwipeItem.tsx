import { Check, Pencil, Trash2, X } from 'lucide-react'
import SwipeRow from './SwipeRow'
import './DirectorySwipeItem.css'

type Props = {
  name: string
  kind: 'ministry' | 'church'
  assigned: number
  open: boolean
  busy: boolean
  editing: boolean
  confirming: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onRename: () => void
  onDelete: () => void
  onChange: (value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

export default function DirectorySwipeItem({
  name, kind, assigned, open, busy, editing, confirming, value, onOpenChange,
  onRename, onDelete, onChange, onSave, onCancelEdit, onConfirmDelete, onCancelDelete,
}: Props) {
  return <SwipeRow label={name} className="lc-directory-swipe" radius={0} height={84} actionWidth={80}
    fullSwipe={false} open={open && !editing && !confirming} onOpenChange={onOpenChange}
    disabled={busy || editing || confirming} actions={[
      { id: 'edit', label: 'Rename', icon: <Pencil size={18}/>, title: `Rename ${kind}`, onSelect: onRename },
      { id: 'delete', label: 'Delete', icon: <Trash2 size={18}/>, title: `Delete ${kind}`, onSelect: onDelete },
    ]}>
    <article className="lc-directory-swipe__content" aria-busy={busy}>
      <div className="lc-directory-swipe__name">
        {editing ? <input aria-label={`New name for ${name}`} autoFocus disabled={busy} value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); onSave() }
            if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancelEdit() }
          }}/> : <strong>{name}</strong>}
        <span>{assigned} Assigned Member{assigned === 1 ? '' : 's'}</span>
      </div>
      {editing && <div className="lc-directory-swipe__editor" data-no-swipe>
        <button type="button" disabled={busy} onClick={onSave} aria-label={`Save ${name}`} title="Save name"><Check size={18}/></button>
        <button type="button" disabled={busy} onClick={onCancelEdit} aria-label={`Cancel renaming ${name}`} title="Cancel rename"><X size={18}/></button>
      </div>}
      {confirming && <div className="lc-directory-swipe__confirm" data-no-swipe>
        <span>{busy ? 'Deleting…' : 'Delete this entry?'}</span>
        <button type="button" autoFocus disabled={busy} onClick={onCancelDelete} aria-label={`Keep ${name}`} title="Keep"><X size={17}/></button>
        <button type="button" disabled={busy} onClick={onConfirmDelete} aria-label={`Confirm delete ${name}`} title="Confirm delete"><Check size={17}/></button>
      </div>}
    </article>
  </SwipeRow>
}
