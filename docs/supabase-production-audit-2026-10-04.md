# LLB13 Supabase production audit

**Audit date:** 2026-10-04
**Method:** read-only metadata/schema/policy/function inspection plus aggregate Edge Function status/latency counts. No user content rows, keys, function secrets, data updates, migrations, or deployments were performed during this audit.

## Service and code alignment

The connected `LLB13` Supabase project was `ACTIVE_HEALTHY` in `eu-west-1` on PostgreSQL 17. At initial audit the live migration ledger had 18 entries through `guided_course_visibility` (`20261003202427`). After the user approved the representative-policy correction, the live ledger recorded a 19th entry: version `20261004084308`, name `link_representative_rls_to_user_20261004110000`. The remote schema includes the media and guided-course tables expected by the app. The repository's SQL directory instead contains a few legacy files (`001_ai.sql`, `002-cloud-media.sql`, `003-video-reliability.sql`, `004-guided-courses.sql`, `transcript-lessons.sql`) that do not represent the complete live migration history. **Do not run all local SQL files or a blind `supabase db push` against the live project.** Reconcile the migration ledger first.

Live Edge Functions were active when inspected:

| Function | Live version | Compatibility finding |
| --- | ---: | --- |
| `ai` | 26 | The deployed source uses the global `AI_CHAIN_JSON`; it does not contain the newer feature/stage-specific `AI_CHAIN_*_JSON` routing in the repository. |
| `generate-audio` | 8 | The deployed source did not contain ElevenLabs dialogue synthesis. Its provider path was not the new app's ElevenLabs/Kiswahili path. |
| `generate-image` | 7 | The deployed source did not contain the guarded `GEMINI_IMAGE_ENABLED` fallback. |
| `generate-video` | 9 | Active, but the public Hugging Face GPU queue can still fail or stall; function activity does not reserve a GPU. |
| `video-status` | 9 | Active; the pending branch adds bounded fallback on repeated status/download errors and terminal failure states, but is not deployed. |

The live Supabase project already has the media/guided-course schema; a media-generation failure is more consistent with deployed function code, provider secrets, storage access, or external provider availability than with missing tables alone. The updated app functions in this branch have **not** been deployed by this audit.

Read-only function-edge log aggregates for the rolling 24-hour window queried at 10:25 EAT showed 115 `ai` responses with status 200 (average 17.2 seconds), 6 `ai` responses with status 503 (average 119.9 seconds), and 4 `ai` responses with status 429 (average 0.6 seconds). `generate-audio` had one 200 and one 502 response. There were no `generate-image`, `generate-video`, or `video-status` invocations in that log window, so those logs cannot identify the cause of any image/video issue. The aggregate does not establish the exact upstream cause of AI errors; no prompts or request bodies were queried.

The production PWA homepage, manifest, service worker and two app icons all returned HTTP 200. This branch captures the browser's install prompt earlier, but the change is not deployed yet and install behavior remains browser/device-controlled.

## Security finding: representative access uses editable profile metadata

The live RLS policies on `discussions` and `timetable` initially allowed a signed-in user to match representative privileges by comparing the row's representative name with `auth.jwt() -> user_metadata ->> display_name`. Because display name is editable profile metadata, a user could potentially set it to a representative's name and gain meeting or timetable update/delete access. An initial count covered 2 of 2 current representative names. Immediately before applying the approved fix, a wider preflight over distinct names present in discussions, timetable and units confirmed protected `members.user_id` links for **3 of 3** names; only aggregate counts were returned.

The SQL retained at `docs/review-only/20261004110000_link_representative_rls_to_user.sql` replaces the four display-name policy predicates with matches through `members.user_id = auth.uid()`, while retaining owner/admin access. For UPDATE policies it checks both the old row and the resulting row. The user explicitly approved applying this exact SQL, and it was applied to production on 2026-10-04 as ledger version `20261004084308` / migration name `link_representative_rls_to_user_20261004110000`. Post-apply inspection confirmed all four named policies now resolve representative access through `members.user_id`; none uses editable JWT display-name metadata. The file remains outside `supabase/migrations` as an audit copy and is not a routine replay mechanism. Continue to reconcile the broader local/remote migration history before any bulk `supabase db push`. Re-check mappings before adding future representatives; a representative without a protected member-to-user link will not receive the delegated permissions.

## What changed in the working tree

This branch adds the public cinematic landing/help routes, more explicit login/signup navigation, early PWA install-prompt capture, English/Kiswahili guided syllabi and lesson audio, ElevenLabs natural dialogue narration for Learning Studio and guided lessons, opt-in natural-English moot-judge replies, video job ID/status recovery, serialized fresh-row status checks, bounded provider failover/runtime and transient storage retries, stale audio/course request protection, reliable password-recovery busy-state cleanup, actual provider error details, and an explicitly opt-in Gemini image API fallback. No schema change is needed for the course-language value; it is carried in the existing syllabus JSON. The verified live `video_jobs` table already has `locked_at` and `max_attempts`, so video status serialization and attempt bounds use the existing schema. A read-only code review also caught and corrected the video submission response missing its database ID and the unreachable refresh control for `film_clip` assets.

The ElevenLabs connector in Manus and a Supabase secret are separate credentials. The project owner subsequently reported adding the ElevenLabs key to Supabase; confirm it is named exactly `ELEVENLABS_API_KEY_1` before deployment. The live `generate-audio` function still needs the reviewed branch's code deployed before it can use the new narration path. Gemini image API remains off by default because Google currently lists no free API tier for image generation. Hugging Face remains the first image provider and the external video provider/GPU queue remains best-effort; this branch corrects the local submission/status contract, not provider capacity.

## Deployment sequence after review

1. Merge/checkout the code branch and run `npm ci`, `npm run check`, and `npm run build`.
2. The project owner reports the ElevenLabs key is already in Supabase; confirm the exact `ELEVENLABS_API_KEY_1` name. Add any other required provider secrets through Supabase Dashboard → **Edge Functions → Secrets**, never GitHub or browser-visible variables.
3. Reconcile migration history with the remote ledger before any bulk push. The representative-policy SQL was separately approved and applied; it remains outside the active migration directory.
4. After code review and confirmation of the ElevenLabs secret name, deploy only the reviewed changed Edge Functions (`ai`, `generate-audio`, `generate-image`, `generate-video`, and `video-status`). The stage-specific `ai` function change was merged earlier but the live function was still version 26 at audit time.
5. Verify function logs and test with a non-confidential sample. Confirm the language, provider, private `media` bucket result and playback before calling the rollout complete.
