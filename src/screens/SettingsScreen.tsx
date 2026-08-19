import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push'
import { useHouseholdMembers, useInvalidateOnSignOut } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Household, Profile } from '../lib/types'

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)

export function SettingsScreen({
  household,
  profile,
}: {
  household: Household
  profile: Profile
}) {
  const { data: members } = useHouseholdMembers(household.id)
  const signOut = useInvalidateOnSignOut()
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
  const [name, setName] = useState(profile.display_name)
  const [saved, setSaved] = useState(false)

  const saveName = async () => {
    await supabase.from('profiles').update({ display_name: name.trim() }).eq('user_id', profile.user_id)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const shareInvite = async () => {
    const text = `Join our home "${household.name}" on Pantry Pal! 🏡 Invite code: ${household.invite_code} — ${location.origin}`
    if (navigator.share) await navigator.share({ text }).catch(() => {})
    else {
      await navigator.clipboard.writeText(text)
      alert('Invite copied to clipboard!')
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <h1 className="mb-5 font-display text-2xl font-bold">{household.name} 🏡</h1>

      <section className="mb-5 rounded-blob bg-white p-4 shadow-puff">
        <h2 className="mb-2 font-display font-bold">Invite your family 💌</h2>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-2xl bg-butter-soft px-4 py-2 font-mono text-xl font-extrabold tracking-[0.25em]">
            {household.invite_code}
          </span>
          <button
            type="button"
            onClick={shareInvite}
            className="rounded-2xl bg-peach px-4 py-2.5 font-bold text-white shadow-puff active:scale-90"
          >
            Share
          </button>
        </div>
      </section>

      <section className="mb-5 rounded-blob bg-white p-4 shadow-puff">
        <h2 className="mb-2 font-display font-bold">Who’s home 👨‍👩‍👧</h2>
        <div className="flex flex-wrap gap-2">
          {(members ?? []).map((m) => (
            <span key={m.user_id} className="rounded-full bg-lavender-soft px-3.5 py-1.5 font-bold">
              {m.display_name || 'Someone'} {m.user_id === profile.user_id && '(you)'}
            </span>
          ))}
        </div>
      </section>

      <section className="mb-5 rounded-blob bg-white p-4 shadow-puff">
        <h2 className="mb-2 font-display font-bold">Your name ✏️</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-2xl border-2 border-peach-soft px-4 py-2.5 font-bold outline-none focus:border-peach"
          />
          <button
            type="button"
            onClick={saveName}
            className="rounded-2xl bg-mint px-4 py-2.5 font-bold text-white shadow-puff active:scale-90"
          >
            {saved ? '✓' : 'Save'}
          </button>
        </div>
      </section>

      {isIos && !isStandalone && (
        <section className="mb-5 rounded-blob bg-butter-soft p-4 shadow-puff">
          <h2 className="mb-1 font-display font-bold">Install on your iPhone 📱</h2>
          <p className="text-sm">
            Tap the <strong>Share</strong> button in Safari, then <strong>“Add to Home Screen”</strong> —
            Pantry Pal will feel just like a real app!
          </p>
        </section>
      )}

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

      <button type="button" onClick={signOut} className="w-full py-2 text-sm font-bold text-berry">
        Sign out
      </button>
    </div>
  )
}
