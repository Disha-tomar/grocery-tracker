import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState = 'enabled' | 'disabled' | 'denied' | 'unsupported'

export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  )
}

/** The push API wants raw bytes; VAPID keys travel as URL-safe base64. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const standard = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(standard)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** A human-readable name so a stale subscription can be recognised later. */
export function describeDevice(userAgent: string): string {
  if (/Android/i.test(userAgent)) return 'Chrome on Android'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'Safari on iPhone'
  return 'Chrome on desktop'
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  return existing ? 'enabled' : 'disabled'
}

export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    }))

  const json = subscription.toJSON()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return 'denied'

  // Upsert on endpoint: re-enrolling the same browser refreshes the keys
  // instead of leaving a duplicate row behind.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userData.user.id,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      device_label: describeDevice(navigator.userAgent),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  return 'enabled'
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}

/**
 * Tell the household someone asked for this. Fire-and-forget: the flag is
 * already saved, so a failed notification must never look like a failed save.
 */
export function notifyHouseholdOfNeed(itemId: string): void {
  try {
    void supabase.functions
      .invoke('notify-need', { body: { itemId } })
      .catch((err) => console.warn('Could not notify the household', err))
  } catch (err) {
    console.warn('Could not notify the household', err)
  }
}
