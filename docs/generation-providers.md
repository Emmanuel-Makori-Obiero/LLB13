# Generation provider matrix

## Free-first decision

There is no reliable set of 100 permanently free hosted video/TTS providers. Hosted free routes are quota- or trial-limited and change frequently. The application should therefore use **replaceable adapters**, bounded retries, and Supabase Storage persistence rather than promising unlimited generation.

| Route | Best use | Free status | Multi-voice | Main limitation |
| --- | --- | --- | --- | --- |
| Hugging Face Inference Providers | Small cloud experiments and supported text-to-video/ASR models | Free accounts receive a small monthly credit allowance; ZeroGPU Spaces are daily quota/queue limited | Model/Space-specific | Shared queues, temporary outputs, changing model matrix |
| Hugging Face ZeroGPU Space | Prototyping custom Gradio TTS/video | Public use is quota-limited | Space-specific | Queue and daily GPU minutes |
| Piper TTS | Ongoing self-hosted narration | Open-source software; infrastructure is still required | Multiple voice files and some multi-speaker models | Requires persistent worker and per-voice license review |
| Kokoro-82M | High-quality self-hosted multi-voice TTS | Open model/library; infrastructure is still required | Yes, synthesize each speaker with a selected voice | Chunking and worker compute required |
| edge-tts | Personal/internal prototype | Unofficial no-key route; not a documented unlimited API | One voice per request, concatenate turns | Service continuity and terms are uncertain |
| Replicate | Prototyping selected audio/video models | Limited free runs on selected models, then paid | Model-specific | Output URLs expire; async jobs and billing |
| fal.ai | Broad production model catalog | Promotional credits only, then paid | Some models support dialogue | Pay-as-you-go and concurrency limits |

## Recommended architecture

1. **Cloud path:** Supabase Edge Function -> Hugging Face documented API/Space -> immediately copy output to the private `media` bucket.
2. **Voice path:** Supabase Edge Function -> authenticated Piper or Kokoro worker -> concatenate speaker turns with FFmpeg -> store the final WAV/MP3 in Supabase Storage.
3. **Video path:** retain the existing three-provider fallback, add providers only when their current API, model license, and free status are verified.
4. **Reliability:** persist provider job IDs, apply bounded exponential backoff, stop retrying a provider during cooldown, and surface a human-readable queue message.
5. **Security:** keep all provider tokens in Supabase secrets or the worker environment; never put them in browser code and never bypass quotas or private endpoints.

## Multi-speaker podcast design

A dependable multi-voice download should be assembled as separate turns:

- parse `HOST:` and `TUTOR:` lines;
- synthesize each turn with a selected Kokoro/Piper voice;
- insert short silence between turns;
- concatenate and normalize with FFmpeg;
- upload the final audio once to Supabase Storage;
- retain the script and speaker manifest as metadata.

The current browser player already alternates voices. The persistent worker is the correct place for downloadable multi-voice audio because hosted TTS APIs do not share one universal speaker schema.

## Sources

- [Hugging Face Inference Providers pricing](https://huggingface.co/docs/inference-providers/en/pricing)
- [Hugging Face ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)
- [Piper](https://github.com/OHF-Voice/piper1-gpl) and [HTTP API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md)
- [Kokoro-82M](https://github.com/hexgrad/kokoro)
- [edge-tts](https://github.com/rany2/edge-tts)
- [Replicate free collection](https://replicate.com/collections/try-for-free)
- [fal.ai pricing and queue documentation](https://fal.ai/docs/documentation/model-apis/pricing)
