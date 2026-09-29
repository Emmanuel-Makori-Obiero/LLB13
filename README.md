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

## Supabase setup

1. Create or open your Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor.
3. Copy `.env.example` to `.env.local`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Restart `npm run dev`.

When both values are present, `src/data/repository.ts` uses Supabase as the only source of truth. Configuration or query errors are shown in the UI; the client no longer falls back to bundled demo data.

## Live discussion rooms

Discussion rooms use browser WebRTC for peer-to-peer audio/video and Supabase Realtime Broadcast/Presence for signaling and participant presence. No paid meeting provider is required. Camera and microphone access requires HTTPS in production or `localhost` during development.

## Scripts

```bash
npm run dev
npm run check
npm run build
```
# LLB13
