#!/usr/bin/env python3
"""
One-off fix for Studio 3 27 — 2026-07-03 11:30 — Uncategorised.

The session end time was recorded as 11:30 (ATEM file-close time) instead of
11:11 (actual recording end from ISO camera files), causing resolve_booking()
to miss the booking window and label it Uncategorised. Correct label: 10:00 — Ram V.

This script:
  1. Renames the NAS folder
  2. Renames the Drive folder via rclone moveto (no re-upload, just metadata)
  3. Updates the pcm_recordings DB record via the API

Usage:
    source /volume1/PCM/config/env.sh
    python3 /volume1/PCM/app/fix_studio3_27.py
    python3 /volume1/PCM/app/fix_studio3_27.py --dry-run
"""

import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv

STUDIO        = "Studio 3"
# upload_drive.py uses the session folder name (not the plain SSD name) as the
# recording key in pcm_recordings when reporting per-session uploads.
RECORDING     = "Studio 3 27 — 2026-07-03 10:00 — Ram V"  # corrected key
OLD_FOLDER    = "Studio 3 27 — 2026-07-03 11:30 — Uncategorised"
NEW_FOLDER    = "Studio 3 27 — 2026-07-03 10:00 — Ram V"
BACKUP_ROOT   = Path("/volume1/Atem Backup")
RCLONE        = Path("/volume1/PCM/bin/rclone")
RCLONE_CONFIG = Path("/volume1/PCM/config/rclone.conf")
DRIVE_REMOTE  = "gdrive"

PCM_ENDPOINT = os.environ.get("PCM_ENDPOINT", "").strip()
PCM_SECRET   = os.environ.get("PCM_SECRET", "").strip()


def log(msg):
    prefix = "[DRY-RUN] " if DRY_RUN else ""
    print(f"{prefix}{msg}")


def api_update(payload):
    base = PCM_ENDPOINT.rsplit("/api/pcm/", 1)[0]
    url  = f"{base}/api/pcm/update"
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        url, data=data,
        headers={"x-pcm-secret": PCM_SECRET, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def main():
    if not PCM_ENDPOINT or not PCM_SECRET:
        print("ERROR: source /volume1/PCM/config/env.sh first", file=sys.stderr)
        sys.exit(1)

    old_nas = BACKUP_ROOT / STUDIO / OLD_FOLDER
    new_nas = BACKUP_ROOT / STUDIO / NEW_FOLDER
    old_drive = f"{DRIVE_REMOTE}:{STUDIO}/{OLD_FOLDER}"
    new_drive = f"{DRIVE_REMOTE}:{STUDIO}/{NEW_FOLDER}"

    print(f"Old: {OLD_FOLDER}")
    print(f"New: {NEW_FOLDER}")
    print()

    # ── 1. Rename NAS folder ──────────────────────────────────────────────────
    if not old_nas.exists():
        print(f"ERROR: NAS folder not found: {old_nas}", file=sys.stderr)
        sys.exit(1)
    if new_nas.exists():
        print(f"ERROR: target NAS folder already exists: {new_nas}", file=sys.stderr)
        sys.exit(1)

    log(f"Renaming NAS folder...")
    log(f"  {old_nas}")
    log(f"  → {new_nas}")
    if not DRY_RUN:
        old_nas.rename(new_nas)
        print("  ✓ NAS folder renamed")

    # ── 2. Rename Drive folder via rclone ────────────────────────────────────
    log(f"\nRenaming Drive folder via rclone...")
    log(f"  {old_drive}")
    log(f"  → {new_drive}")

    rclone_cmd = [
        str(RCLONE), "--config", str(RCLONE_CONFIG),
        "moveto",
        old_drive,
        new_drive,
        "--drive-use-trash=false",
    ]

    if DRY_RUN:
        log(f"  Would run: {' '.join(rclone_cmd)}")
    else:
        result = subprocess.run(rclone_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"ERROR: rclone failed:\n{result.stderr}", file=sys.stderr)
            sys.exit(1)
        print("  ✓ Drive folder renamed")

    # ── 3. Update DB record ──────────────────────────────────────────────────
    log(f"\nUpdating DB record (drive_folder)...")
    payload = {
        "studio":       STUDIO,
        "recording":    RECORDING,
        "state":        "archived",
        "drive_folder": NEW_FOLDER,
    }

    if DRY_RUN:
        log(f"  Would POST: {json.dumps(payload)}")
    else:
        try:
            resp = api_update(payload)
            print(f"  ✓ DB updated: {resp}")
        except Exception as e:
            print(f"ERROR: DB update failed: {e}", file=sys.stderr)
            sys.exit(1)

    print("\nDone." if not DRY_RUN else "\nDry-run complete — no changes made.")


if __name__ == "__main__":
    main()
