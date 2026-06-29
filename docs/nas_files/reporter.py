#!/usr/bin/env python3
"""
PCM Reporter — /volume1/PCM/app/core/reporter.py
Sends recording state updates to the Poddster dashboard.
Uses only stdlib (no pip required).
"""

import json
import os
import urllib.request
import urllib.error

PCM_ENDPOINT = os.environ.get("PCM_ENDPOINT", "")
PCM_SECRET   = os.environ.get("PCM_SECRET", "")


def report(studio: str, recording: str, state: str, **kwargs):
    """
    Report a state change to the dashboard.

    States: discovered | copying | copy_complete | uploading | archived | failed

    Optional kwargs: file_count, total_bytes, error, nas_path, drive_url
    """
    if not PCM_ENDPOINT or not PCM_SECRET:
        print("[reporter] PCM_ENDPOINT or PCM_SECRET not set — skipping")
        return

    payload = {"studio": studio, "recording": recording, "state": state, **kwargs}
    data = json.dumps(payload).encode()

    req = urllib.request.Request(
        PCM_ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-pcm-secret": PCM_SECRET,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[reporter] {studio} / {recording} → {state}")
    except urllib.error.HTTPError as e:
        print(f"[reporter] WARNING: server returned {e.code}: {e.read().decode()}")
    except Exception as e:
        print(f"[reporter] WARNING: could not reach dashboard: {e}")
