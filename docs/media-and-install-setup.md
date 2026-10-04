# Production setup and media guide

Last checked: **2026-10-04**. This guide reflects the live `LLB13` Supabase project and the current working-tree changes; it does not claim that those changes have already been deployed.

## Current live status

The connected Supabase project `chchqsnlcpfujweymwcg` (`LLB13`, `eu-west-1`) reported **ACTIVE_HEALTHY**. The public app at <https://llb-13.vercel.app/> and its manifest, service worker, and required icons returned HTTP 200 during the audit.

The live project has active `ai` (v26), `generate-audio` (v8), `generate-image` (v7), `generate-video` (v9), and `video-status` (v9) Edge Functions. The deployed function snapshots predate the changes in this branch: the live AI function did not contain the per-stage chain variables, the audio function did not contain ElevenLabs dialogue synthesis, and the image function did not contain the opt-in Gemini fallback. **Active is not the same as up-to-date.** Deploy the relevant functions after reviewing and merging the code.

An aggregate query of the rolling 24-hour function-edge logs at 10:25 EAT found 115 AI responses with status 200 (17.2-second average), 6 AI responses with status 503 (119.9-second average), and 4 AI responses with status 429 (0.6-second average). Audio had one 200 and one 502 response. No image, video-generation, or video-status invocations appeared in that window, so there is no recent request log to diagnose those failures. These were counts and timings only; no prompt or request-body content was read, and the counts do not reveal the exact upstream AI error cause.

At the initial audit the live migration ledger contained **18 applied migrations** through `guided_course_visibility` (`20261003202427`). The approved representative-policy migration has since been recorded as the 19th entry (`20261004084308`, `link_representative_rls_to_user_20261004110000`). The repository still has only a few legacy SQL files with a different naming/history. Do **not** run the old files in sequence or use `supabase db push` blindly. First reconcile the complete remote migration history with the repository. The media and guided-course tables are already present in the live schema, so an audio/image failure is not, by itself, evidence that those tables should be recreated.

A read-only RLS audit found that representative access on meetings and timetable rows had been compared against editable JWT `user_metadata.display_name`. The exact policy correction in `docs/review-only/20261004110000_link_representative_rls_to_user.sql` was explicitly approved and applied to live Supabase on 2026-10-04; its recorded migration version is `20261004084308`. The apply-time preflight confirmed protected `members.user_id` links for all 3 distinct representative names found across the relevant records, and post-apply verification confirmed all four replacement policies use those links. The SQL stays outside the active repository migration directory, so it is not replayed by routine `supabase db push`; broader migration-history reconciliation is still required before any bulk push. See [the Supabase audit](supabase-production-audit-2026-10-04.md).

## Why audio, pictures, or videos may fail

These features are authenticated Supabase Edge Function requests. A connected ElevenLabs account in Manus is **separate** from Supabase Edge Function secrets: it does not automatically give the deployed app access to the ElevenLabs API key. The function also has to be deployed after its source is updated. A missing provider key, stale deployed function, private-storage configuration problem, or provider outage can therefore stop a generation even while the button is visible.

Video Studio submits a short clip to public Hugging Face Spaces. Those services can be unavailable or queued for several minutes; a token does not guarantee GPU capacity. Learning Studio's MP4 export is a different feature: it creates a narrated slide video. The long-form film planner saves a film plan and shot list but does **not** render a long film.

## Configure server-side secrets

Use Supabase Dashboard → **Edge Functions → Secrets**. Do not put provider keys in browser variables, React source, GitHub, or chat.

| Secret | Purpose | Default / note |
| --- | --- | --- |
| `ELEVENLABS_API_KEY_1` | Fluent English and Kiswahili podcast/lesson narration | Required for the preferred ElevenLabs route. Add optional `ELEVENLABS_API_KEY_2`/`_3` only if they are separate usable keys. |
| `ELEVENLABS_DIALOGUE_MODEL` | Dialogue TTS model | Defaults to `eleven_v3`. |
| `ELEVENLABS_HOST_VOICE_ID`, `ELEVENLABS_TUTOR_VOICE_ID` | Podcast speaker voice IDs | Optional. The code has accessible defaults; confirm any selected IDs exist in your ElevenLabs account. |
| `HF_TOKEN_1` | Hugging Face image/video requests | Rotated through numbered tokens where supported; does not remove a shared GPU queue. |
| `GEMINI_API_KEY_1` (and optional `_2`, `_3`) | Text generation, plus optional fallbacks | Also used for your existing per-stage text-provider chains. |
| `GEMINI_TTS_ENABLED=true` | English-only Gemini TTS fallback | Off by default. Check the linked project's billing tier and privacy terms first. |
| `HF_TTS_FALLBACK_ENABLED=true` | English Hugging Face TTS fallback | Off by default because it may sound robotic; Kiswahili never silently falls back to English-only TTS. |
| `GEMINI_IMAGE_ENABLED=true` | Gemini image fallback after Hugging Face fails | Off by default. **Potentially billable; not on Google's free API tier** as of 2026-10-04. |

For a fluent narration route, add `ELEVENLABS_API_KEY_1` first. Then update the branch and deploy `generate-audio`. The app sends the script to ElevenLabs as ordered text-to-dialogue turns, splits longer scripts into safe chunks, and saves the returned MP3 in private Supabase Storage. Kiswahili courses/scripts request `sw`; English requests `en`. The moot-judge room also offers **opt-in natural English voice replies**; each spoken reply is sent to ElevenLabs, uses account quota, and is saved as a private audio asset for replay. If ElevenLabs is unavailable, the app reports the actual provider detail instead of quietly returning browser-generated robotic speech. The UI warns users not to send confidential client material for voice generation.

Authenticated media generation does **not** yet enforce a server-side per-user daily spending/quota cap. Audio scripts are capped at 12,000 characters per request and split into provider calls, but repeated signed-in requests can still consume provider quota. Keep paid fallbacks disabled unless deliberately accepted, limit access to trusted users, and configure any usage/spending controls available from the provider account before enabling the related secrets.

The optional Gemini TTS fallback is English-only in this implementation. Google's official pricing page lists a Free Tier for Gemini TTS, but free-tier data can be used to improve Google products; a paid-tier project can incur charges. Do not route confidential client or personal records through it without checking the account's terms.

### Gemini images

Google's current Gemini image API models include Nano Banana image-generation models, but the official API pricing table shows **no free API tier** for the image models checked on 2026-10-04. AI Studio's interactive free experience is not equivalent to a free API quota. The app tries the existing Hugging Face image route first; Gemini is only called if `GEMINI_IMAGE_ENABLED=true` is deliberately configured. No Gemini image call is enabled by default. See Google's [image-generation guide](https://ai.google.dev/gemini-api/docs/image-generation), [models](https://ai.google.dev/gemini-api/docs/models), and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Deploying the updated functions

After reviewing/merging the code, updating the required secrets, and reconciling the existing migration history, deploy only the functions you intend to update. For the changes in this branch, the relevant commands are:

```bash
supabase login
supabase link --project-ref chchqsnlcpfujweymwcg
supabase functions deploy ai
supabase functions deploy generate-audio
supabase functions deploy generate-image
supabase functions deploy generate-video
supabase functions deploy video-status
```

The video submission and status functions are included because the API response was missing the job ID needed for polling, `film_clip` jobs lacked a refresh control, and exhausted providers could leave jobs queued indefinitely. The handler now uses the already-live `video_jobs.locked_at` field to serialize status checks and re-reads the media/retry rows under the lock before acting, restores a missing retry row (including for ready assets), respects the live `max_attempts` value, and limits each accepted provider job to ten minutes even if it keeps emitting queue/heartbeat events. Deleted assets are terminal and cannot be relaunched by a late status poll. All-provider submission failures resolve after the 30-second cooldown; repeated status/download failures (four consecutive checks) and malformed completion output reach a recoverable fallback or terminal result rather than leaving a silent infinite queue. Provider URLs must resolve to the configured HTTPS Space, requests never follow redirects with a bearer token, and downloaded bytes are streamed with a 128 MB ceiling and must pass MP4 MIME/signature validation before being stored as `video/mp4`. Temporary private-storage upload failures retry the same generated file up to three more times at 20-second intervals before producing an explicit terminal error. Gradio parsing accepts completion-event envelopes or structured completion messages, considers all event payloads, and only treats likely video/file URLs as generated clips. The external free GPU queue remains best-effort. Frontend values `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in local/hosting environment settings; provider API keys belong only in Supabase Edge Function secrets.

## Install the app

Group 13 Hub is a PWA, not an Android APK or App Store package. Install it from the deployed HTTPS site:

- **Android:** open the site in Chrome and choose the browser menu → **Install app** / **Add to Home screen**.
- **iPhone/iPad:** open it in Safari → **Share** → **Add to Home Screen**; iOS does not expose Chrome's install prompt.
- **Desktop:** use the Chrome/Edge address-bar install icon or browser menu.

The install button now listens for the browser prompt at application startup, so it does not miss an early `beforeinstallprompt` event. A PWA install prompt may still be unavailable on a local `npm run dev` URL; check the production HTTPS domain and browser/device conditions.

## Get and validate the code locally

Once the feature branch is pushed, update a local clone and run the normal project checks:

```bash
git fetch origin
git switch feature/cinematic-home-fluent-voices
git pull --ff-only origin feature/cinematic-home-fluent-voices
npm ci
npm run check
npm run build
```

`npm run check` and `npm run build` validate the frontend bundle; they do not deploy Supabase functions or modify the live database. GitHub branch changes do not automatically mean that Vercel or Supabase has deployed them; verify each service separately after deployment.
