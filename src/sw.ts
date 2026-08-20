/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import type { NeedNotification } from '../supabase/functions/_shared/notification'

declare const self: ServiceWorkerGlobalScope

// Replaced at build time with the list of files to precache. Keeps the
// offline behaviour that generateSW used to provide for us.
precacheAndRoute(self.__WB_MANIFEST)

// generateSW enabled this by default (cleanupOutdatedCaches: true), right
// after precacheAndRoute; keep it so stale precache entries from earlier
// workbox revisions get removed on update.
cleanupOutdatedCaches()

// Single-page app: every navigation falls back to index.html, replacing the
// old `navigateFallback` option.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: NeedNotification
  try {
    payload = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration
      .showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        data: { url: payload.url },
      })
      .catch((err) => console.warn('Could not show notification', err)),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Prefer an app window that is already open over launching a new one.
      for (const client of windows) {
        if ('focus' in client) {
          void (client as WindowClient).navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
