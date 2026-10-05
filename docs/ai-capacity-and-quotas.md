# AI capacity and student quotas

The application now enforces these **rolling one-hour limits per signed-in student** with an atomic database reservation:

| Content type | Limit per student/hour | Capacity for 30 students/hour | Capacity for 50 students/hour |
| --- | ---: | ---: | ---: |
| Text AI calls | 60 | 1,800 | 3,000 |
| Podcast/audio generations | 5 | 150 | 250 |
| Images | 3 | 90 | 150 |
| Videos | 1 | 30 | 50 |

These are application caps, not a guarantee that a provider will accept that much traffic. Provider concurrency, account credits, model limits, queue times, and audio character limits still apply.

## ElevenLabs recommendation

Start with **one properly sized ElevenLabs account/workspace**, then measure actual audio length and concurrency. Adding multiple API keys from the **same ElevenLabs account does not multiply that account's character or plan quota**; it only gives the failover chain more credentials. Add a second or third key only when it belongs to a separately entitled account/workspace and the applicable ElevenLabs terms allow the arrangement. Do not put keys in React, `.env` files shipped to the browser, or GitHub.

For a real target of 30–50 students all using the maximum 5 podcasts/hour, plan for 150–250 audio jobs/hour and size the ElevenLabs plan/workspaces for the total characters, not merely the number of keys. A single shared account is unlikely to support that peak comfortably without a paid/team allowance and provider approval.

## Rollout order

1. Apply `supabase/migrations/008-hourly-ai-quotas.sql` to the production database.
2. Deploy the updated `ai`, `generate-audio`, `generate-image`, and `generate-video` Edge Functions.
3. Configure `ELEVENLABS_API_KEY_1` (and only add `_2`/`_3` for separately entitled capacity). Keep all secrets server-side.
4. Load-test with a small group first. A rejected request returns HTTP 429 with a retry delay; provider failures still use the existing bounded fallback/key rotation.

The cap is rolling, not aligned to the wall clock. A student gets the next slot when the oldest reservation leaves the one-hour window.
