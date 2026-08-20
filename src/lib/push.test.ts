import { describe, expect, test } from 'vitest'
import { describeDevice, isUniqueViolation, urlBase64ToUint8Array, withTimeout } from './push'

describe('urlBase64ToUint8Array', () => {
  test('decodes a URL-safe base64 VAPID key to bytes', () => {
    // "hi" in standard base64 is "aGk=", which needs one padding character.
    expect(Array.from(urlBase64ToUint8Array('aGk'))).toEqual([104, 105])
  })

  test('translates the URL-safe alphabet back to standard base64', () => {
    // "-_" maps to "+/" — the two characters that differ between alphabets.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })
})

describe('describeDevice', () => {
  test('labels an Android phone', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe('Chrome on Android')
  })

  test('labels an iPhone', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605')).toBe(
      'Safari on iPhone',
    )
  })

  test('falls back to a generic label for anything else', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBe('Chrome on desktop')
  })
})

describe('isUniqueViolation', () => {
  test('recognizes the Postgres unique_violation SQLSTATE code', () => {
    expect(isUniqueViolation({ code: '23505', message: 'anything' })).toBe(true)
  })

  test('falls back to matching the duplicate-key message text when no code is present', () => {
    expect(
      isUniqueViolation({
        message: 'duplicate key value violates unique constraint "push_subscriptions_endpoint_key"',
      }),
    ).toBe(true)
  })

  test('does not match an unrelated Postgres error code', () => {
    expect(isUniqueViolation({ code: '23503', message: 'foreign key violation' })).toBe(false)
  })

  test('does not match a transient/offline error', () => {
    expect(isUniqueViolation({ message: 'Failed to fetch' })).toBe(false)
  })

  test('does not match a plain network TypeError', () => {
    expect(isUniqueViolation(new TypeError('Failed to fetch'))).toBe(false)
  })

  test('handles null, undefined, and non-object errors safely', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('some string error')).toBe(false)
  })
})

describe('withTimeout', () => {
  test('resolves with the underlying value when it settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('done'), 50)).resolves.toBe('done')
  })

  test('rejects with the underlying reason when it rejects before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
  })

  test('rejects with a timeout error when the promise never settles in time', async () => {
    const neverSettles = new Promise(() => {})
    await expect(withTimeout(neverSettles, 10)).rejects.toThrow('Timed out after 10ms')
  })

  test('does not leave a pending timer that fires after the promise already won the race', async () => {
    // If the timer weren't cleared, this would still resolve fine here, but a
    // stray timer could otherwise fire later and (in a real caller) trigger
    // an unhandled-rejection warning after the fact. Waiting past the
    // timeout window confirms nothing unexpected happens once the winning
    // branch has already settled.
    await expect(withTimeout(Promise.resolve('fast'), 10)).resolves.toBe('fast')
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
})
