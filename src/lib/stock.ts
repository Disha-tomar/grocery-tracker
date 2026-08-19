export type Unit = 'g' | 'ml' | 'pcs' | 'packet'

export type Level = 'full' | 'half' | 'low' | 'out'

export interface StockLike {
  current_qty: number
  low_threshold: number
}

export interface PurchaseLike {
  qty: number
  purchased_at: string
}

const RECENT_PURCHASES = 5

const LEVEL_FRACTION: Record<Level, number> = {
  full: 1,
  half: 0.5,
  low: 0.25,
  out: 0,
}

export function isLow(item: StockLike): boolean {
  if (item.low_threshold <= 0) return item.current_qty <= 0
  return item.current_qty <= item.low_threshold
}

export function isOut(item: Pick<StockLike, 'current_qty'>): boolean {
  return item.current_qty <= 0
}

/**
 * The shopping list is "what ran low" plus "what someone asked for" — a
 * request stands on its own, even when the jar still has plenty left.
 */
export function onShoppingList(item: StockLike & { needed: boolean }): boolean {
  return item.needed || isLow(item)
}

/** What "a full stock" of this item looks like, inferred from recent purchase sizes. */
export function fullAmount(purchases: PurchaseLike[], currentQty: number): number {
  const recent = [...purchases]
    .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at))
    .slice(0, RECENT_PURCHASES)
  const maxRecent = recent.reduce((max, p) => Math.max(max, p.qty), 0)
  return Math.max(maxRecent, currentQty, 0) || 1
}

export function levelQty(full: number, level: Level): number {
  return full * LEVEL_FRACTION[level]
}

export function fillPercent(currentQty: number, full: number): number {
  if (full <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((currentQty / full) * 100)))
}

export function defaultRestockQty(purchases: PurchaseLike[]): number {
  const latest = [...purchases].sort((a, b) =>
    b.purchased_at.localeCompare(a.purchased_at),
  )[0]
  return latest?.qty ?? 1
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function formatQty(qty: number, unit: Unit): string {
  if (unit === 'g' && qty >= 1000) return `${round1(qty / 1000)} kg`
  if (unit === 'ml' && qty >= 1000) return `${round1(qty / 1000)} L`
  if (unit === 'packet') return `${round1(qty)} packet${round1(qty) === 1 ? '' : 's'}`
  return `${round1(qty)} ${unit}`
}
