import { lazy, type ComponentType } from 'react'

/** One import promise is shared by intent warming and React.lazy. */
export function preloadable<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let pending: Promise<{ default: T }> | undefined
  const preload = () => pending ??= load().catch(error => { pending = undefined; throw error })
  return Object.assign(lazy(preload), { preload })
}
