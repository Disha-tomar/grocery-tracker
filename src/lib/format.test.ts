import { describe, expect, test } from 'vitest'
import { formatLastPurchase, formatShortDate } from './format'

describe('formatShortDate', () => {
  test('same-year dates show day + month, Indian style', () => {
    expect(formatShortDate('2026-07-02T10:00:00Z', new Date('2026-07-15'))).toBe('2 Jul')
  })

  test('older years include the year', () => {
    expect(formatShortDate('2025-12-28T10:00:00Z', new Date('2026-07-15'))).toBe(
      '28 Dec 2025',
    )
  })
})

describe('formatLastPurchase', () => {
  const now = new Date('2026-07-15')

  test('shows qty, price and date', () => {
    expect(
      formatLastPurchase({ qty: 500, price: 210, purchased_at: '2026-07-02T10:00:00Z' }, 'g', now),
    ).toBe('500 g @ AED 210 · 2 Jul')
  })

  test('omits price when it was not recorded', () => {
    expect(
      formatLastPurchase({ qty: 2, price: null, purchased_at: '2026-07-02T10:00:00Z' }, 'pcs', now),
    ).toBe('2 pcs · 2 Jul')
  })
})
