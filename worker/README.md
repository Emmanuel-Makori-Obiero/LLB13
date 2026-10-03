# LLB13 automated open-model video worker

This worker turns the film plans saved by the LLB13 Media page into generated video. It polls Supabase for a `draft` or `queued` row in `film_projects`, reads its ordered `film_shots`, submits short generation jobs to ComfyUI, stitches the results with FFmpeg, uploads segment and final MP4 files to the private Supabase `media` bucket, and marks the project and shots as `ready`.

## What it supports

The worker is intentionally provider-neutral at the model layer. ComfyUI is the server, while the exported workflow decides whether the model is Wan 2.1, Wan 2.2, LTX-Video, or another compatible open model. This is safer than embedding a particular node graph because ComfyUI workflows and custom nodes change frequently.

The worker subdivides each stored three-minute plan into short generation units. The default is 5 seconds, which matches the practical behavior of many open video models. A five-segment, 15-minute project therefore creates many jobs; it can take a long time and use substantial GPU, disk, and electricity. It is not an unlimited-free cloud service.

Each ComfyUI submission is retried up to three times, and each render wait is retried once before the project is marked failed. Successful units are concatenated with FFmpeg into segment files and then into a final MP4; every segment and the final export are copied to private Supabase Storage.

## 1. Prepare ComfyUI

Install ComfyUI on a machine with an NVIDIA GPU and install the model/workflow dependencies required by the selected open model. Wan 2.1's 1.3B checkpoint is the lower-memory starting point; larger Wan, LTX, and Hunyuan workflows require more VRAM and may need offloading or quantization.

In ComfyUI:

1. Load a working text-to-video workflow for the selected model.
2. Put `__PROMPT__` in the positive prompt text field.
3. Put `__SEED__` in the seed field.
4. Put `__OUTPUT_PREFIX__` in the output filename prefix field.
5. Export the workflow as **API format JSON** and save it as the path in `COMFYUI_WORKFLOW_JSON`.
6. Confirm that `GET http://127.0.0.1:8188/system_stats` works and manually run the workflow once.

The worker currently uses text-to-video continuity prompts. For stronger continuity, use an image-to-video workflow and add a reference-image placeholder plus a worker extension that passes the prior clip's last frame into the next workflow.

## 2. Apply the database migration

Apply `supabase/migrations/002-cloud-media.sql` first, then `supabase/migrations/003-video-reliability.sql` for persistent serverless video retry state. The first migration creates `film_projects`, `film_shots`, `media_assets`, the private `media` Storage bucket, and the required policies.

## 3. Install and run

On the worker host:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg python3-venv
python3 -m venv .venv
. .venv/bin/activate
pip install -r worker/requirements.txt
cp worker/.env.example .env
# edit .env with the real values
set -a; . ./.env; set +a
python worker/video_worker.py
```

For a safe first test, set `WORKER_ONCE=1` and create a small test project. The worker will process one queued project and exit. Remove that setting when running it as a service.

## Security

The worker requires `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses Row Level Security and must stay on the worker machine. Do not put it in Vite variables, React code, GitHub, screenshots, or the browser. Restrict the ComfyUI port to localhost or a private network; do not expose an unauthenticated `/prompt` endpoint to the public internet.

## Production notes

Run one worker per GPU unless you have explicitly designed a queue for more. Add a process supervisor such as systemd or Docker restart policy after the one-project test works. Keep enough disk for intermediate clips. The worker writes `failed` status and a short error into `film_projects.continuity` when a job fails; inspect ComfyUI logs for model/node failures.

This implementation does not bypass provider quotas, model licenses, or content restrictions. Review the selected model license before commercial deployment, particularly for LTX and Hunyuan variants.

## Optional two-speaker audio worker

`tts_worker.py` creates a downloadable multi-voice podcast from `HOST:` and `TUTOR:` lines using self-hosted Piper and FFmpeg. This is the dependable free-first route for two different voices; hosted free TTS APIs are quota- or trial-limited and do not share one universal speaker schema.

Install Piper and download two voices:

```bash
python -m pip install piper-tts
python -m piper.download_voices en_US-lessac-medium
python -m piper.download_voices en_GB-alan-medium
```

Then create the final file:

```bash
python worker/tts_worker.py podcast-script.txt \
  --output podcast.mp3 \
  --host-voice en_US-lessac-medium \
  --tutor-voice en_GB-alan-medium
```

To connect this worker to the app, put an authenticated HTTPS queue in front of it. The queue should accept a script/job ID, run the worker, upload the result to Supabase Storage, and update the media asset row. Do not expose Piper or provider tokens directly to the browser.
