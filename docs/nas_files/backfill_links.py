#!/usr/bin/env python3
"""
PCM Drive Link Backfill — /volume1/PCM/app/backfill_links.py

One-shot tool: finds archived recordings with no drive_url in the DB and
resolves their Drive folder URL via rclone, then updates the DB.

Usage:
  source /volume1/PCM/config/env.sh
  python3 /volume1/PCM/app/backfill_links.py [--dry-run]
"""

import argparse
import json
import subprocess
import sys
import urllib.request
import urllib.error
import os

RCLONE        = "/volume1/PCM/bin/rclone"
RCLONE_CONFIG = "/volume1/PCM/config/rclone.conf"
DRIVE_REMOTE  = "gdrive"


def get_endpoint_and_secret():
    endpoint = os.environ.get("PCM_ENDPOINT", "")
    secret   = os.environ.get("PCM_SECRET", "")
    if not endpoint or not secret:
        sys.exit("ERROR: PCM_ENDPOINT and PCM_SECRET must be set. Run: source /volume1/PCM/config/env.sh")
    base = endpoint.rsplit("/api/pcm/", 1)[0]
    return base, secret


def fetch_missing(base, secret):
    """Fetch recordings where state=archived and drive_url IS NULL."""
    url = f"{base}/api/pcm/backfill-links"
    req = urllib.request.Request(url, headers={"x-pcm-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            return data.get("recordings", [])
    except urllib.error.HTTPError as e:
        sys.exit(f"ERROR fetching missing links: {e.code} {e.reason}")
    except Exception as e:
        sys.exit(f"ERROR fetching missing links: {e}")


def list_drive_folders(studio):
    """Return a dict of folder_name → folder_id for the studio's Drive folder."""
    result = subprocess.run(
        [RCLONE, "--config", RCLONE_CONFIG,
         "lsjson", "--dirs-only",
         f"{DRIVE_REMOTE}:{studio}/"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  [rclone] WARNING: lsjson failed for {studio}: {result.stderr.strip()}")
        return {}
    try:
        items = json.loads(result.stdout)
        return {item["Name"]: item.get("ID", "") for item in items if item.get("IsDir")}
    except (json.JSONDecodeError, KeyError):
        return {}


def post_update(base, secret, studio, recording, drive_url, drive_folder, dry_run):
    """Update drive_url and drive_folder on the DB row via the update endpoint."""
    if dry_run:
        print(f"  [dry-run] would update: drive_url={drive_url}")
        return True

    payload = json.dumps({
        "studio":       studio,
        "recording":    recording,
        "state":        "archived",
        "drive_url":    drive_url,
        "drive_folder": drive_folder,
    }).encode()
    req = urllib.request.Request(
        f"{base}/api/pcm/update",
        data=payload,
        headers={"x-pcm-secret": secret, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            return data.get("ok", False)
    except Exception as e:
        print(f"  ERROR posting update: {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="List what would be updated without writing")
    args = parser.parse_args()

    base, secret = get_endpoint_and_secret()

    print("[backfill] Fetching archived recordings with missing drive_url...")
    recordings = fetch_missing(base, secret)

    if not recordings:
        print("[backfill] Nothing to backfill — all archived recordings have a drive_url.")
        return

    print(f"[backfill] Found {len(recordings)} recording(s) to backfill:\n")

    # Group by studio to minimise rclone lsjson calls
    by_studio: dict[str, list[dict]] = {}
    for r in recordings:
        by_studio.setdefault(r["studio"], []).append(r)

    updated = 0
    skipped = 0

    for studio, rows in by_studio.items():
        print(f"[backfill] Studio: {studio}")
        folders = list_drive_folders(studio)
        print(f"  Found {len(folders)} Drive folder(s)")

        for row in rows:
            recording    = row["recording"]
            saved_folder = row.get("drive_folder")  # name stored during upload (may be None)

            # Strategy 1: exact match on saved drive_folder name
            folder_name = None
            if saved_folder and saved_folder in folders:
                folder_name = saved_folder
                print(f"  {recording}: matched via saved drive_folder → {folder_name}")
            else:
                # Strategy 2: find Drive folders whose name starts with the recording name
                candidates = [name for name in folders if name.startswith(recording + " —")]
                if len(candidates) == 1:
                    folder_name = candidates[0]
                    print(f"  {recording}: matched by prefix → {folder_name}")
                elif len(candidates) > 1:
                    # Multiple sessions uploaded separately — take the first alphabetically
                    # (earliest date, which is typically the primary session)
                    folder_name = sorted(candidates)[0]
                    print(f"  {recording}: {len(candidates)} candidates, using first → {folder_name}")
                else:
                    print(f"  {recording}: NO MATCH in Drive folder for '{studio}'")
                    skipped += 1
                    continue

            folder_id = folders[folder_name]
            if not folder_id:
                print(f"  {recording}: folder found but has no ID — skipping")
                skipped += 1
                continue

            drive_url = f"https://drive.google.com/drive/folders/{folder_id}"
            ok = post_update(base, secret, studio, recording, drive_url, folder_name, args.dry_run)
            if ok:
                print(f"  {recording}: ✓ updated drive_url")
                updated += 1
            else:
                print(f"  {recording}: ✗ update failed")
                skipped += 1

        print()

    print(f"[backfill] Done. Updated: {updated}  Skipped/failed: {skipped}")
    if args.dry_run:
        print("[backfill] DRY RUN — no changes written.")


if __name__ == "__main__":
    main()
