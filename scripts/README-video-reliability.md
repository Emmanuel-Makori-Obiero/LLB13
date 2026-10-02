# Video reliability checks

## Provider schema check

This check does not submit jobs and is safe to run:

```bash
python scripts/test_video_providers.py
```

It verifies that the three public Gradio APIs still expose the endpoints used by the Supabase fallback worker.

To submit one real short job per provider, explicitly opt in:

```bash
python scripts/test_video_providers.py --submit
```

This consumes shared free GPU quota and may leave three queued jobs.

## Production reliability

The serverless path now:

- Tries OpenKing Wan2.2, Pyramid Flow, and LTX-Video Fast.
- Saves every request in `media_assets` and `video_jobs`.
- Retries rejected providers and records provider failures.
- Polls the accepted Gradio job asynchronously.
- Switches providers if an accepted job later fails.
- Copies completed output into private Supabase Storage.

Free Hugging Face queues still have external limits; retries improve resilience but cannot create GPU capacity.
