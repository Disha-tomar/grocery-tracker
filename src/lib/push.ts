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
  if (!existing) return 'disabled'

  // A browser subscription can outlive the account that created it (a sign-out
  // that didn't unsubscribe, a different account signing in on the same
  // browser). Confirm the current user actually owns a matching row before
  // reporting 'enabled', so the toggle never claims success for a subscription
  // nobody is receiving notifications through.
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return 'disabled'
  const { data: row } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', existing.endpoint)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  return row ? 'enabled' : 'disabled'
}

async function subscribeFresh(
  registration: ServiceWorkerRegistration,
  stale?: PushSubscription,
): Promise<PushSubscription> {
  if (stale) await stale.unsubscribe()
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
  })
}

function subscriptionRow(subscription: PushSubscription, userId: string) {
  const json = subscription.toJSON()
  return {
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    device_label: describeDevice(navigator.userAgent),
  }
}

export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const registration = await navigator.serviceWorker.ready
  let subscription =
    (await registration.pushManager.getSubscription()) ?? (await subscribeFresh(registration))

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return 'denied'
  const userId = userData.user.id

  // Upsert on endpoint: re-enrolling the same browser refreshes the keys
  // instead of leaving a duplicate row behind.
  let { error } = await supabase
    .from('push_subscriptions')
    .upsert(subscriptionRow(subscription, userId), { onConflict: 'endpoint' })

  if (error) {
    // The browser's existing subscription can still be owned by a different
    // account that previously enrolled on this device (sign-out doesn't
    // unsubscribe). RLS hides that row from us, so ON CONFLICT DO UPDATE
    // raises instead of updating. Unsubscribing and resubscribing gets a
    // fresh endpoint that no other account's row can collide with, so this
    // self-heals without ever requiring the user to clear site data.
    subscription = await subscribeFresh(registration, subscription)
    ;({ error } = await supabase
      .from('push_subscriptions')
      .upsert(subscriptionRow(subscription, userId), { onConflict: 'endpoint' }))
    if (error) throw error
  }
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
      .then(({ data, error }) => {
        // invoke() only REJECTS on a transport failure; a non-2xx response
        // (function not deployed, vapid_not_configured, item_lookup_failed)
        // RESOLVES with this error field instead, so it must be checked here
        // too. Logging only — the flag is already saved, so this must never
        // surface as a UI error.
        if (error) console.warn('Could not notify the household', error, data)
      })
      .catch((err) => console.warn('Could not notify the household', err))
  } catch (err) {
    console.warn('Could not notify the household', err)
  }
}
