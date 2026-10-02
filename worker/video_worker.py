#!/usr/bin/env python3
"""Supabase -> ComfyUI -> FFmpeg film worker.

The worker expects an API-format ComfyUI workflow JSON. Put the literal markers
__PROMPT__, __SEED__, and __OUTPUT_PREFIX__ in the exported workflow where the
worker should inject values. Export the workflow from ComfyUI's API format, not
its UI format.

This worker intentionally uses only server-side credentials. Run it on the same
machine as ComfyUI, or on a machine that can reach COMFYUI_URL.
"""
from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import requests


class WorkerError(RuntimeError):
    pass


class SupabaseRest:
    def __init__(self, url: str, service_key: str) -> None:
        self.base = url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            }
        )
        self.service_key = service_key

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.session.request(method, f"{self.base}/rest/v1/{path.lstrip('/')}", timeout=60, **kwargs)
        if not response.ok:
            raise WorkerError(f"Supabase {method} {path} failed ({response.status_code}): {response.text[:500]}")
        return response.json() if response.content else None

    def one(self, table: str, params: dict[str, str]) -> dict[str, Any] | None:
        rows = self.request("GET", table, params={**params, "limit": "1"})
        return rows[0] if rows else None

    def update(self, table: str, params: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        return self.request("PATCH", table, params={**params, "select": "*"}, json=values, headers={"Prefer": "return=representation"})

    def insert(self, table: str, values: dict[str, Any]) -> dict[str, Any]:
        rows = self.request("POST", table, params={"select": "*"}, json=values, headers={"Prefer": "return=representation"})
        if not rows:
            raise WorkerError(f"Supabase insert into {table} returned no row")
        return rows[0]

    def list_shots(self, project_id: str) -> list[dict[str, Any]]:
        return self.request("GET", "film_shots", params={"project_id": f"eq.{project_id}", "order": "shot_index.asc"})

    def upload_file(self, path: Path, storage_path: str, content_type: str = "video/mp4") -> str:
        response = self.session.put(
            f"{self.base}/storage/v1/object/media/{storage_path}",
            data=path.read_bytes(),
            headers={"Content-Type": content_type, "x-upsert": "true"},
            timeout=300,
        )
        if not response.ok:
            raise WorkerError(f"Supabase media upload failed ({response.status_code}): {response.text[:500]}")
        return f"{self.base}/storage/v1/object/public/media/{storage_path}"


class ComfyUI:
    def __init__(self, base_url: str, workflow_path: Path, output_dir: Path, poll_seconds: float) -> None:
        self.base = base_url.rstrip("/")
        self.workflow_path = workflow_path
        self.output_dir = output_dir
        self.poll_seconds = poll_seconds
        self.client_id = str(uuid.uuid4())
        self.session = requests.Session()
        raw_workflow = workflow_path.read_text()
        missing = [marker for marker in ("__PROMPT__", "__SEED__", "__OUTPUT_PREFIX__") if marker not in raw_workflow]
        if missing:
            raise WorkerError(f"ComfyUI workflow is missing marker(s): {', '.join(missing)}")
        self.template = json.loads(raw_workflow)
        if not isinstance(self.template, dict):
            raise WorkerError("COMFYUI_WORKFLOW_JSON must contain an API-format workflow object")

    def _replace(self, value: Any, prompt: str, seed: int, prefix: str) -> Any:
        if isinstance(value, dict):
            return {key: self._replace(item, prompt, seed, prefix) for key, item in value.items()}
        if isinstance(value, list):
            return [self._replace(item, prompt, seed, prefix) for item in value]
        if isinstance(value, str):
            if value == "__PROMPT__":
                return prompt
            if value == "__SEED__":
                return seed
            if value == "__OUTPUT_PREFIX__":
                return prefix
            return value.replace("__PROMPT__", prompt).replace("__OUTPUT_PREFIX__", prefix)
        return value

    def submit(self, prompt: str, seed: int, prefix: str) -> str:
        workflow = self._replace(self.template, prompt, seed, prefix)
        response = self.session.post(
            f"{self.base}/prompt",
            json={"prompt": workflow, "client_id": self.client_id},
            timeout=60,
        )
        if not response.ok:
            raise WorkerError(f"ComfyUI prompt submission failed ({response.status_code}): {response.text[:800]}")
        data = response.json()
        if data.get("error") or data.get("node_errors"):
            raise WorkerError(f"ComfyUI rejected workflow: {json.dumps(data)[:1000]}")
        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise WorkerError(f"ComfyUI response contained no prompt_id: {data}")
        return str(prompt_id)

    def wait_for_video(self, prompt_id: str, prefix: str, timeout_seconds: int) -> Path:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            response = self.session.get(f"{self.base}/history/{prompt_id}", timeout=60)
            if response.ok:
                history = response.json().get(prompt_id)
                if history:
                    if history.get("status", {}).get("status_str") == "error":
                        raise WorkerError(f"ComfyUI job failed: {json.dumps(history)[:1200]}")
                    found = self._outputs_to_files(history.get("outputs", {}), prefix)
                    if found:
                        return found[-1]
            time.sleep(self.poll_seconds)
        raise WorkerError(f"Timed out waiting for ComfyUI prompt {prompt_id}")

    def _outputs_to_files(self, outputs: dict[str, Any], prefix: str) -> list[Path]:
        files: list[Path] = []
        for node_output in outputs.values():
            if not isinstance(node_output, dict):
                continue
            for key in ("videos", "gifs", "images"):
                for item in node_output.get(key, []) or []:
                    if not isinstance(item, dict) or not item.get("filename"):
                        continue
                    path = self.output_dir / str(item.get("type", "output")) / str(item.get("subfolder", "")) / str(item["filename"])
                    if not path.exists():
                        path = self.output_dir / str(item.get("subfolder", "")) / str(item["filename"])
                    if path.exists() and (prefix in path.name or key == "videos" or key == "gifs"):
                        files.append(path)
        return files


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or not value.strip():
        raise WorkerError(f"Missing required environment variable: {name}")
    return value.strip()


def run_ffmpeg(args: list[str], timeout: int = 1800) -> None:
    try:
        result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", *args], capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise WorkerError("ffmpeg is required on the worker host") from exc
    if result.returncode:
        raise WorkerError(f"ffmpeg failed: {result.stderr[-1200:]}")


def concat_files(files: list[Path], destination: Path) -> None:
    if not files:
        raise WorkerError("No generated clips were available to stitch")
    list_file = destination.with_suffix(".concat.txt")
    list_file.write_text("\n".join(f"file '{path.resolve().as_posix().replace("'", "'\\''")}'" for path in files) + "\n")
    run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(list_file), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", "-y", str(destination)])
    list_file.unlink(missing_ok=True)


def process_project(db: SupabaseRest, comfy: ComfyUI, project: dict[str, Any], clip_seconds: int, job_timeout: int) -> None:
    project_id = str(project["id"])
    owner_id = str(project["owner_id"])
    shots = db.list_shots(project_id)
    if not shots:
        raise WorkerError(f"Film project {project_id} has no film_shots rows")
    with tempfile.TemporaryDirectory(prefix=f"llb13-{project_id}-") as temp:
        root = Path(temp)
        segment_files: list[Path] = []
        for shot in shots:
            shot_id = str(shot["id"])
            index = int(shot["shot_index"])
            duration = int(shot.get("duration_seconds") or 180)
            count = max(1, math.ceil(duration / clip_seconds))
            clip_files: list[Path] = []
            db.update("film_shots", {"id": f"eq.{shot_id}"}, {"status": "processing"})
            for clip_index in range(count):
                prefix = f"llb13_{project_id}_{index:03d}_{clip_index:03d}_{uuid.uuid4().hex[:8]}"
                prompt = (
                    f"{shot['prompt']}\n\nContinuity notes: {shot.get('continuity_notes') or ''}\n"
                    f"This is generated clip {clip_index + 1} of {count} for segment {index + 1}. "
                    "Create a clean cinematic shot with a natural beginning and ending suitable for editorial stitching."
                )
                prompt_id = comfy.submit(prompt, seed=abs(hash((project_id, index, clip_index))) % 2_147_483_647, prefix=prefix)
                generated = comfy.wait_for_video(prompt_id, prefix, job_timeout)
                local = root / f"segment-{index:03d}-clip-{clip_index:03d}{generated.suffix or '.mp4'}"
                shutil.copy2(generated, local)
                clip_files.append(local)
            segment = root / f"segment-{index:03d}.mp4"
            concat_files(clip_files, segment)
            segment_files.append(segment)
            storage_path = f"{owner_id}/{project_id}/segment-{index:03d}.mp4"
            url = db.upload_file(segment, storage_path)
            asset = db.insert("media_assets", {"owner_id": owner_id, "title": f"{project['title']} · segment {index + 1}", "kind": "film_clip", "project_id": project_id, "storage_path": storage_path, "mime_type": "video/mp4", "public_url": None, "duration_seconds": duration, "status": "ready", "provider": "comfyui", "metadata": {"shot_id": shot_id, "generated_clip_count": count}})
            db.update("film_shots", {"id": f"eq.{shot_id}"}, {"status": "ready", "asset_id": asset["id"], "provider": "comfyui"})
        final = root / "final-film.mp4"
        concat_files(segment_files, final)
        final_path = f"{owner_id}/{project_id}/final-film.mp4"
        final_url = db.upload_file(final, final_path)
        final_asset = db.insert("media_assets", {"owner_id": owner_id, "title": project["title"], "kind": "film_export", "project_id": project_id, "storage_path": final_path, "mime_type": "video/mp4", "public_url": None, "status": "ready", "provider": "comfyui", "metadata": {"segments": len(segment_files), "target_duration_seconds": project.get("target_duration_seconds")}})
        db.update("film_projects", {"id": f"eq.{project_id}"}, {"status": "ready", "final_asset_id": final_asset["id"]})


def main() -> None:
    db = SupabaseRest(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"))
    comfy = ComfyUI(env("COMFYUI_URL", "http://127.0.0.1:8188"), Path(env("COMFYUI_WORKFLOW_JSON")), Path(env("COMFYUI_OUTPUT_DIR", "ComfyUI/output")), float(os.getenv("WORKER_POLL_SECONDS", "3")))
    clip_seconds = int(os.getenv("GENERATION_CLIP_SECONDS", "5"))
    job_timeout = int(os.getenv("COMFYUI_JOB_TIMEOUT_SECONDS", "1800"))
    once = os.getenv("WORKER_ONCE", "0") == "1"
    print(f"LLB13 video worker ready; generating {clip_seconds}s units through {comfy.base}", flush=True)
    while True:
        project = db.one("film_projects", {"status": "in.(draft,queued)", "order": "created_at.asc"})
        if not project:
            if once:
                return
            time.sleep(int(os.getenv("WORKER_IDLE_SECONDS", "15")))
            continue
        project_id = str(project["id"])
        db.update("film_projects", {"id": f"eq.{project_id}"}, {"status": "processing"})
        try:
            process_project(db, comfy, project, clip_seconds, job_timeout)
            print(f"Completed film project {project_id}", flush=True)
        except Exception as exc:
            db.update("film_projects", {"id": f"eq.{project_id}"}, {"status": "failed", "continuity": {"worker_error": str(exc)[:2000]}})
            print(f"Film project {project_id} failed: {exc}", flush=True)
        if once:
            return


if __name__ == "__main__":
    main()
