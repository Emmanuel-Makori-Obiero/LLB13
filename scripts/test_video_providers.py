#!/usr/bin/env python3
"""Check live provider schemas; optionally submit one real job with --submit."""
from __future__ import annotations
import argparse, json, urllib.request

PROVIDERS = {
    "openking-wan22": "https://openking-wan2-video-generation.hf.space/gradio_api/info",
    "pyramid-flow": "https://pyramid-flow-pyramid-flow.hf.space/gradio_api/info",
    "ltx-video-fast": "https://lightricks-ltx-video-distilled.hf.space/gradio_api/info",
}

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", action="store_true", help="submit one real short job to each provider")
    parser.add_argument("--prompt", default="A law student walks through a courthouse at sunrise")
    args = parser.parse_args()
    failures = 0
    for name, info_url in PROVIDERS.items():
        try:
            with urllib.request.urlopen(info_url, timeout=20) as response:
                payload = json.load(response)
            endpoints = list((payload.get("named_endpoints") or {}).keys())
            print(f"{name}: schema OK; endpoints={endpoints[:8]}")
            if args.submit:
                if name == "openking-wan22":
                    api, data = "generate_video", [args.prompt, None, 512, 512, 25, 20, 5, -1]
                elif name == "pyramid-flow":
                    api, data = "generate_video", [args.prompt, None, 3, 7, 7, 8]
                else:
                    api, data = "text_to_video", [args.prompt, "", None, None, 512, 704, "text-to-video", 3, None, -1, True, 3, False]
                request = urllib.request.Request(
                    info_url.rsplit("/gradio_api/", 1)[0] + f"/gradio_api/call/{api}",
                    data=json.dumps({"data": data}).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=20) as response:
                    print(f"  submitted: HTTP {response.status} {response.read(400).decode(errors='replace')}")
        except Exception as exc:
            failures += 1
            print(f"{name}: FAILED: {exc}")
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
