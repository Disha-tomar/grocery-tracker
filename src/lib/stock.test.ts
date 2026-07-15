import { describe, expect, test } from 'vitest'
import {
  defaultRestockQty,
  fillPercent,
  formatQty,
  fullAmount,
  isLow,
  isOut,
  levelQty,
} from './stock'

const purchase = (qty: number, daysAgo = 0) => ({
  qty,
  purchased_at: new Date(Date.UTC(2026, 6, 15 - daysAgo)).toISOString(),
})

describe('isLow / isOut', () => {
  test('item at or below its low threshold is low', () => {
    expect(isLow({ current_qty: 100, low_threshold: 100 })).toBe(true)
    expect(isLow({ current_qty: 50, low_threshold: 100 })).toBe(true)
  })

  test('item above its low threshold is not low', () => {
    expect(isLow({ current_qty: 250, low_threshold: 100 })).toBe(false)
  })

  test('item with zero threshold is only low when empty', () => {
    expect(isLow({ current_qty: 5, low_threshold: 0 })).toBe(false)
    expect(isLow({ current_qty: 0, low_threshold: 0 })).toBe(true)
  })

  test('isOut when nothing left', () => {
    expect(isOut({ current_qty: 0 })).toBe(true)
    expect(isOut({ current_qty: 10 })).toBe(false)
  })
})

describe('fullAmount', () => {
  test('uses the largest of the last five purchases', () => {
    const purchases = [purchase(500), purchase(250, 7), purchase(1000, 14)]
    expect(fullAmount(purchases, 100)).toBe(1000)
  })

  test('ignores purchases older than the last five', () => {
    const purchases = [
      purchase(200, 0),
      purchase(200, 1),
      purchase(200, 2),
      purchase(200, 3),
      purchase(200, 4),
      purchase(5000, 30), // sixth-most-recent, ignored
    ]
    expect(fullAmount(purchases, 0)).toBe(200)
  })

  test('never reports full below the current quantity', () => {
    expect(fullAmount([purchase(500)], 800)).toBe(800)
  })

  test('falls back to current quantity when there are no purchases', () => {
    expect(fullAmount([], 300)).toBe(300)
  })

  test('falls back to 1 when there is no signal at all', () => {
    expect(fullAmount([], 0)).toBe(1)
  })
})

describe('levelQty', () => {
  test('maps correction levels to fractions of full', () => {
    expect(levelQty(1000, 'full')).toBe(1000)
    expect(levelQty(1000, 'half')).toBe(500)
    expect(levelQty(1000, 'low')).toBe(250)
    expect(levelQty(1000, 'out')).toBe(0)
  })
})

describe('fillPercent', () => {
  test('reports fraction of full as a 0-100 percent', () => {
    expect(fillPercent(250, 1000)).toBe(25)
  })

  test('clamps to 0-100', () => {
    expect(fillPercent(1500, 1000)).toBe(100)
    expect(fillPercent(-5, 1000)).toBe(0)
  })

  test('empty full amount means empty bar, not NaN', () => {
    expect(fillPercent(0, 0)).toBe(0)
  })
})

describe('defaultRestockQty', () => {
  test('suggests the most recent purchase quantity', () => {
    expect(defaultRestockQty([purchase(250, 3), purchase(500, 10)])).toBe(250)
  })

  test('suggests 1 when the item was never purchased', () => {
    expect(defaultRestockQty([])).toBe(1)
  })
})

describe('formatQty', () => {
  test('shows grams and millilitres plainly under 1000', () => {
    expect(formatQty(500, 'g')).toBe('500 g')
    expect(formatQty(250, 'ml')).toBe('250 ml')
  })

  test('promotes to kg / L at 1000 and trims trailing zeros', () => {
    expect(formatQty(1000, 'g')).toBe('1 kg')
    expect(formatQty(1500, 'g')).toBe('1.5 kg')
    expect(formatQty(2000, 'ml')).toBe('2 L')
  })

  test('counts pieces and packets without conversion', () => {
    expect(formatQty(3, 'pcs')).toBe('3 pcs')
    expect(formatQty(2, 'packet')).toBe('2 packets')
    expect(formatQty(1, 'packet')).toBe('1 packet')
  })

  test('rounds awkward fractions to at most one decimal', () => {
    expect(formatQty(333.33, 'g')).toBe('333.3 g')
  })
})
