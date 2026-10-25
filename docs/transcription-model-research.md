# Transcription model settings

Checked 25 October 2026 against Groq's current documentation.

The Transcribe page offers `whisper-large-v3` for Higher accuracy and `whisper-large-v3-turbo` for Balanced. Groq's speech-to-text documentation lists both as supported multilingual transcription models and recommends Large v3 when transcription is error-sensitive. The same page's comparison lists a lower word error rate for Large v3 than Turbo (10.3% versus 12%). The Large v3 model page gives results by input shape instead: 8.4% for short-form, 10.0% for sequential long-form, and 11.0% for chunked long-form.[1] [2]

These are provider-reported evaluations, not a guarantee for a particular lecture. Word error rate is not the same as a user's measured accuracy on a class recording. The product should not promise an 85% result without an external reference transcript and representative test set. Background noise, speaker accent, overlapping speech, language mixing, recording quality, and technical vocabulary can change the outcome.

Groq currently lists Large v3 at $0.111 per audio hour and Turbo at $0.04 per hour. Its speech-to-text page documents a 25 MB free-tier file limit and a 100 MB developer-tier limit; the app retains its smaller 24 MiB per-request ceiling and splits recordings in the browser. Groq says its audio service down-samples to 16 kHz mono, accepts a prompt of up to 224 tokens, and recommends overlapping segments for manual chunking.[1] [3]

The two conservative text-only proofreading passes use `openai/gpt-oss-20b`, which Groq lists as a production model. Each pass reviews bounded text segments, and pass two receives the text accepted from pass one. A lexical-retention guard rejects empty, summary-like, or heavily rewritten outputs. Proofreading cannot listen to the recording or resolve uncertain names reliably, so unclear words still need to be checked against the audio. Groq's current model page lists GPT-OSS 20B at $0.075 per million input tokens and $0.30 per million output tokens.[4]

## References

[1]: https://console.groq.com/docs/speech-to-text "Groq Speech to Text"
[2]: https://console.groq.com/docs/model/whisper-large-v3 "Groq Whisper Large v3"
[3]: https://console.groq.com/docs/models "Groq Supported Models"
[4]: https://console.groq.com/docs/model/openai/gpt-oss-20b "Groq GPT-OSS 20B"
