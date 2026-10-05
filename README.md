# Group 13 Hub

A calm, editorial academic operating system for Group 13 law students, built with React, Vite, npm, and Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local
# Add your Supabase URL and browser-safe anon key to .env.local
npm run dev
```

Open `http://localhost:3000`.

On a deployed HTTPS URL, open the site on a phone and choose **Add to Home screen** (Android) or **Share → Add to Home Screen** (iPhone). The webmanifest makes Group 13 Hub install as a standalone app.

## Supabase setup

For a **new, empty Supabase project only**, apply [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor. Do **not** run it on the existing LLB13 production database or blindly apply the legacy migration files. Its live migration history has been separately audited; see [the production audit](docs/supabase-production-audit-2026-10-04.md) before changing the database.

For local development, copy `.env.example` to `.env.local`, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and restart `npm run dev`.

Open the app and choose **Create account** (or visit `/signup`). If email confirmation is enabled in Supabase Auth, confirm the email before signing in. The workspace is private: database access and material uploads require an authenticated Supabase user.

The separate AI/media Edge Functions and server-side provider secrets must also be deployed for podcast audio, image, and video generation. See [Media generation and app installation](docs/media-and-install-setup.md) for ElevenLabs narration, optional Gemini API safeguards, provider secrets, and PWA install instructions.

### Free Kenya Law case search

Deploy `supabase/functions/kenya-law-search` with the Supabase CLI:

```bash
supabase functions deploy kenya-law-search
```

The signed-in Lawyer Agent and Case Law page then search public official Kenya Law judgment links and show the output inline. This free path does not require a Google login or a persistent browser. A private authenticated browser session for a Google account requires a separately hosted secure runtime and should never use credentials embedded in the frontend.

The public cinematic landing page is `/`; prominent sign-in and sign-up screens are available at `/login` and `/signup`. The in-app Help button points users to the major study features.

When both values are present, `src/data/repository.ts` uses Supabase as the only source of truth. Configuration or query errors are shown in the UI; the client no longer falls back to bundled demo data.

The Library accepts either a web link or a file upload and stores uploaded files in the `materials` Supabase Storage bucket.

## Live discussion rooms

Discussion rooms use browser WebRTC for peer-to-peer audio/video and Supabase Realtime Broadcast/Presence for signaling and participant presence. No paid meeting provider is required. Camera and microphone access requires HTTPS in production or `localhost` during development.

## Scripts

```bash
npm run dev
npm run check
npm run build
```
# LLB13
