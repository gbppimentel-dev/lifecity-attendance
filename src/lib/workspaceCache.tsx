import { createContext, useContext, useState, type ReactNode } from 'react'

// Read snapshots live only inside this signed-in workspace. They never reach
// disk, survive sign-out, or replace the live request made on a page revisit.
export class WorkspaceReadCache {
  private entries = new Map<string, { value: unknown; saved: number }>()
  constructor(private limit = 12, private maxAge = 60_000, private now = () => Date.now()) {}
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.now() - entry.saved >= this.maxAge) { this.entries.delete(key); return undefined }
    this.entries.delete(key); this.entries.set(key, entry)
    return entry.value as T
  }
  set(key: string, value: unknown) {
    this.entries.delete(key)
    this.entries.set(key, { value, saved: this.now() })
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
  }
  invalidate(prefix: string) { for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key) }
}
const CacheContext = createContext<WorkspaceReadCache | null>(null)
const emptyCache = { get: <T,>(_key: string): T | undefined => undefined, set: (_key: string, _value: unknown) => {}, invalidate: (_prefix: string) => {} }
export function WorkspaceCacheProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new WorkspaceReadCache())
  return <CacheContext.Provider value={cache}>{children}</CacheContext.Provider>
}
export function useWorkspaceCache() { return useContext(CacheContext) ?? emptyCache }
