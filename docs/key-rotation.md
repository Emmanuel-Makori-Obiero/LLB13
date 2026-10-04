# AI and media provider key rotation

The Edge Functions now discover these server-only secret names:

```text
GEMINI_API_KEY_1
GEMINI_API_KEY_2
GEMINI_API_KEY_3

HF_TOKEN_1
HF_TOKEN_2
HF_TOKEN_3

ELEVENLABS_API_KEY_1
ELEVENLABS_API_KEY_2
ELEVENLABS_API_KEY_3
```

The legacy names `GEMINI_API_KEY` and `HF_TOKEN` remain supported. Numbered secrets are tried first, and the legacy secret is used afterward if present. The AI function gives each provider/key pair its own in-memory cooldown after quota, authentication, timeout, or server errors. Image generation rotates across HF tokens on bounded retries; video submission rotates across HF token entries, records only the selected non-secret slot number, and uses that same credential slot for status polling and download. Keep the selected numbered secret configured while its video job is active; no raw provider key is stored in media metadata. Updated podcast and guided-lesson narration uses ElevenLabs text-to-dialogue first for English and Kiswahili, then saves MP3 audio privately. The moot-judge room offers opt-in English ElevenLabs voice replies with audio replay controls. The app does not fall back to robotic browser speech. Optional Gemini TTS fallback for English is off unless `GEMINI_TTS_ENABLED=true`; the Hugging Face TTS fallback is also off unless `HF_TTS_FALLBACK_ENABLED=true`. See [Media generation and app installation](media-and-install-setup.md).

Gemini image generation is separate from chat AI. It is tried only after the configured Hugging Face route fails and only if `GEMINI_IMAGE_ENABLED=true`. Google does not list the current image models on its free API tier; do not enable this flag unless the project owner accepts possible API charges. See the [Supabase production audit](supabase-production-audit-2026-10-04.md) for the live project/source comparison and the applied representative-policy migration record.

Set secrets from a trusted terminal, never in React code or GitHub:

```bash
supabase secrets set \
  GEMINI_API_KEY_1="<key-1>" \
  GEMINI_API_KEY_2="<key-2>" \
  GEMINI_API_KEY_3="<key-3>" \
  ELEVENLABS_API_KEY_1="<key-1>" \
  HF_TOKEN_1="<token-1>" \
  HF_TOKEN_2="<token-2>" \
  HF_TOKEN_3="<token-3>" \
  --project-ref chchqsnlcpfujweymwcg
```

If the CLI does not know the project yet, run `supabase login` and `supabase link --project-ref chchqsnlcpfujweymwcg` first. You can set only the keys you actually have; missing numbered values are ignored.

**Important:** additional keys do not bypass Google or Hugging Face account/project quotas. Gemini keys are most useful when they belong to separate quota projects. Hugging Face tokens improve failover, but usually do not multiply one account's quota and cannot fix a full ZeroGPU queue.

## Separate AI providers by work stage

The AI Edge Function can use a different provider chain for each feature. Configure these Supabase secrets when you want different keys/models for the long-book pipeline:

| Secret | Used for |
| --- | --- |
| `AI_CHAIN_NOTES_JSON` | Reading each bounded section of a book |
| `AI_CHAIN_SUMMARIZE_JSON` | Compressing section notes while retaining topic and authority coverage |
| `AI_CHAIN_STUDY_PLAN_JSON` | Producing the final syllabus |
| `AI_CHAIN_EXAM_GENERATE_JSON` | Generating a practice exam |
| `AI_CHAIN_QUIZ_JSON` | Generating a quiz |

Each value is a JSON array of provider entries; each stage can have one preferred provider plus fallbacks. `keyEnv` names a separate Supabase secret. Example shape (replace the model IDs with models enabled for your provider):

```json
[{"provider":"gemini","baseUrl":"https://generativelanguage.googleapis.com/v1beta/openai","keyEnv":"GEMINI_API_KEY_1","model":"YOUR_SECTION_MODEL","reasoning":"none"}]
```

For example, `AI_CHAIN_NOTES_JSON` may point at your section-reading key, `AI_CHAIN_SUMMARIZE_JSON` at your digest key, and `AI_CHAIN_STUDY_PLAN_JSON` at your strongest syllabus key. Keep all API-key values in Supabase secrets, never in this JSON, browser code, GitHub, or chat. A valid stage chain is tried first; the global `AI_CHAIN_JSON` (or built-in provider list) is appended as fallback. If the stage chain is missing or invalid, the global/default chain is used directly.

Section reads run with a small bounded concurrency of three; digest reductions run two at a time, and their order is preserved. Lower these limits if the selected provider has a strict requests-per-minute cap. A provider chain can reduce failures and avoid needless repeated retries, but it cannot guarantee zero quota errors: several keys under the same provider project may share the same quota.
