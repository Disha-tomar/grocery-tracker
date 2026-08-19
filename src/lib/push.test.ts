import { describe, expect, test } from 'vitest'
import { describeDevice, urlBase64ToUint8Array } from './push'

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
