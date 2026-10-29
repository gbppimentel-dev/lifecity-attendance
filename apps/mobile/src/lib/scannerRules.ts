/** Existing member IDs use a private random token, optionally prefixed with att:. */
export function memberToken(value: string): string | null {
  const token = value.trim().replace(/^att:/, '')
  return token && token.length <= 1024 ? token : null
}

/** Mirrors the current web service contract: upcoming plus the three-hour service window. */
export function serviceAcceptsCheckIns(service: { starts_at: string; archived_at?: string | null } | null, now = Date.now()): boolean {
  if (!service || service.archived_at) return false
  const start = Date.parse(service.starts_at)
  return Number.isFinite(start) && Number.isFinite(now) && now < start + 3 * 3600000
}
