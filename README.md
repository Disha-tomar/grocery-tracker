# Pantry Pal 🧺

Your home's cute little pantry brain — a shared-household PWA that tracks groceries and home essentials: what you have, when you last bought it, how much it cost, and what's running low.

**Milestone 1** (this build): shared inventory, quick purchase logging, restock checklist, purchase history, Running Low shelf, live family sync, installable on Android & iPhone.

**Milestone 2** (planned): dishes with auto-deduction ("cooked matar paneer" → paneer & matar reduce) and a daily low-stock push digest.

## One-time setup

### 1. Supabase (free)

1. Create a project at [supabase.com](https://supabase.com) (any name, e.g. `pantry-pal`).
2. In the dashboard, open **SQL Editor** → paste and run the whole of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
3. Sign-in uses **Google** (recommended): in Google Cloud Console create an OAuth client (Web application) with redirect URI `https://YOUR-PROJECT.supabase.co/auth/v1/callback`, then paste the client ID + secret into Supabase **Authentication → Sign In / Providers → Google**. (Fallback: 6-digit email codes work too, but editing their email template requires custom SMTP.)
4. Copy **Project Settings → API → Project URL** and **anon public key**.

### 2. Local env

```bash
cp .env.example .env   # then paste your URL + anon key
npm install
npm run dev
```

### 3. Deploy (Vercel, free)

1. Push this repo to GitHub, import it in [vercel.com](https://vercel.com).
2. Add the two `VITE_SUPABASE_*` env vars in Vercel project settings.
3. Framework preset: **Vite**. Deploy.
4. In Supabase **Authentication → URL Configuration**, set your Vercel URL as the Site URL.

### Push notifications (optional)

1. Generate keys: `npx web-push generate-vapid-keys`
2. Store the keys in Supabase: `npx supabase secrets set VAPID_PUBLIC_KEY="…" VAPID_PRIVATE_KEY="…" VAPID_SUBJECT="mailto:you@example.com"` — `VAPID_SUBJECT` is a contact address (a `mailto:` or `https:` URL) that push services use to reach the operator if there's a problem; the function fails to start without it.
3. Deploy the sender: `npx supabase functions deploy notify-need`
4. Put the public key in `.env` and Vercel as `VITE_VAPID_PUBLIC_KEY`
5. Each family member turns them on in **Home → Nudges**

iPhones only allow notifications for apps added to the Home Screen.

### 4. Install on phones

- **Android (Chrome):** open the site → menu → *Add to Home screen* (or the install banner).
- **iPhone (Safari):** open the site → Share → *Add to Home Screen*.

First person signs in, creates the home, then shares the 6-letter invite code (Settings tab) with family.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check + production build (PWA assets included) |
| `npm test` | Unit tests (vitest) |
| `npm run lint` | Lint (oxlint) |

## Stack

React 19 + Vite + TypeScript · Tailwind CSS v4 · TanStack Query · Supabase (Postgres, Auth, Realtime, RLS) · vite-plugin-pwa · framer-motion
