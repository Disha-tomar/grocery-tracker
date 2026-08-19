import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Mascot } from '../components/Mascot'
import { useInvalidateOnSignOut, useSession } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export function HouseholdScreen() {
  const queryClient = useQueryClient()
  const { session } = useSession()
  const signOut = useInvalidateOnSignOut()
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    const { error } =
      mode === 'create'
        ? await supabase.rpc('create_household', {
            household_name: householdName.trim(),
            member_name: name.trim(),
          })
        : await supabase.rpc('join_household', {
            code: inviteCode.trim(),
            member_name: name.trim(),
          })
    setBusy(false)
    if (error) {
      setError(
        error.message.includes('invalid_invite_code')
          ? 'Hmm, that invite code doesn’t match any home.'
          : error.message,
      )
    } else {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    (mode === 'create' ? householdName.trim().length > 0 : inviteCode.trim().length >= 6)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8">
      <Mascot />
      <h1 className="font-display text-2xl font-bold">Set up your home</h1>

      <div className="flex w-full max-w-sm rounded-2xl bg-butter-soft p-1">
        {(['create', 'join'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-xl py-2 font-bold transition-all ${
              mode === m ? 'bg-white shadow-puff' : 'text-ink-soft'
            }`}
          >
            {m === 'create' ? '✨ New home' : '🔑 Join home'}
          </button>
        ))}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <input
          placeholder="Your name (e.g. Disha)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 font-bold outline-none focus:border-peach"
        />
        {mode === 'create' ? (
          <input
            placeholder="Home name (e.g. Tomar House)"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 font-bold outline-none focus:border-peach"
          />
        ) : (
          <input
            placeholder="6-letter invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 text-center font-extrabold tracking-[0.3em] outline-none focus:border-peach"
          />
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy || !canSubmit}
          className="rounded-2xl bg-peach py-3.5 font-display text-lg font-bold text-white shadow-puff transition-transform active:scale-95 disabled:opacity-40"
        >
          {busy ? 'One sec…' : mode === 'create' ? 'Create our home 🏡' : 'Join the family 🤝'}
        </button>
        {error && <p className="text-center text-sm font-bold text-berry">{error}</p>}
      </div>

      <p className="text-center text-sm text-ink-soft">
        {session?.user.email ? (
          <>
            Signed in as <strong className="font-bold">{session.user.email}</strong>
            <br />
          </>
        ) : null}
        <button type="button" onClick={signOut} className="py-2 font-bold text-berry underline">
          Not you? Sign out
        </button>
      </p>
    </div>
  )
}
