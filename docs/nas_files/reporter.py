#!/usr/bin/env python3
"""
PCM Reporter — /volume1/PCM/app/core/reporter.py
Sends recording state updates and studio stats to the Poddster dashboard.
Uses only stdlib (no pip required).
"""

import json
import os
import urllib.request
import urllib.error

PCM_ENDPOINT = os.environ.get("PCM_ENDPOINT", "")
PCM_SECRET   = os.environ.get("PCM_SECRET", "")


def _post(path: str, payload: dict):
    """POST JSON to a PCM API path. Raises on network error."""
    if not PCM_ENDPOINT or not PCM_SECRET:
        print("[reporter] PCM_ENDPOINT or PCM_SECRET not set — skipping")
        return

    # PCM_ENDPOINT is the full URL to /api/pcm/update; derive base for other paths
    base = PCM_ENDPOINT.rsplit("/api/pcm/", 1)[0]
    url  = base + path

    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-pcm-secret": PCM_SECRET,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except urllib.error.HTTPError as e:
        print(f"[reporter] WARNING: server returned {e.code}: {e.read().decode()}")
    except Exception as e:
        print(f"[reporter] WARNING: could not reach dashboard: {e}")


def report(studio: str, recording: str, state: str, **kwargs):
    """
    Report a recording state change to the dashboard.

    States: discovered | copying | copy_complete | uploading | archived | failed | gave_up

    Optional kwargs: file_count, total_bytes, error, nas_path, drive_url, retry_count
    """
    payload = {"studio": studio, "recording": recording, "state": state, **kwargs}
    _post("/api/pcm/update", payload)
    print(f"[reporter] {studio} / {recording} → {state}")
