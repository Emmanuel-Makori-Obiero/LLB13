#!/usr/bin/env python3
"""Smoke-test the LLB13 two-speaker podcast workflow through Supabase.

Required environment variables:
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN
  PODCAST_DOC_IDS: comma-separated AI document UUIDs

The access token is a user JWT copied from the signed-in app session. Never
commit it or put it in Vite/browser variables. The script runs the same three
perspectives and final podcast_script call used by Learning Studio, prints
progress, and saves the final script as Markdown.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

PERSPECTIVES = [
    "Act as a careful Kenyan law lecturer. Identify the governing rule, authorities, reasoning, and any uncertainty in the selected source.",
    "Act as a plain-language tutor. Explain the selected topic with a concrete everyday example, likely confusion, and a quick recall question.",
    "Act as a demanding moot coach. Test the strongest argument, counterargument, application, exam traps, and what a student must verify before relying on it.",
]


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Missing {name}. See scripts/README-podcast-test.md.")
    return value


def call_ai(base_url: str, anon_key: str, access_token: str, body: dict[str, Any], timeout: int) -> dict[str, Any]:
    response = requests.post(
        f"{base_url.rstrip('/')}/functions/v1/ai",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=timeout,
    )
    try:
        payload = response.json()
    except ValueError:
        payload = {"error": response.text[:1000]}
    if not response.ok:
        raise RuntimeError(f"AI function returned HTTP {response.status_code}: {json.dumps(payload)[:1500]}")
    if not isinstance(payload, dict):
        raise RuntimeError(f"AI function returned an unexpected response: {payload!r}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Test the LLB13 two-speaker podcast workflow")
    parser.add_argument("--topic", required=True, help="Topic or question for the episode")
    parser.add_argument("--doc-id", action="append", dest="doc_ids", help="AI document UUID; repeat for multiple books")
    parser.add_argument("--out", default="podcast-test-output.md", help="Markdown output path")
    parser.add_argument("--timeout", type=int, default=180, help="Per-request timeout in seconds")
    args = parser.parse_args()

    base_url = required("SUPABASE_URL")
    anon_key = required("SUPABASE_ANON_KEY")
    access_token = required("SUPABASE_ACCESS_TOKEN")
    doc_ids = args.doc_ids or [item.strip() for item in os.getenv("PODCAST_DOC_IDS", "").split(",") if item.strip()]
    if not doc_ids:
        raise SystemExit("Provide --doc-id UUID or PODCAST_DOC_IDS=uuid1,uuid2")

    findings: list[str] = []
    started = time.time()
    for index, perspective in enumerate(PERSPECTIVES, start=1):
        print(f"[{index}/4] Running research perspective {index}/3…", flush=True)
        result = call_ai(
            base_url,
            anon_key,
            access_token,
            {
                "feature": "topic_summary",
                "mode": "auto",
                "docIds": doc_ids[:10],
                "messages": [{"role": "user", "content": f"{perspective}\n\nTopic: {args.topic}\nReturn a focused memo for a later script editor. Do not invent authorities."}],
            },
            args.timeout,
        )
        answer = str(result.get("answer", "")).strip()
        if not answer:
            raise RuntimeError(f"Perspective {index} returned no answer: {result}")
        findings.append(answer)

    print("[4/4] Editing the two-speaker podcast script…", flush=True)
    final = call_ai(
        base_url,
        anon_key,
        access_token,
        {
            "feature": "podcast_script",
            "mode": "auto",
            "docIds": doc_ids[:10],
            "messages": [{"role": "user", "content": f"Topic: {args.topic}\n\nIndependent research memos from the AI panel:\n" + "\n\n".join(f"MEMO {i + 1}\n{memo}" for i, memo in enumerate(findings)) + "\n\nCreate the final two-speaker podcast now. Keep it faithful to the selected sources, cite source markers when available, and mark uncertain law for verification."}],
        },
        args.timeout,
    )
    answer = str(final.get("answer", "")).strip()
    if not answer:
        raise RuntimeError(f"Final podcast call returned no answer: {final}")

    output = Path(args.out)
    output.write_text(f"# Two-speaker podcast test\n\n**Topic:** {args.topic}\n\n{answer}\n", encoding="utf-8")
    elapsed = time.time() - started
    print(f"Complete in {elapsed:.1f}s. Saved {output}")
    print("The result is a podcast script. Browser speech or a TTS worker is required for an MP3 file.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
