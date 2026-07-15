# Pantry Pal 🧺

Your home's cute little pantry brain — a shared-household PWA that tracks groceries and home essentials: what you have, when you last bought it, how much it cost, and what's running low.

**Milestone 1** (this build): shared inventory, quick purchase logging, restock checklist, purchase history, Running Low shelf, live family sync, installable on Android & iPhone.

**Milestone 2** (planned): dishes with auto-deduction ("cooked matar paneer" → paneer & matar reduce) and a daily low-stock push digest.

## One-time setup

### 1. Supabase (free)

1. Create a project at [supabase.com](https://supabase.com) (any name, e.g. `pantry-pal`).
2. In the dashboard, open **SQL Editor** → paste and run the whole of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
3. In **Authentication → Providers**, make sure **Email** is enabled (the app signs in with 6-digit email codes).
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
