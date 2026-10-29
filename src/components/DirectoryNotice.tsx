import type { ReactNode } from 'react'
import { ArrowRight, Check, CircleAlert, Info, Link2 } from 'lucide-react'
import './DirectoryNotice.css'

export type DirectoryNoticeTone = 'success' | 'warning' | 'error' | 'info'

type Props = {
  tone: DirectoryNoticeTone
  title: string
  children: ReactNode
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
}

/** Inline directory feedback; only committed deletions use the separate Undo toast. */
export default function DirectoryNotice({ tone, title, children, actionLabel, onAction, actionDisabled }: Props) {
  const Icon = tone === 'success' ? Check : tone === 'warning' ? Link2 : tone === 'error' ? CircleAlert : Info
  return <div className="lc-directory-notice" data-tone={tone}
    role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
    <span className="lc-directory-notice__icon" aria-hidden="true"><Icon size={18}/></span>
    <div className="lc-directory-notice__copy">
      <strong className="lc-directory-notice__title">{title}</strong>
      <p>{children}</p>
    </div>
    {actionLabel && onAction && <button type="button" className="lc-directory-notice__action"
      disabled={actionDisabled} onClick={onAction}>{actionLabel}<ArrowRight size={15} aria-hidden="true"/></button>}
  </div>
}
