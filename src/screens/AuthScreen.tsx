import { useState } from 'react'
import { Mascot } from '../components/Mascot'
import { supabase } from '../lib/supabase'

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.5 34.7 26.9 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4 5.6l6.5 5.5C41.4 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  )
}

export function AuthScreen() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'google' | 'email' | 'code'>('google')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const signInAsGuest = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      setBusy(false)
      setError(error.message)
    }
  }

  const signInWithGoogle = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Always offer the account chooser — family members share devices.
        queryParams: { prompt: 'select_account' },
      },
    })
    // On success the browser navigates away; only errors land here.
    if (error) {
      setBusy(false)
      setError(error.message)
    }
  }

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

      {stage === 'google' && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="flex items-center justify-center gap-3 rounded-2xl bg-white py-3.5 font-display text-lg font-bold shadow-puff transition-transform active:scale-95 disabled:opacity-40"
          >
            <GoogleLogo />
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <button
            type="button"
            onClick={() => setStage('email')}
            className="py-1 text-sm font-bold text-ink-soft"
          >
            Use an email code instead
          </button>
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={signInAsGuest}
              disabled={busy}
              className="rounded-2xl border-2 border-dashed border-lavender bg-lavender-soft py-3 font-bold transition-transform active:scale-95 disabled:opacity-40"
            >
              🧪 Skip sign-in (dev guest)
            </button>
          )}
        </div>
      )}

      {stage === 'email' && (
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
          <button
            type="button"
            onClick={() => setStage('google')}
            className="py-1 text-sm font-bold text-ink-soft"
          >
            ← Back to Google sign-in
          </button>
        </div>
      )}

      {stage === 'code' && (
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
