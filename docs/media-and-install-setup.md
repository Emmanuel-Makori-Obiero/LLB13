# Media generation and app installation

## Why the media buttons may fail

Podcast audio, AI images, and short AI video are server-backed features. Adding the app's frontend files to GitHub does not deploy its Supabase database migrations or Edge Functions. The current app also does not include an automatic GitHub deployment workflow. If an Edge Function is missing, its server secret is absent, or the media database setup has not been applied, the UI cannot save or return a generated file.

The long-form film planner currently saves a film plan and shot list; it does **not** render a long film. Video Studio submits a short clip to public Hugging Face Spaces, whose availability and GPU queue are outside this app's control.

## 1. Set up the database

In the Supabase SQL Editor, use the repository's existing base schema if it has not already been installed. Then apply the migrations in order:

1. `supabase/migrations/001_ai.sql`
2. `supabase/migrations/002-cloud-media.sql`
3. `supabase/migrations/003-video-reliability.sql`
4. `supabase/migrations/004-guided-courses.sql` (for guided syllabi and quizzes)

Do not re-run a destructive setup script merely because media generation fails. If you already have live data or are unsure what has been applied, check the database first or take a backup before making schema changes.

## 2. Deploy the functions

Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/cli), then from the repository root link the correct project and deploy the functions used by this app:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase functions deploy ai
supabase functions deploy generate-audio
supabase functions deploy generate-image
supabase functions deploy generate-video
supabase functions deploy video-status
```

The repository currently documents project ref `chchqsnlcpfujweymwcg`; verify that it is the project you intend to deploy to before using it. Frontend `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in local/hosting environment variables; provider secrets belong only in Supabase Edge Function secrets.

## 3. Configure provider secrets

Use Supabase Dashboard → **Edge Functions → Secrets**, or the Supabase CLI. Never paste provider keys into source code, `.env.local`, GitHub, or chat.

- **AI syllabus, podcast script, and other text tasks:** configure `GEMINI_API_KEY_1` (and optional numbered additional keys) as described in [key rotation](key-rotation.md).
- **Images and the Hugging Face audio fallback:** configure `HF_TOKEN_1` (and optional `HF_TOKEN_2`, `HF_TOKEN_3`). The image function currently uses Hugging Face FLUX.1-schnell, not Gemini.
- **Video:** the app submits jobs to public Hugging Face Spaces; a Hugging Face token may help with authenticated Spaces access, but public GPU queue capacity is not guaranteed.
- **Optional Gemini podcast TTS:** the updated audio function supports multi-speaker `gemini-3.8-flash-tts`, but it is deliberately **off by default**. Set `GEMINI_TTS_ENABLED=true` and configure `GEMINI_API_KEY_1` in Supabase secrets to opt in. If Gemini TTS fails, a configured Hugging Face TTS token is tried as fallback. Google currently lists Gemini 3.8 Flash TTS as free-of-charge on its Free Tier; a key in a paid-tier project can incur charges, and all project quotas still apply. Google's pricing page also says free-tier content may be used to improve its products, so do not send confidential client or personal records on that tier. Check the project's tier and data terms before enabling it.

## 4. Gemini image generation is not a free API fallback

Google's current Gemini image models include `gemini-3.1-flash-image` and `gemini-3.1-flash-lite-image`. As of 2026-10-04, Google's official API pricing tables show **no free API tier** for these image models. They may be usable interactively in Google AI Studio under its own terms, but that does not make the API free for this app. The app therefore keeps its current Hugging Face image route and does not silently switch your Gemini key to a potentially billable image call. See Google's [image-generation guide](https://ai.google.dev/gemini-api/docs/image-generation), [pricing](https://ai.google.dev/gemini-api/docs/pricing), and [billing guide](https://ai.google.dev/gemini-api/docs/billing).

## 5. Install the app

Group 13 Hub is a PWA, not an Android APK or iOS App Store package. Install it from the deployed **HTTPS website**:

- **Android:** open the site in Chrome and use the browser menu → **Install app** or **Add to Home screen**.
- **iPhone/iPad:** open the site in Safari → **Share** → **Add to Home Screen**. iOS does not show the same install prompt as Chrome.
- **Desktop:** use Chrome or Edge's address-bar install icon or browser menu.

The app registers its service worker in production builds, not while running `npm run dev`. Therefore the browser's install prompt may not appear on a local development URL. The exact browser, device, and page URL determine whether the browser offers installation.

## 6. Run and update locally

```bash
npm ci
cp .env.example .env.local
# Put only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm run dev
```

To get the code already pushed to the feature branch:

```bash
git fetch origin
git checkout fix/guided-study-json-output
git pull --ff-only origin fix/guided-study-json-output
npm ci
npm run check
npm run build
```

The branch and open pull request do not change the live website automatically. Merge the pull request, redeploy the frontend from the branch your host uses, and separately apply the database migrations, deploy the Edge Functions, and set Supabase secrets.
