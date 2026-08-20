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
