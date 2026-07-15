import { useState } from 'react'
import { Mascot } from '../components/Mascot'
import { supabase } from '../lib/supabase'

export function AuthScreen() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sendCode = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setStage('code')
  }

  const verify = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError('That code didn’t work — double-check and try again?')
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8">
      <Mascot />
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Pantry Pal</h1>
        <p className="mt-1 text-ink-soft">Your home’s cute little pantry brain</p>
      </div>

      {stage === 'email' ? (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 text-center font-bold outline-none focus:border-peach"
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={busy || !email.includes('@')}
            className="rounded-2xl bg-peach py-3.5 font-display text-lg font-bold text-white shadow-puff transition-transform active:scale-95 disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send me a code ✨'}
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-center text-sm text-ink-soft">
            We mailed a 6-digit code to <strong>{email}</strong>
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 text-center text-2xl font-extrabold tracking-[0.4em] outline-none focus:border-peach"
          />
          <button
            type="button"
            onClick={verify}
            disabled={busy || code.trim().length < 6}
            className="rounded-2xl bg-mint py-3.5 font-display text-lg font-bold text-white shadow-puff transition-transform active:scale-95 disabled:opacity-40"
          >
            {busy ? 'Checking…' : 'Let me in 🏡'}
          </button>
          <button type="button" onClick={() => setStage('email')} className="text-sm font-bold text-ink-soft">
            Use a different email
          </button>
        </div>
      )}

      {error && <p className="text-center text-sm font-bold text-berry">{error}</p>}
    </div>
  )
}
