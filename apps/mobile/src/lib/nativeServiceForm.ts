/** Native date pickers use the device zone; services are always scheduled in Manila. */
export function manilaScheduleParts(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) throw Error('Choose a valid schedule.')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]))
  const hour = Number(parts.hour)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: String(hour % 12 || 12), minute: parts.minute, period: hour >= 12 ? 'PM' : 'AM' }
}

export function serviceStartsAt(date: string, hour: string, minute: string, period: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[1-9]|1[0-2])$/.test(hour) || !/^\d{2}$/.test(minute) || Number(minute) > 59 || !['AM', 'PM'].includes(period)) throw Error('Choose a valid date and time.')
  const h = Number(hour) % 12 + (period === 'PM' ? 12 : 0)
  const iso = new Date(`${date}T${String(h).padStart(2, '0')}:${minute}:00+08:00`)
  if (!Number.isFinite(iso.getTime()) || manilaScheduleParts(iso.toISOString()).date !== date) throw Error('Choose a valid date and time.')
  return iso.toISOString()
}
