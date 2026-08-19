# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a household member flags an item as needed, every other member's phone receives a push notification, even with the app closed.

**Architecture:** The client fires a Supabase Edge Function after setting the `needed` flag. The function re-reads the item as the calling user (so RLS provides authorization), then uses the service-role key to fan out Web Push messages to housemates' stored subscriptions. A hand-written service worker displays the notification and routes taps to the shopping list.

**Tech Stack:** React 19 + Vite 8 + TypeScript, Supabase (Postgres, Auth, Edge Functions/Deno), `vite-plugin-pwa` in `injectManifest` mode, Workbox, `web-push`, vitest.

**Spec:** [`docs/superpowers/specs/2026-08-19-push-notifications-design.md`](../specs/2026-08-19-push-notifications-design.md)

## Global Constraints

- Notifications fire **only** for manual `needed` flags — never for automatic low-stock threshold drops.
- No email or WhatsApp fallback. Push is the only channel.
- The service-role key must never appear in client code, `.env` with a `VITE_` prefix, or any committed file.
- `VAPID_PRIVATE_KEY` lives only as a Supabase Edge Function secret.
- The requester must never be notified of their own request.
- Notification failures must never surface as UI errors — the flag has already saved.
- Existing offline behaviour (precaching, `navigateFallback: 'index.html'`) must survive the service-worker rewrite.
- Existing test suite is 27 passing tests; every task ends with the full suite green.
- Currency is AED; dates are `en-IN`. Copy is warm and kawaii, matching "Peachy" the mascot.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/003_push_subscriptions.sql` | Subscriptions table + RLS |
| `supabase/functions/_shared/notification.ts` | Pure payload/prune logic, shared by Deno and vitest |
| `supabase/functions/_shared/notification.test.ts` | Tests for the above |
| `supabase/functions/notify-need/index.ts` | The Edge Function |
| `src/sw.ts` | Service worker: precache + push + notificationclick |
| `tsconfig.worker.json` | WebWorker types for `src/sw.ts` |
| `src/lib/push.ts` | Browser enrolment: support check, subscribe, unsubscribe |
| `src/lib/push.test.ts` | Tests for the pure parts of the above |
| `src/screens/SettingsScreen.tsx` | The on/off toggle |
| `src/screens/LowScreen.tsx` | Call sites after flagging |
| `vite.config.ts` | `injectManifest` mode, vitest include path |
| `.env.example`, `README.md` | Setup documentation |

---

### Task 1: Subscriptions table

**Files:**
- Create: `supabase/migrations/003_push_subscriptions.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: table `public.push_subscriptions` with columns `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `device_label`, `created_at`; TypeScript type `PushSubscriptionRow`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/003_push_subscriptions.sql`:

```sql
-- Pantry Pal — Web Push subscriptions
-- Run this in the Supabase SQL editor BEFORE deploying the matching build.

-- One row per device: a person may use both a phone and a laptop, and each
-- browser hands out its own endpoint.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- An endpoint is a capability to push to someone's device, so nobody may read
-- anyone else's row. The Edge Function fans out with the service-role key.
create policy "manage own subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Run the migration**

Paste the whole file into the Supabase dashboard → SQL Editor → Run.

- [ ] **Step 3: Verify the table exists**

Run from the repo root (Git Bash):

```bash
set -a && . ./.env && set +a
curl -s -o /dev/null -w "%{http_code}\n" \
  "$VITE_SUPABASE_URL/rest/v1/push_subscriptions?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```

Expected: `200`. A `404` with `PGRST205` means the migration did not run.

- [ ] **Step 4: Add the TypeScript type**

In `src/lib/types.ts`, after the `Purchase` interface:

```ts
export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  device_label: string
  created_at: string
}
```

- [ ] **Step 5: Verify the build still passes**

Run: `npm run build`
Expected: `✓ built`, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/003_push_subscriptions.sql src/lib/types.ts
git commit -m "Add push_subscriptions table for Web Push devices"
```

---

### Task 2: Shared notification logic

Pure functions with no DOM and no Deno APIs, so the same file runs inside the Edge Function and under vitest. This is why it lives in `_shared/` rather than `src/` — Supabase bundles `_shared` with the function, and reaching up into `src/` from a Deno function is fragile.

**Files:**
- Create: `supabase/functions/_shared/notification.ts`
- Test: `supabase/functions/_shared/notification.test.ts`
- Modify: `vite.config.ts` (vitest `include`)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface NeedNotification { title: string; body: string; tag: string; url: string }`
  - `buildNeedNotification(requesterName: string, itemName: string, householdName: string, itemId: string): NeedNotification`
  - `shouldPruneSubscription(status: number): boolean`

- [ ] **Step 1: Point vitest at the shared folder**

In `vite.config.ts`, replace the `test` block:

```ts
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
```

- [ ] **Step 2: Write the failing test**

Create `supabase/functions/_shared/notification.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./notification"`.

- [ ] **Step 4: Write the implementation**

Create `supabase/functions/_shared/notification.ts`:

```ts
export interface NeedNotification {
  title: string
  body: string
  tag: string
  url: string
}

/** What the family sees on the lock screen when someone asks for something. */
export function buildNeedNotification(
  requesterName: string,
  itemName: string,
  householdName: string,
  itemId: string,
): NeedNotification {
  const who = requesterName.trim() || 'Someone'
  return {
    title: `${who} needs ${itemName} 🙋`,
    body: householdName,
    // One notification per item: asking twice replaces rather than stacks.
    tag: `need-${itemId}`,
    url: '/low',
  }
}

/**
 * 404 and 410 mean the push service has permanently dropped this endpoint —
 * the device is gone. Anything else may succeed on a later request.
 */
export function shouldPruneSubscription(status: number): boolean {
  return status === 404 || status === 410
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 33 tests (27 existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared vite.config.ts
git commit -m "Add shared push notification payload and prune logic"
```

---

### Task 3: Service worker

The highest-risk task. `vite-plugin-pwa` currently generates the worker; after this it is hand-written, and precaching plus navigation fallback become our responsibility. **Do not proceed to Task 4 until Step 8 confirms offline loading still works.**

**Files:**
- Create: `src/sw.ts`, `tsconfig.worker.json`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `package.json`

**Interfaces:**
- Consumes: `NeedNotification` shape from Task 2 (as the JSON push payload)
- Produces: a service worker that displays notifications and routes clicks to `data.url`

- [ ] **Step 1: Install the Workbox packages**

Run: `npm install -D workbox-precaching workbox-routing workbox-core`

These are needed because we now import Workbox directly instead of letting the plugin generate calls to it.

- [ ] **Step 2: Write the service worker**

Create `src/sw.ts`:

```ts
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import type { NeedNotification } from '../supabase/functions/_shared/notification'

declare const self: ServiceWorkerGlobalScope

// Replaced at build time with the list of files to precache. Keeps the
// offline behaviour that generateSW used to provide for us.
precacheAndRoute(self.__WB_MANIFEST)

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
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: payload.url },
    }),
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
          void client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
```

- [ ] **Step 3: Give the worker its own TypeScript project**

The app config targets the DOM; a service worker needs WebWorker types. Create `tsconfig.worker.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.worker.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "WebWorker"],
    "module": "esnext",
    "types": ["vite/client", "vite-plugin-pwa/client"],
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/sw.ts", "supabase/functions/_shared/notification.ts"]
}
```

- [ ] **Step 4: Wire the new project in and exclude the worker from the app project**

In `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.worker.json" }
  ]
}
```

In `tsconfig.app.json`, add an `exclude` alongside the existing `include`:

```json
  "include": ["src"],
  "exclude": ["src/sw.ts"]
```

- [ ] **Step 5: Switch the plugin to injectManifest**

In `vite.config.ts`, replace the `VitePWA({ ... })` call's `registerType` line and `workbox` block. The full plugin config becomes:

```ts
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      manifest: {
        name: 'Pantry Pal',
        short_name: 'Pantry Pal',
        description: "Your home's cute little pantry brain 🥕",
        theme_color: '#FFF8F2',
        background_color: '#FFF8F2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
```

Note the `workbox` key is gone — that option only applies to `generateSW`. `injectManifest` replaces it.

- [ ] **Step 6: Build and confirm the worker contains our code**

Run: `npm run build`
Expected: `✓ built`, and the PWA output lists `dist/sw.js`.

Then run:

```bash
grep -c "notificationclick" dist/sw.js
```

Expected: `1` or more. `0` means the plugin generated its own worker instead of using ours — re-check `strategies`, `srcDir`, and `filename`.

- [ ] **Step 7: Confirm precaching survived**

```bash
grep -c "precacheAndRoute\|self.__WB_MANIFEST" dist/sw.js
```

Expected: at least `1`, and the build output should still report a precache entry count similar to before (~43 entries).

- [ ] **Step 8: Manually verify offline loading — do not skip**

```bash
npm run build && npm run preview
```

In desktop Chrome at the preview URL:
1. DevTools → Application → Service Workers: the worker is **activated and running**
2. DevTools → Network → set to **Offline**, reload the page
3. Expected: the app still loads (this is the behaviour `generateSW` provided; if it fails, stop and fix before continuing)
4. Application → Storage → Cache Storage: a `workbox-precache` entry exists

- [ ] **Step 9: Commit**

```bash
git add src/sw.ts tsconfig.worker.json tsconfig.json tsconfig.app.json vite.config.ts package.json package-lock.json
git commit -m "Hand-write the service worker so it can receive push events"
```

---

### Task 4: Browser enrolment

**Files:**
- Create: `src/lib/push.ts`, `src/lib/push.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `PushSubscriptionRow` (Task 1), the `push_subscriptions` table
- Produces:
  - `isPushSupported(): boolean`
  - `urlBase64ToUint8Array(base64: string): Uint8Array`
  - `describeDevice(userAgent: string): string`
  - `enablePush(): Promise<'enabled' | 'denied' | 'unsupported'>`
  - `disablePush(): Promise<void>`
  - `getPushState(): Promise<'enabled' | 'disabled' | 'denied' | 'unsupported'>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/push.test.ts`. Only the pure helpers are tested — `enablePush` needs a real browser and is verified by hand in Task 7.

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./push"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/push.ts`:

```ts
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
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
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
  void supabase.functions
    .invoke('notify-need', { body: { itemId } })
    .catch((err) => console.warn('Could not notify the household', err))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 38 tests (33 + 5 new).

- [ ] **Step 5: Document the new environment variable**

Replace `.env.example` with:

```
# Copy to .env and fill in from your Supabase project:
# Dashboard → Project Settings → API
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY

# Web Push. Generate a pair with:  npx web-push generate-vapid-keys
# The public key is safe in the bundle. The PRIVATE key goes only into
# Supabase → Edge Functions → Secrets, never into this file or git.
VITE_VAPID_PUBLIC_KEY=YOUR-VAPID-PUBLIC-KEY
```

- [ ] **Step 6: Verify build and tests**

Run: `npm run build && npm test`
Expected: `✓ built` and 38 passing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/push.ts src/lib/push.test.ts .env.example
git commit -m "Add browser push enrolment and household notify helper"
```

---

### Task 5: Settings toggle

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `getPushState`, `enablePush`, `disablePush`, `PushState` (Task 4)
- Produces: user-facing enrolment UI

- [ ] **Step 1: Read the existing screen**

Run: `cat src/screens/SettingsScreen.tsx`

Note the existing `isIos` and `isStandalone` constants and the "Install on your iPhone" section — the new block sits directly above the sign-out button and reuses those flags.

- [ ] **Step 2: Add the imports**

At the top of `src/screens/SettingsScreen.tsx`:

```ts
import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push'
```

If `useState` or `useEffect` is already imported from `react`, merge rather than duplicating the import.

- [ ] **Step 3: Add the state hook inside the component**

Immediately after the existing `const signOut = useInvalidateOnSignOut()` line:

```ts
  const [pushState, setPushState] = useState<PushState>('unsupported')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    void getPushState().then(setPushState)
  }, [])

  const togglePush = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'enabled') {
        await disablePush()
        setPushState('disabled')
      } else {
        setPushState(await enablePush())
      }
    } finally {
      setPushBusy(false)
    }
  }
```

- [ ] **Step 4: Add the UI block**

Directly above the sign-out `<button>` at the end of the returned JSX:

```tsx
      <section className="mb-5 rounded-blob bg-white p-4 shadow-puff">
        <h2 className="mb-1 font-display font-bold">Nudges 🙋</h2>
        {pushState === 'unsupported' ? (
          <p className="text-sm text-ink-soft">
            {isIos && !isStandalone
              ? 'Add Pantry Pal to your Home Screen first — iPhones only allow notifications for installed apps.'
              : 'This browser can’t do notifications. Try Chrome on Android, or install the app.'}
          </p>
        ) : pushState === 'denied' ? (
          <p className="text-sm text-ink-soft">
            Notifications are blocked for Pantry Pal. Turn them back on in your browser’s site
            settings, then reopen this page.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-soft">
              Get a nudge when someone in your home needs something.
            </p>
            <button
              type="button"
              onClick={togglePush}
              disabled={pushBusy}
              className={`w-full rounded-2xl py-3 font-display font-bold shadow-puff transition-transform active:scale-95 disabled:opacity-40 ${
                pushState === 'enabled' ? 'bg-mint text-white' : 'bg-butter-soft'
              }`}
            >
              {pushBusy
                ? 'One sec…'
                : pushState === 'enabled'
                  ? 'Nudges are on ✓'
                  : 'Turn on nudges 🔔'}
            </button>
          </>
        )}
      </section>
```

- [ ] **Step 5: Verify build and tests**

Run: `npm run lint && npm run build && npm test`
Expected: lint clean, `✓ built`, 38 passing.

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "Add a notifications toggle to Settings"
```

---

### Task 6: The Edge Function

**Files:**
- Create: `supabase/functions/notify-need/index.ts`

**Interfaces:**
- Consumes: `buildNeedNotification`, `shouldPruneSubscription` (Task 2); `push_subscriptions` (Task 1)
- Produces: HTTP endpoint `notify-need` accepting `{ itemId: string }`, returning `{ sent, pruned, failed }`

- [ ] **Step 1: Write the function**

Create `supabase/functions/notify-need/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import {
  buildNeedNotification,
  shouldPruneSubscription,
} from '../_shared/notification.ts'

// supabase-js calls this from the browser, so preflight must be answered.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) {
    // Loud rather than silent: a missing secret otherwise looks like "no devices".
    return json({ error: 'vapid_keys_not_configured' }, 500)
  }
  webpush.setVapidDetails('mailto:pantry-pal@example.com', publicKey, privateKey)

  const { itemId } = (await req.json()) as { itemId?: string }
  if (!itemId) return json({ error: 'item_id_required' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!

  // As the caller: RLS decides whether they may see this item, so we need no
  // authorization logic of our own.
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { data: item } = await caller
    .from('items')
    .select('id, name, needed, household_id')
    .eq('id', itemId)
    .maybeSingle()

  // Not visible, gone, or no longer flagged — say nothing rather than invent it.
  if (!item || !item.needed) return json({ sent: 0, pruned: 0, failed: 0, skipped: true })

  const { data: me } = await caller
    .from('profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: household } = await caller
    .from('households')
    .select('name')
    .eq('id', item.household_id)
    .maybeSingle()

  // As the service role: reading other people's rows is the whole job here.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: housemates } = await admin
    .from('profiles')
    .select('user_id')
    .eq('household_id', item.household_id)
    .neq('user_id', user.id)

  const userIds = (housemates ?? []).map((p) => p.user_id)
  if (userIds.length === 0) return json({ sent: 0, pruned: 0, failed: 0 })

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  const payload = JSON.stringify(
    buildNeedNotification(me?.display_name ?? '', item.name, household?.name ?? '', item.id),
  )

  let sent = 0
  let pruned = 0
  let failed = 0

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      sent += 1
    } catch (err) {
      // One dead device must not stop the rest of the family being told.
      const status = (err as { statusCode?: number }).statusCode ?? 0
      if (shouldPruneSubscription(status)) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
        pruned += 1
      } else {
        failed += 1
        console.error('push send failed', status, (err as { body?: string }).body)
      }
    }
  }

  return json({ sent, pruned, failed })
})
```

- [ ] **Step 2: Generate the VAPID keypair**

Run: `npx web-push generate-vapid-keys`

Record both values. The public key goes in `.env` and Vercel; the private key goes only into Supabase secrets.

- [ ] **Step 3: Log in and link the Supabase CLI**

This project has not used the CLI before.

```bash
npx supabase login
npx supabase link --project-ref ejkvfgdzhntowsbzythk
```

- [ ] **Step 4: Set the function secrets**

```bash
npx supabase secrets set VAPID_PUBLIC_KEY="<public key>" VAPID_PRIVATE_KEY="<private key>"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them.

- [ ] **Step 5: Deploy the function**

```bash
npx supabase functions deploy notify-need
```

Expected: a success message and the function appearing under Dashboard → Edge Functions.

- [ ] **Step 6: Verify it rejects unauthenticated calls**

```bash
set -a && . ./.env && set +a
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$VITE_SUPABASE_URL/functions/v1/notify-need" \
  -H "Content-Type: application/json" -d '{"itemId":"none"}'
```

Expected: `401`. Anything else means the auth guard is wrong — fix before continuing.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/notify-need
git commit -m "Add notify-need Edge Function for household push fan-out"
```

---

### Task 7: Wire it up and verify end to end

**Files:**
- Modify: `src/screens/LowScreen.tsx`, `README.md`

**Interfaces:**
- Consumes: `notifyHouseholdOfNeed` (Task 4), the deployed function (Task 6)
- Produces: the complete working feature

- [ ] **Step 1: Import the helper**

In `src/screens/LowScreen.tsx`, add to the imports:

```ts
import { notifyHouseholdOfNeed } from '../lib/push'
```

- [ ] **Step 2: Notify when an existing item is flagged**

In the `LowScreen` component, the `NeedSomethingSheet`'s `onFlag` prop currently reads:

```tsx
        onFlag={(item) => {
          setNeeded.mutate({ itemId: item.id, needed: true })
          setAsking(false)
        }}
```

Replace with:

```tsx
        onFlag={(item) => {
          setNeeded.mutate(
            { itemId: item.id, needed: true },
            { onSuccess: () => notifyHouseholdOfNeed(item.id) },
          )
          setAsking(false)
        }}
```

Notifying inside `onSuccess` matters: if the write failed, nobody should be told about a request that does not exist.

- [ ] **Step 3: Notify when a new needed item is created**

Inside `NeedSomethingSheet`, the `NewItemSheet`'s `onCreated` prop currently reads:

```tsx
        onCreated={() => {
          setCreating(false)
          setSearch('')
          onClose()
        }}
```

Replace with:

```tsx
        onCreated={(item) => {
          notifyHouseholdOfNeed(item.id)
          setCreating(false)
          setSearch('')
          onClose()
        }}
```

- [ ] **Step 4: Verify build and tests**

Run: `npm run lint && npm run build && npm test`
Expected: lint clean, `✓ built`, 38 passing.

- [ ] **Step 5: Add the public key locally and deploy**

Add `VITE_VAPID_PUBLIC_KEY=<public key>` to `.env`, then add the same variable in Vercel → Project → Settings → Environment Variables for Production, Preview and Development.

Then:

```bash
git add src/screens/LowScreen.tsx
git commit -m "Notify the household when someone flags an item as needed"
git push
```

Vercel rebuilds automatically. Because Vite inlines `VITE_*` at build time, the variable must exist in Vercel **before** this deploy — if it was added afterwards, trigger a redeploy.

- [ ] **Step 6: Verify on desktop with two accounts**

1. Sign in as yourself, Settings → **Turn on nudges 🔔**, accept the browser prompt
2. Confirm a row appears: Supabase → Table Editor → `push_subscriptions`
3. In a separate browser profile, sign in as a second household member
4. From the second account, flag an item via **🙋 Need something?**
5. Expected: the first browser shows *"<Name> needs <item> 🙋"*
6. Click it — expected: focuses the app on the shopping list

- [ ] **Step 7: Verify the requester is not notified**

From the first account, flag another item. Expected: **no** notification on that same device. Supabase → Edge Functions → Logs should show `sent` counting only the other member's devices.

- [ ] **Step 8: Verify on phones**

1. Android: install the PWA, turn on nudges, fully close the app, have someone flag an item — expect a notification
2. iPhone: add to Home Screen **first**, open from the icon, turn on nudges, repeat

If the iPhone shows the "Add to Home Screen" copy instead of the toggle, that is correct behaviour for an uninstalled iOS PWA.

- [ ] **Step 9: Update the README**

In `README.md`, add to the "One-time setup" section after the Supabase steps:

```markdown
### Push notifications (optional)

1. Generate keys: `npx web-push generate-vapid-keys`
2. Store the private key in Supabase: `npx supabase secrets set VAPID_PUBLIC_KEY="…" VAPID_PRIVATE_KEY="…"`
3. Deploy the sender: `npx supabase functions deploy notify-need`
4. Put the public key in `.env` and Vercel as `VITE_VAPID_PUBLIC_KEY`
5. Each family member turns them on in **Home → Nudges**

iPhones only allow notifications for apps added to the Home Screen.
```

- [ ] **Step 10: Commit**

```bash
git add README.md
git commit -m "Document push notification setup"
git push
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| Schema + RLS | 1 |
| VAPID keys | 4 (public), 6 (private) |
| Service worker | 3 |
| Client enrolment + Settings toggle | 4, 5 |
| Edge Function | 6 |
| Call sites | 7 |
| Notification content | 2 |
| Error handling: prune 404/410 | 2, 6 |
| Error handling: fire-and-forget invoke | 4 (`notifyHouseholdOfNeed`) |
| Error handling: missing VAPID key | 6 (500 with explicit code) |
| Testing: pure helpers | 2, 4 |
| Testing: manual sequence | 3 step 8, 7 steps 6–8 |
| Rollout order | Tasks are ordered to match: migration → keys → secret → function → app |

No gaps.

**Placeholder scan:** no TBD/TODO; every code step contains complete code; no "similar to Task N" references.

**Type consistency:** `NeedNotification` is defined in Task 2 and consumed by name in Tasks 3 and 6. `PushState` is defined in Task 4 and consumed in Task 5. `notifyHouseholdOfNeed` is defined in Task 4 and consumed in Task 7. `PushSubscriptionRow` is defined in Task 1. Column names (`endpoint`, `p256dh`, `auth`, `device_label`) match across Tasks 1, 4, and 6.
