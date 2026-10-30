export type DemoRole = 'owner' | 'admin' | 'member' | 'guest'
// The demo mirrors the app's existing untyped PostgREST contracts.
export type DemoRow = Record<string, any>
export type DemoState = {
  version: 1
  seededAt: string
  revision: number
  role: DemoRole
  tables: Record<string, DemoRow[]>
  appearance: DemoRow
  undo: Record<string, { row: DemoRow; actor: string; expires: number }>
  imports: Record<string, DemoRow>
}
export type DemoStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
