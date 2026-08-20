import { describe, expect, test } from 'vitest'
import { buildNeedNotification, shouldPruneSubscription } from './notification'

describe('buildNeedNotification', () => {
  test('names the person and the thing they need', () => {
    const n = buildNeedNotification('Disha', 'paneer', 'Tomar House', 'item-1')
    expect(n.title).toBe('Disha needs paneer 🙋')
    expect(n.body).toBe('Tomar House')
  })

  test('falls back to "Someone" when the profile has no display name', () => {
    const n = buildNeedNotification('', 'atta', 'Tomar House', 'item-2')
    expect(n.title).toBe('Someone needs atta 🙋')
  })

  test('tags per item so re-flagging replaces rather than stacks', () => {
    expect(buildNeedNotification('Disha', 'rice', 'Home', 'abc').tag).toBe('need-abc')
  })

  test('sends the tap to the shopping list', () => {
    expect(buildNeedNotification('Disha', 'rice', 'Home', 'abc').url).toBe('/low')
  })
})

describe('shouldPruneSubscription', () => {
  test('prunes endpoints the push service says are gone', () => {
    expect(shouldPruneSubscription(404)).toBe(true)
    expect(shouldPruneSubscription(410)).toBe(true)
  })

  test('keeps endpoints that failed for transient reasons', () => {
    expect(shouldPruneSubscription(429)).toBe(false)
    expect(shouldPruneSubscription(500)).toBe(false)
    expect(shouldPruneSubscription(0)).toBe(false)
  })
})
