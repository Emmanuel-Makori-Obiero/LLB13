#!/usr/bin/env python3
"""Create a two-voice podcast WAV/MP3 with Piper and FFmpeg.

This is an optional worker for users who want a durable, genuinely free-to-run
voice path. It deliberately keeps model inference off Supabase Edge Functions.

Example:
  python worker/tts_worker.py script.txt --output podcast.mp3 \
    --host-voice en_US-lessac-medium --tutor-voice en_GB-alan-medium

The input script should contain HOST: and TUTOR: lines. Lines without a speaker
label use HOST. Download Piper voices first with piper.download_voices.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


class TTSWorkerError(RuntimeError):
    pass


def parse_script(text: str) -> list[tuple[str, str]]:
    turns: list[tuple[str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        match = re.match(r"^(HOST|TUTOR|SPEAKER\s*[12])\s*:\s*(.+)$", line, re.I)
        speaker = (match.group(1).upper() if match else "HOST").replace("SPEAKER 1", "HOST").replace("SPEAKER 2", "TUTOR")
        body = match.group(2).strip() if match else line
        if body:
            turns.append((speaker, body))
    return turns


def run(command: list[str]) -> None:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise TTSWorkerError(result.stderr[-1200:] or "Command failed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("script", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--host-voice", default="en_US-lessac-medium")
    parser.add_argument("--tutor-voice", default="en_GB-alan-medium")
    parser.add_argument("--silence-ms", type=int, default=280)
    args = parser.parse_args()
    if not shutil.which("piper"):
        raise SystemExit("Piper CLI was not found. Install piper-tts and download the selected voices first.")
    if not shutil.which("ffmpeg"):
        raise SystemExit("FFmpeg was not found. Install FFmpeg before running this worker.")
    turns = parse_script(args.script.read_text(encoding="utf-8"))
    if not turns:
        raise SystemExit("No HOST:/TUTOR: lines were found in the script.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="llb13-tts-") as folder:
        root = Path(folder)
        parts: list[Path] = []
        for index, (speaker, text) in enumerate(turns):
            voice = args.tutor_voice if speaker == "TUTOR" else args.host_voice
            source = root / f"{index:04d}.txt"
            wav = root / f"{index:04d}.wav"
            source.write_text(text, encoding="utf-8")
            run(["piper", "--model", voice, "--input_file", str(source), "--output_file", str(wav)])
            parts.append(wav)
        concat = root / "concat.txt"
        concat.write_text("\n".join(f"file '{part.as_posix()}'" for part in parts), encoding="utf-8")
        # Re-encode each input to a common format, add a small gap, and concatenate.
        normalized = root / "normalized.wav"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-af", f"apad=pad_dur={args.silence_ms / 1000:.3f}", "-ar", "24000", "-ac", "1", str(normalized)])
        run(["ffmpeg", "-y", "-i", str(normalized), "-codec:a", "libmp3lame", "-q:a", "4", str(args.output)])
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
