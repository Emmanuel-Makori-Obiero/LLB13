# LLB13 cloud library and media implementation

## Implemented in this pass

- **Library drag-and-drop upload** in `src/App.tsx`.
  - Drop a PDF, DOCX, PPTX, TXT, PNG, or JPG into the Add library material form.
  - Existing AI metadata extraction still fills title, type, unit, topic, source, and date for review before saving.
  - The original file is stored through the existing Supabase `materials` bucket.
- **Cloud media client** in `src/lib/cloudMedia.ts`.
  - Lists private media assets.
  - Uploads media files to Supabase Storage.
  - Creates seven-day signed share URLs and records share metadata.
  - Deletes an owned media file and database record.
  - Creates film projects and ordered film shots.
- **Media page improvements** in `src/App.tsx`.
  - Shows cloud media assets alongside existing URL resources.
  - Opens private assets with a signed URL.
  - Copies a seven-day friend link.
  - Deletes cloud assets after an explicit confirmation.
  - Saves a 15-minute plan as five connected 3-minute segments.
- **Supabase migration** in `supabase/migrations/002-cloud-media.sql`.
  - Adds `media_assets`, `media_shares`, `film_projects`, and `film_shots`.
  - Adds owner/shared RLS policies, indexes, timestamps, and a private `media` bucket.

## Historical cloud-schema note — do not replay on production

This section describes the initial implementation only. The live LLB13 Supabase project already contains the media tables and private storage schema, and its migration ledger has entries that are not represented by this repository's legacy SQL filenames. **Do not run `002-cloud-media.sql` against production or use a blanket `supabase db push` until the full remote history has been reconciled.** See [`docs/supabase-production-audit-2026-10-04.md`](docs/supabase-production-audit-2026-10-04.md) for the verified live state. The original design uses private storage and expiring signed links rather than a public bucket.

## Video generation reality

The film planner is provider-neutral. It stores the requested five connected 3-minute segments, but generation still needs a server-side worker that subdivides each segment into short provider-supported shots, retries failed jobs, preserves reference frames, and stitches the outputs with FFmpeg.

The provider audit found no legitimate unlimited free production API. The practical options are:

1. **Self-hosted ComfyUI + Wan/LTX** — no per-generation vendor fee, but requires GPU, storage, queueing, model licensing review, and operations.
2. **Hugging Face Spaces/Inference Providers** — good for prototyping and short jobs; free quotas are limited and provider/model availability varies.
3. **LTX hosted API** — clean async integration, but usage-billed and capped at short clips.
4. **HunyuanVideo/CogVideoX hosted endpoints** — third-party hosted options exist, but are metered and have model/provider-specific terms.

The app should keep provider keys server-side. Do not put them in React/browser code and do not attempt to bypass quotas or use leaked credentials.

## Historical validation

The check results recorded in the original implementation pass do not validate later landing-page, voice, video-status, or Supabase-audit changes. Run the current repository checks before release; see the production audit and media setup guide for the current rollout procedure.

## Repository/release note

This file predates the current repository release workflow and is not a deployment checklist. Do not apply its historical migration instructions to production. Use the production audit and media setup guide for current Edge Function deployment, migration-history reconciliation, and approval gates.

## Automated video worker

The repository now includes `worker/video_worker.py`. It polls queued film plans, submits short generation jobs to a local ComfyUI server, stitches clips and five segments with FFmpeg, uploads private MP4s to Supabase Storage, and updates `film_projects`, `film_shots`, and `media_assets`.

Configure it with `worker/.env.example`, export a ComfyUI **API-format** workflow containing `__PROMPT__`, `__SEED__`, and `__OUTPUT_PREFIX__`, then follow `worker/README.md`. Use `WORKER_ONCE=1` for the first test. The included `worker/llb13-video-worker.service.example` can keep it running under systemd after the test succeeds.
