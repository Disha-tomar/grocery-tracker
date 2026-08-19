# Push notifications for "we need this" requests

**Status:** approved design, not yet implemented
**Date:** 2026-08-19

## Goal

When someone taps "🙋 Need something?" and flags an item, the other members of
their household get a push notification on their phones — even when the app is
closed.

Pantry Pal already syncs the shopping list live between devices via Supabase
realtime, but only while the app is open. Push is what makes a request reach
someone who isn't looking at their phone.

## Decisions

| Decision | Rationale |
| --- | --- |
| Notify **only on manual requests**, never on automatic threshold drops | A request is a message from a person; a quantity crossing a threshold is not. Restocking after a grocery run would otherwise fire a burst of notifications at everyone, and people mute apps that do that. |
| **Push only** — no email or WhatsApp fallback | Keeps one delivery path. Accepted cost: an iPhone user who never installs the PWA silently receives nothing. Mitigated by an explicit in-app explanation, not by a second channel. |
| **Client invokes the Edge Function** after flagging | Fewest moving parts, all config in git, and function logs make failures visible. See "Rejected alternatives". |
| Store subscriptions **per device**, not per user | One person may use a phone and a laptop; each browser has its own endpoint. |
| No `household_id` on subscriptions | It would go stale when someone joins a different household. Fan-out joins through `profiles`, the existing source of truth. |

### Rejected alternatives

**Postgres trigger → `pg_net` → Edge Function.** Guarantees delivery regardless
of what the client does, and would also cover flags set outside the app (SQL
editor, or a future dish auto-deduction feature). Rejected *for now* as harder
to debug and requiring the `pg_net` extension plus service credentials in
database config. This is the better architecture if missed notifications ever
become a real problem — switching later replaces the trigger without touching
the Edge Function or the client.

**Supabase Database Webhooks.** Equivalent to the trigger approach but
configured in the dashboard, so the configuration lives nowhere in git.
Rejected on those grounds specifically: this project has already lost time to
settings that existed only in a dashboard.

## Architecture

```
LowScreen: user flags an item
      │
      ├─ 1. UPDATE items SET needed = true        (existing setNeeded mutation)
      │
      └─ 2. supabase.functions.invoke('notify-need', { itemId })   fire-and-forget
                  │
                  ▼
         Edge Function notify-need
                  │
                  ├─ reads the item AS THE CALLER  → RLS proves they may touch it
                  ├─ confirms item.needed === true → a stale call can't invent one
                  ├─ service-role: profiles in that household, minus the requester
                  ├─ service-role: their push_subscriptions
                  └─ web-push to each endpoint; delete any returning 404 / 410
                                    │
                                    ▼
                         Service worker `push` handler
                                    │
                         showNotification → tap → /low
```

## Schema

New migration `supabase/migrations/003_push_subscriptions.sql`:

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text not null default '',
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "manage own subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

A push endpoint is effectively a capability to send notifications to that
device, so no policy grants read access to anyone else's row. The Edge
Function reads across users with the service-role key, which bypasses RLS —
this is precisely why that key must never reach the client bundle.

`endpoint` is unique so re-enrolling the same browser updates rather than
duplicates (upsert on conflict).

## VAPID keys

Generated once with `npx web-push generate-vapid-keys`.

| Key | Where it lives | In git? |
| --- | --- | --- |
| Public | `VITE_VAPID_PUBLIC_KEY` in `.env` and Vercel env vars | No (`.env` is gitignored); it is safe to expose in the bundle |
| Private | Supabase Edge Function secret `VAPID_PRIVATE_KEY` | Never |

`.env.example` gains the public key placeholder and a pointer to the generate
command.

## Service worker

`vite-plugin-pwa` moves from `generateSW` to `injectManifest` mode, with a
hand-written `src/sw.ts`.

**This is the highest-risk change in the design.** Precaching and
`navigateFallback: 'index.html'` are currently generated automatically; under
`injectManifest` they become our responsibility. A broken service worker can
leave installed phones serving a stale or non-functional app — worse than
having no notifications at all.

`src/sw.ts` must:

1. `precacheAndRoute(self.__WB_MANIFEST)` — preserve today's offline behaviour
2. Register a `NavigationRoute` fallback to `index.html`, replacing the
   `navigateFallback` option
3. Handle `push`: parse the JSON payload, `showNotification(title, { body, tag,
   data, icon })`
4. Handle `notificationclick`: focus an already-open client if one exists,
   otherwise `clients.openWindow(data.url)`

`registerType: 'autoUpdate'` stays, so a fixed worker propagates without users
reinstalling.

## Client

**`src/lib/push.ts`**

- `isPushSupported()` — `'serviceWorker' in navigator && 'PushManager' in window`
- `enablePush()` — request permission, `pushManager.subscribe({ userVisibleOnly:
  true, applicationServerKey })`, upsert the row
- `disablePush()` — `subscription.unsubscribe()`, delete the row
- `buildNeedNotification(requesterName, itemName)` — pure, unit-tested
- `shouldPruneSubscription(status)` — pure, unit-tested (true for 404 and 410)

**Settings screen** gains a toggle: *"Tell me when someone needs something 🙋"*.

Permission is requested from that tap and never on page load — an unprompted
permission dialog is the fastest way to get permanently denied.

[`SettingsScreen.tsx`](../../../src/screens/SettingsScreen.tsx) already computes
`isIos` and `isStandalone` for its install hint. iPhone users who have not
installed the PWA see that existing hint in place of the toggle, since Web Push
on iOS requires a home-screen install. Browsers without push support see
nothing.

**Call sites** in [`LowScreen.tsx`](../../../src/screens/LowScreen.tsx), after
both paths that set the flag: flagging an existing item, and creating a new item
already flagged.

The invocation is fire-and-forget: errors are logged, never surfaced. The
request itself has already been saved, and failing to notify must not look like
a failure to save.

## Edge Function

`supabase/functions/notify-need/index.ts` (Deno, `npm:web-push`).

1. Reject non-POST, and requests without an `Authorization` header
2. Client A — anon key + the caller's JWT — reads the item by id. RLS means a
   caller who may not see that item gets nothing back, so authorization needs no
   bespoke logic
3. Return early if the item is missing or `needed` is false
4. Read the caller's `display_name` from `profiles`
5. Client B — service-role key — selects housemates
   (`household_id = item.household_id`, `user_id != caller`) and their
   `push_subscriptions`
6. Send to each endpoint, isolating failures so one dead device cannot abort
   the rest
7. Delete subscriptions whose send returned 404 or 410 — the only mechanism
   that prunes dead devices
8. Return a summary (`{ sent, pruned, failed }`) for log readability

**Notification content**

- Title: `Disha needs paneer 🙋`
- Body: the household name, e.g. `Tomar House`
- `tag: need-<itemId>` so re-flagging the same item replaces rather than stacks
- `data.url: /low`

## Error handling

| Failure | Behaviour |
| --- | --- |
| Function invocation fails or times out | Logged in console; UI unaffected; item stays flagged |
| Permission denied by the user | Toggle reflects the real state; no retry loop; explanatory copy in Settings |
| Subscription expired (404/410) | Row deleted; that device stops being attempted |
| Individual push send fails otherwise | Logged, other recipients still receive |
| `VAPID_PRIVATE_KEY` missing | Function returns 500 with an explicit message rather than failing silently |

## Testing

Push cannot be meaningfully unit-tested in this project. What is testable is
extracted and covered with vitest alongside the existing 27 tests:

- `buildNeedNotification` — title and body from requester and item name
- `shouldPruneSubscription` — 404 and 410 prune; 429 and 500 do not

Everything else is verified by hand, in this order:

1. Desktop Chrome: service worker registers, precaching intact, app still loads
   offline — **before** any phone is involved
2. Desktop Chrome: enrol, flag an item from a second account, confirm delivery
3. Android: install, enrol, confirm delivery with the app fully closed
4. iPhone: install to Home Screen, enrol, confirm delivery
5. Confirm the requester does **not** notify themselves

## Rollout

New tooling: Edge Functions require the **Supabase CLI**, which this project
has not used before (`npx supabase login`, `npx supabase link`, `npx supabase
functions deploy notify-need`).

Order matters:

1. Run migration `003` in the SQL editor
2. Generate the VAPID keypair
3. Set `VAPID_PRIVATE_KEY` as an Edge Function secret
4. Deploy the function
5. Add `VITE_VAPID_PUBLIC_KEY` to `.env` and to Vercel
6. Deploy the app

Deploying the app before step 3 leaves a toggle that enrols devices which never
receive anything.

## Out of scope

- Notifications for automatic low-stock drops (the Milestone 2 daily digest
  remains a separate, later piece of work)
- Per-item or per-person notification preferences beyond a single on/off toggle
- Any non-push channel (email, WhatsApp)
- Notifying on other events: purchases logged, items deleted, members joining

## Open risk

The service-worker rewrite touches behaviour that currently works correctly.
If verification step 1 shows any regression in offline loading or precaching,
stop and reconsider rather than pressing on — an app that fails to load is a
worse outcome than an app without notifications.
