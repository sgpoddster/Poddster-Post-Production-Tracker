#!/usr/bin/env python3
"""
PCM Reporter — drop this at /volume1/PCM/app/core/reporter.py on the NAS.

Sends recording state updates to the Poddster Vercel app.
Requires: pip install requests
"""

import os
import requests

# These are set as environment variables on the NAS.
# Add to /volume1/PCM/.env or export before running PCM scripts.
PCM_ENDPOINT = os.environ.get("PCM_ENDPOINT", "")   # e.g. https://your-app.vercel.app/api/pcm/update
PCM_SECRET   = os.environ.get("PCM_SECRET", "")     # shared secret — set same value in Vercel env vars


def report(studio: str, recording: str, state: str, **kwargs):
    """
    Send a state update to the dashboard.

    Args:
        studio:    e.g. "Studio 1"
        recording: e.g. "STUDIO 1 2"
        state:     one of: discovered | copying | copy_complete | uploading | archived | failed
        **kwargs:  optional: file_count, total_bytes, error, nas_path, drive_url
    """
    if not PCM_ENDPOINT or not PCM_SECRET:
        print("[reporter] PCM_ENDPOINT or PCM_SECRET not set — skipping report")
        return

    payload = {"studio": studio, "recording": recording, "state": state, **kwargs}

    try:
        r = requests.post(
            PCM_ENDPOINT,
            json=payload,
            headers={"x-pcm-secret": PCM_SECRET},
            timeout=10,
        )
        if r.ok:
            print(f"[reporter] {studio} / {recording} → {state}")
        else:
            print(f"[reporter] WARNING: server returned {r.status_code}: {r.text}")
    except Exception as e:
        print(f"[reporter] WARNING: could not reach dashboard: {e}")
