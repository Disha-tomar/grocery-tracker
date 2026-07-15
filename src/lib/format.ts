import { formatQty, type Unit } from './stock'

export function formatShortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear()
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  return new Intl.DateTimeFormat('en-IN', opts).format(date)
}

export interface LastPurchaseLike {
  qty: number
  price: number | null
  purchased_at: string
}

export function formatLastPurchase(
  purchase: LastPurchaseLike,
  unit: Unit,
  now: Date = new Date(),
): string {
  const qty = formatQty(purchase.qty, unit)
  const date = formatShortDate(purchase.purchased_at, now)
  const price = purchase.price != null ? ` @ ₹${purchase.price}` : ''
  return `${qty}${price} · ${date}`
}
