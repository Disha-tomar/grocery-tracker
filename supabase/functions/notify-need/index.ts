import { createClient } from 'jsr:@supabase/supabase-js@2.110.5'
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

  // Everything below can throw (malformed JSON, a missing env var we forgot to
  // guard, an unexpected client error). Without this boundary an uncaught
  // throw becomes a platform 500 with no CORS headers, which the browser
  // reports as a CORS failure instead of the real error.
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT')
    if (!publicKey || !privateKey || !subject) {
      // Loud rather than silent: a missing secret otherwise looks like "no devices".
      // VAPID_SUBJECT must be a real mailto:/https: contact — some push services
      // (notably Apple's) validate it and silently reject sends otherwise, and a
      // placeholder address must never be hardcoded into a public repo.
      return json({ error: 'vapid_not_configured' }, 500)
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)

    let itemId: string | undefined
    try {
      ;({ itemId } = (await req.json()) as { itemId?: string })
    } catch {
      return json({ error: 'invalid_json_body' }, 400)
    }
    if (!itemId) return json({ error: 'item_id_required' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'supabase_env_not_configured' }, 500)
    }

    // Extract the bearer token explicitly and pass it to getUser(token) rather
    // than relying on supabase-js's internal fallback that sniffs it back out
    // of the client's own headers. That fallback is the only thing standing
    // between a forged service-role Authorization header and this check, so
    // it must not depend on undocumented internal behavior.
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    // As the caller: RLS decides whether they may see this item, so we need no
    // authorization logic of our own.
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser(token)
    if (userError || !user) return json({ error: 'unauthorized' }, 401)

    const { data: item, error: itemError } = await caller
      .from('items')
      .select('id, name, needed, household_id')
      .eq('id', itemId)
      .maybeSingle()

    // A genuine query failure must be loud — 200-with-zeros would be
    // indistinguishable from "nobody to notify" to the fire-and-forget caller.
    // maybeSingle() only errors on a real failure, never on zero matching rows,
    // so this never fires for the legitimate "not visible" case below.
    if (itemError) {
      console.error('notify-need: item lookup failed', itemError)
      return json({ error: 'item_lookup_failed' }, 500)
    }

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
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: housemates, error: housematesError } = await admin
      .from('profiles')
      .select('user_id')
      .eq('household_id', item.household_id)
      .neq('user_id', user.id)

    if (housematesError) {
      console.error('notify-need: housemates lookup failed', housematesError)
      return json({ error: 'housemates_lookup_failed' }, 500)
    }

    const userIds = (housemates ?? []).map((p) => p.user_id)
    // A household with no other members is a legitimate empty result, not a
    // failure — keep returning 200 here.
    if (userIds.length === 0) return json({ sent: 0, pruned: 0, failed: 0 })

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', userIds)

    if (subscriptionsError) {
      console.error('notify-need: subscriptions lookup failed', subscriptionsError)
      return json({ error: 'subscriptions_lookup_failed' }, 500)
    }

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
  } catch (err) {
    console.error('notify-need: unexpected error', err)
    return json({ error: 'internal_error' }, 500)
  }
})
