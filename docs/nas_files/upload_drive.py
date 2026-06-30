#!/usr/bin/env python3
"""
PCM Upload Worker — /volume1/PCM/app/upload_drive.py

Uploads a completed NAS recording to Google Drive using rclone,
verifies the upload, reports status to the dashboard, then
triggers cleanup once archived.

The Drive folder is named:
  Studio 4 CORE — 2026-06-30 10:00 — Acme Podcast
using the booking calendar (footage_deliveries) to resolve the client name.
Falls back to "Unknown" if no matching booking is found.

Prerequisites:
  - rclone installed at /volume1/PCM/bin/rclone
  - Service account JSON at /volume1/PCM/config/service_account.json
  - rclone configured (done by configure_rclone.sh)
  - PCM_ENDPOINT and PCM_SECRET env vars set

Usage:
  python3 /volume1/PCM/app/upload_drive.py --studio "Studio 1" --recording "Untitled 601"
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")
from core.reporter import report

CONFIG        = Path("/volume1/PCM/config/settings.json")
RCLONE        = Path("/volume1/PCM/bin/rclone")
RCLONE_CONFIG = Path("/volume1/PCM/config/rclone.conf")
DRIVE_REMOTE  = "gdrive"
DRIVE_ROOT    = "ATEM Backups"


def load_config():
    return json.load(open(CONFIG))


def load_manifest(local_dir):
    manifest_path = local_dir / "pcm_manifest.json"
    if not manifest_path.exists():
        raise RuntimeError(f"No manifest found at {manifest_path}")
    return json.loads(manifest_path.read_text())


def get_recording_start(local_dir):
    """
    Find the earliest file modification time in the recording folder.
    Returns a datetime or None.
    """
    earliest = None
    for f in local_dir.rglob("*"):
        if f.is_file() and f.name not in ("pcm_manifest.json", ".pcm_copy_complete"):
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if earliest is None or mtime < earliest:
                earliest = mtime
    return earliest


def resolve_booking(studio, rec_dt):
    """
    Call the Vercel API to resolve client name from footage_deliveries.
    Returns (client_name, booking_time) or (None, None).
    """
    endpoint = os.environ.get("PCM_ENDPOINT", "")
    secret   = os.environ.get("PCM_SECRET", "")
    if not endpoint or not secret:
        return None, None

    base    = endpoint.rsplit("/api/pcm/", 1)[0]
    date    = rec_dt.strftime("%Y-%m-%d")
    time    = rec_dt.strftime("%H:%M")
    params  = urllib.parse.urlencode({"studio": studio, "date": date, "time": time})
    url     = f"{base}/api/pcm/resolve-booking?{params}"

    req = urllib.request.Request(url, headers={"x-pcm-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("client_name"), data.get("booking_time")
    except Exception as e:
        print(f"[upload] WARNING: could not resolve booking: {e}")
        return None, None


def build_drive_folder_name(studio, recording, client_name, booking_time, rec_dt):
    """
    Build the Drive folder name:
      Studio 4 CORE — 2026-06-30 10:00 — Acme Podcast
    """
    date_str   = rec_dt.strftime("%Y-%m-%d") if rec_dt else "unknown-date"
    time_str   = booking_time or (rec_dt.strftime("%H:%M") if rec_dt else "")
    client_str = client_name or "Unknown"
    return f"{studio} {recording} — {date_str} {time_str} — {client_str}"


def rclone(*args):
    cmd = [str(RCLONE), "--config", str(RCLONE_CONFIG), *args]
    print(f"[rclone] {' '.join(str(a) for a in args)}")
    return subprocess.run(cmd, check=True)


def count_drive_files(remote_path):
    result = subprocess.run(
        [str(RCLONE), "--config", str(RCLONE_CONFIG), "ls", remote_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return 0
    lines = [l for l in result.stdout.strip().splitlines() if l.strip()]
    return len(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--studio",     required=True)
    parser.add_argument("--recording",  required=True)
    parser.add_argument("--no-cleanup", action="store_true")
    args = parser.parse_args()

    cfg       = load_config()
    local_dir = Path(cfg["backup_root"]) / args.studio / args.recording

    if not local_dir.exists():
        raise SystemExit(f"Local directory not found: {local_dir}")

    try:
        manifest = load_manifest(local_dir)
    except RuntimeError as e:
        report(args.studio, args.recording, "failed", error=str(e))
        raise SystemExit(str(e))

    expected_files = manifest.get("file_count", 0)
    total_bytes    = manifest.get("total_bytes", 0)

    # Get recording start time from earliest file on NAS
    rec_dt = get_recording_start(local_dir)
    print(f"[upload] Recording start: {rec_dt}")

    # Resolve client name from booking calendar
    client_name, booking_time = resolve_booking(args.studio, rec_dt) if rec_dt else (None, None)
    print(f"[upload] Booking match: {client_name or 'Unknown'} at {booking_time or '?'}")

    # Build named Drive folder
    drive_folder = build_drive_folder_name(
        args.studio, args.recording, client_name, booking_time, rec_dt
    )
    drive_dest = f"{DRIVE_REMOTE}:{DRIVE_ROOT}/{args.studio}/{drive_folder}"

    print(f"\n[upload] Studio:    {args.studio}")
    print(f"[upload] Recording: {args.recording}")
    print(f"[upload] Local:     {local_dir}")
    print(f"[upload] Drive:     {drive_dest}")
    print(f"[upload] Expected:  {expected_files} files / {total_bytes:,} bytes\n")

    report(args.studio, args.recording, "uploading")

    try:
        rclone(
            "copy",
            str(local_dir),
            drive_dest,
            "--checksum",
            "--exclude", "pcm_manifest.json",
            "--exclude", ".pcm_copy_complete",
            "--progress",
            "--transfers", "4",
        )
    except subprocess.CalledProcessError as e:
        report(args.studio, args.recording, "failed", error=f"rclone copy failed: {e}")
        raise SystemExit(f"Upload failed: {e}")

    # Verify file count on Drive
    actual_files = count_drive_files(drive_dest)
    print(f"\n[upload] Verification: expected {expected_files}, found {actual_files} on Drive")

    if actual_files < expected_files:
        err = f"Upload verification failed: expected {expected_files} files, got {actual_files} on Drive"
        report(args.studio, args.recording, "failed", error=err)
        raise SystemExit(err)

    # Get Drive folder URL
    drive_url = None
    try:
        result = subprocess.run(
            [str(RCLONE), "--config", str(RCLONE_CONFIG),
             "lsf", "--dirs-only", "--format", "pi",
             f"{DRIVE_REMOTE}:{DRIVE_ROOT}/{args.studio}/"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if drive_folder in line:
                folder_id = line.split(";")[0].strip()
                drive_url = f"https://drive.google.com/drive/folders/{folder_id}"
                break
    except Exception:
        pass

    report(
        args.studio, args.recording, "archived",
        drive_url=drive_url,
        file_count=actual_files,
        total_bytes=total_bytes,
    )
    print(f"\n[upload] ✓ Archived: {drive_dest}")

    if not args.no_cleanup:
        print(f"[upload] Deleting NAS copy: {local_dir}")
        import shutil
        shutil.rmtree(local_dir)
        print(f"[upload] ✓ NAS copy deleted")
    else:
        print(f"[upload] --no-cleanup set — NAS copy kept at {local_dir}")


if __name__ == "__main__":
    main()
