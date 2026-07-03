#!/usr/bin/env python3
"""
Backfill session_end_at for existing pcm_recordings rows.

For each session folder on the NAS, finds the earliest mtime of video files
(ISO camera files end at the actual recording end time) and writes it to the
session_end_at column in pcm_recordings.

Usage:
    source /volume1/PCM/config/env.sh
    python3 /volume1/PCM/app/backfill_session_end.py
    python3 /volume1/PCM/app/backfill_session_end.py --dry-run
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv

PCM_ENDPOINT = os.environ.get("PCM_ENDPOINT", "").strip()
PCM_SECRET   = os.environ.get("PCM_SECRET", "").strip()
SETTINGS     = Path("/volume1/PCM/config/settings.json")

SGT       = timezone(timedelta(hours=8))
VIDEO_EXT = {".mp4", ".mov", ".mts", ".m2ts", ".mkv"}

SESSION_RE = re.compile(r"^(.+?) — (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) — (.+)$")


def base_url():
    return PCM_ENDPOINT.rsplit("/api/pcm/", 1)[0]


def get_earliest_mtime(session_dir):
    earliest = None
    for f in Path(session_dir).rglob("*"):
        if f.is_file() and f.suffix.lower() in VIDEO_EXT:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if earliest is None or mtime < earliest:
                earliest = mtime
    return earliest


def update_db(base, recording, studio, session_end_at_iso):
    payload = json.dumps({
        "studio": studio,
        "recording": recording,
        "state": "archived",
        "session_end_at": session_end_at_iso,
    }).encode()
    req = urllib.request.Request(
        f"{base}/api/pcm/update",
        data=payload,
        headers={"x-pcm-secret": PCM_SECRET, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def main():
    if not PCM_ENDPOINT or not PCM_SECRET:
        print("ERROR: source /volume1/PCM/config/env.sh first", file=sys.stderr)
        sys.exit(1)

    backup_root = Path("/volume1/Atem Backup")
    if SETTINGS.exists():
        try:
            cfg = json.loads(SETTINGS.read_text())
            backup_root = Path(cfg.get("backup_root", str(backup_root)))
        except Exception:
            pass

    base = base_url()
    updated = skipped = no_files = 0

    studios = sorted(d for d in backup_root.iterdir() if d.is_dir() and d.name.startswith("Studio"))
    for studio_dir in studios:
        for sess_dir in sorted(d for d in studio_dir.iterdir() if d.is_dir()):
            m = SESSION_RE.match(sess_dir.name)
            if not m:
                continue

            studio = studio_dir.name
            mtime  = get_earliest_mtime(sess_dir)
            if mtime is None:
                print(f"  - NO FILES  {sess_dir.name}")
                no_files += 1
                continue

            mtime_sgt = mtime.astimezone(SGT)
            iso       = mtime.isoformat()

            if DRY_RUN:
                print(f"  [dry-run] {sess_dir.name}  → {mtime_sgt.strftime('%H:%M')} SGT")
                updated += 1
                continue

            try:
                update_db(base, sess_dir.name, studio, iso)
                print(f"  ✓  {sess_dir.name}  → {mtime_sgt.strftime('%H:%M')} SGT")
                updated += 1
            except Exception as e:
                print(f"  ✗  {sess_dir.name}  ERROR: {e}", file=sys.stderr)
                skipped += 1

    print(f"\n{'DRY-RUN ' if DRY_RUN else ''}Done: {updated} updated, {skipped} errors, {no_files} no files")


if __name__ == "__main__":
    main()
