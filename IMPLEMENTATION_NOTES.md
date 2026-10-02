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

## Apply the cloud schema

Run `supabase/migrations/002-cloud-media.sql` in the linked Supabase project after the existing base schema and AI migration. The application will not be able to load cloud media or film plans until this migration has been applied.

The migration deliberately uses a private Storage bucket. Sharing is implemented with an expiring signed URL rather than exposing the whole bucket publicly. The share record remains available for auditing/revocation, but a seven-day URL cannot be retroactively invalidated unless the underlying asset is deleted or the storage policy is changed.

## Video generation reality

The film planner is provider-neutral. It stores the requested five connected 3-minute segments, but generation still needs a server-side worker that subdivides each segment into short provider-supported shots, retries failed jobs, preserves reference frames, and stitches the outputs with FFmpeg.

The provider audit found no legitimate unlimited free production API. The practical options are:

1. **Self-hosted ComfyUI + Wan/LTX** — no per-generation vendor fee, but requires GPU, storage, queueing, model licensing review, and operations.
2. **Hugging Face Spaces/Inference Providers** — good for prototyping and short jobs; free quotas are limited and provider/model availability varies.
3. **LTX hosted API** — clean async integration, but usage-billed and capped at short clips.
4. **HunyuanVideo/CogVideoX hosted endpoints** — third-party hosted options exist, but are metered and have model/provider-specific terms.

The app should keep provider keys server-side. Do not put them in React/browser code and do not attempt to bypass quotas or use leaked credentials.

## Validation

- `npm run check` passed.
- `npm run build` passed.
- `git diff --check` passed.

## GitHub

These changes are currently local in the cloned repository. They have **not** been pushed to GitHub. Review the diff, apply the Supabase migration, test the signed-in flows, then commit and push from the repository owner’s GitHub credentials.

## Automated video worker

The repository now includes `worker/video_worker.py`. It polls queued film plans, submits short generation jobs to a local ComfyUI server, stitches clips and five segments with FFmpeg, uploads private MP4s to Supabase Storage, and updates `film_projects`, `film_shots`, and `media_assets`.

Configure it with `worker/.env.example`, export a ComfyUI **API-format** workflow containing `__PROMPT__`, `__SEED__`, and `__OUTPUT_PREFIX__`, then follow `worker/README.md`. Use `WORKER_ONCE=1` for the first test. The included `worker/llb13-video-worker.service.example` can keep it running under systemd after the test succeeds.
