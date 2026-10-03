# Gemini and Hugging Face key rotation

The Edge Functions now discover these server-only secret names:

```text
GEMINI_API_KEY_1
GEMINI_API_KEY_2
GEMINI_API_KEY_3

HF_TOKEN_1
HF_TOKEN_2
HF_TOKEN_3
```

The legacy names `GEMINI_API_KEY` and `HF_TOKEN` remain supported. Numbered secrets are tried first, and the legacy secret is used afterward if present. The AI function gives each provider/key pair its own in-memory cooldown after quota, authentication, timeout, or server errors. Audio and image generation rotate across HF tokens on bounded retries; video submission uses a different token for each provider attempt.

Set secrets from a trusted terminal, never in React code or GitHub:

```bash
supabase secrets set \
  GEMINI_API_KEY_1="<key-1>" \
  GEMINI_API_KEY_2="<key-2>" \
  GEMINI_API_KEY_3="<key-3>" \
  HF_TOKEN_1="<token-1>" \
  HF_TOKEN_2="<token-2>" \
  HF_TOKEN_3="<token-3>" \
  --project-ref chchqsnlcpfujweymwcg
```

If the CLI does not know the project yet, run `supabase login` and `supabase link --project-ref chchqsnlcpfujweymwcg` first. You can set only the keys you actually have; missing numbered values are ignored.

**Important:** additional keys do not bypass Google or Hugging Face account/project quotas. Gemini keys are most useful when they belong to separate quota projects. Hugging Face tokens improve failover, but usually do not multiply one account's quota and cannot fix a full ZeroGPU queue.
