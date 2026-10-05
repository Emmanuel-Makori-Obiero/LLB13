# Generation setup and podcast test

## Where `links.ts` goes

`links.ts` belongs directly inside the React source directory:

```text
LLB13/
  src/
    links.ts
    BookReader.tsx
    App.tsx
```

It is imported by the reader as `./links`, so do not put it in `src/lib/` or the project root. The PDF preview helper now adds `#page=1&zoom=page-width`. Browser PDF viewers may still require the viewer's own zoom control.

## Configure ComfyUI

Run ComfyUI on the same GPU machine as the worker. The default API endpoint is:

```text
http://127.0.0.1:8188
```

Verify it before running the worker:

```bash
curl http://127.0.0.1:8188/system_stats
```

Export a working ComfyUI **API-format** workflow as JSON. Put these exact markers in the workflow:

- `__PROMPT__` in the positive prompt text input
- `__SEED__` in the seed input
- `__OUTPUT_PREFIX__` in the output filename prefix input

Set these worker variables:

```bash
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
export COMFYUI_URL=http://127.0.0.1:8188
export COMFYUI_WORKFLOW_JSON=/opt/ComfyUI/workflows/llb13-wan-api.json
export COMFYUI_OUTPUT_DIR=/opt/ComfyUI/output
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in the React app or a `VITE_` variable. Install FFmpeg and run a one-project test first:

```bash
sudo apt-get install -y ffmpeg python3-venv
python3 -m venv .venv
. ./.venv/bin/activate
pip install -r worker/requirements.txt
WORKER_ONCE=1 python worker/video_worker.py
```

## Test the two-speaker podcast workflow

The browser app's Learning Studio calls the Supabase `ai` Edge Function with the signed-in user's JWT. The standalone test script does the same thing. It tests the three research perspectives plus the final `podcast_script` call and saves a Markdown script.

Install the one Python dependency:

```bash
pip install requests
```

Set a user access token and the AI document IDs. The token must belong to a signed-in user who can access the selected documents; never commit it:

```bash
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
export SUPABASE_ACCESS_TOKEN=YOUR_SIGNED_IN_USER_JWT
export PODCAST_DOC_IDS=book-document-uuid-1,book-document-uuid-2
```

Run:

```bash
python scripts/test_podcast_workflow.py \
  --topic "Explain the difference between murder and manslaughter under Kenyan law" \
  --out podcast-test-output.md
```

The script prints:

```text
[1/4] Running research perspective 1/3…
[2/4] Running research perspective 2/3…
[3/4] Running research perspective 3/3…
[4/4] Editing the two-speaker podcast script…
Complete ...
```

This smoke test produces a two-speaker **script** only. In the Learning Studio, choose **Generate podcast audio** after the script is ready; the server renders and privately stores audio through the configured provider chain, then shows an in-page player and a download action. The player is not part of this standalone script-generation test.
