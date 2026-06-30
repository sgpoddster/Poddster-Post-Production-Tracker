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
import re
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone, timedelta

SGT = timezone(timedelta(hours=8))
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")
from core.reporter import report

CONFIG        = Path("/volume1/PCM/config/settings.json")
RCLONE        = Path("/volume1/PCM/bin/rclone")
RCLONE_CONFIG = Path("/volume1/PCM/config/rclone.conf")
DRIVE_REMOTE  = "gdrive"
DRIVE_ROOT    = ""  # files go directly under the shared drive root → Studio 2/...


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


def _call_resolve_api(base, secret, studio, date, time_str):
    params = urllib.parse.urlencode({"studio": studio, "date": date, "time": time_str})
    url    = f"{base}/api/pcm/resolve-booking?{params}"
    req    = urllib.request.Request(url, headers={"x-pcm-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("client_name"), data.get("booking_time")
    except Exception as e:
        print(f"[upload] WARNING: resolve-booking API error: {e}")
        return None, None


def resolve_booking(studio, rec_dt):
    """
    Resolve client name from footage_deliveries via the Vercel API.

    Converts rec_dt to SGT first (file mtimes may be from re-copies, offset
    from the original recording date). Tries today in SGT, then ±1 day, so
    a mtime drift of a few hours across midnight doesn't break the match.
    Returns (client_name, booking_time) or (None, None).
    """
    endpoint = os.environ.get("PCM_ENDPOINT", "")
    secret   = os.environ.get("PCM_SECRET", "")
    if not endpoint or not secret:
        return None, None

    base    = endpoint.rsplit("/api/pcm/", 1)[0]
    rec_sgt = rec_dt.astimezone(SGT)

    for delta in (0, -1, 1):
        candidate  = rec_sgt + timedelta(days=delta)
        date_str   = candidate.strftime("%Y-%m-%d")
        time_str   = candidate.strftime("%H:%M")
        client, bt = _call_resolve_api(base, secret, studio, date_str, time_str)
        if client:
            print(f"[upload] Booking found on {date_str}: {client} at {bt}")
            return client, bt

    return None, None


def build_drive_folder_name(studio, recording, client_name, booking_time, rec_dt):
    """
    Build the Drive folder name:
      Studio 4 CORE — 2026-06-30 10:00 — Acme Podcast
    """
    rec_sgt    = rec_dt.astimezone(SGT) if rec_dt else None
    date_str   = rec_sgt.strftime("%Y-%m-%d") if rec_sgt else "unknown-date"
    time_str   = booking_time or (rec_sgt.strftime("%H:%M") if rec_sgt else "")
    client_str = client_name or "Unknown"
    # Avoid doubling the studio name if recording already starts with it
    if recording.lower().startswith(studio.lower()):
        prefix = recording
    else:
        prefix = f"{studio} {recording}"
    return f"{prefix} — {date_str} {time_str} — {client_str}"


def _to_bytes(val, unit):
    unit = unit.upper().replace("IB", "IB")
    mapping = {
        "B": 1, "KIB": 1024, "MIB": 1024**2, "GIB": 1024**3, "TIB": 1024**4,
        "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4,
    }
    return int(float(val) * mapping.get(unit, 1))


def _parse_eta(eta_str):
    """Convert rclone ETA like '8m17s' or '1h30m' to seconds."""
    total = 0
    for val, unit in re.findall(r'(\d+)([hms])', eta_str):
        if unit == 'h':   total += int(val) * 3600
        elif unit == 'm': total += int(val) * 60
        elif unit == 's': total += int(val)
    return total or None


def _parse_rclone_stats(msg):
    """
    Parse the first 'Transferred:' line from a rclone stats block.
    Returns (bytes_done, speed_str, eta_secs) or None.
    """
    m = re.search(
        r'Transferred:\s+([\d.]+)\s+(\w+)\s*/\s*[\d.]+\s*\w+,\s*\d+%,\s*([\d.]+)\s*([\w/]+),\s*ETA\s*(\S+)',
        msg
    )
    if not m:
        return None
    bytes_done  = _to_bytes(m.group(1), m.group(2))
    speed_unit  = m.group(4).split('/')[0]  # "MiB/s" → "MiB"
    speed_bps   = _to_bytes(m.group(3), speed_unit)
    speed_mbps  = speed_bps * 8 / 1_000_000
    speed_str   = f"{speed_mbps:.0f} Mbps"
    eta_secs    = _parse_eta(m.group(5))
    return bytes_done, speed_str, eta_secs


def _report_progress(studio, recording, bytes_transferred, transfer_speed, eta_seconds):
    """Fire-and-forget progress update (does not change state)."""
    from core.reporter import _post
    try:
        _post("/api/pcm/progress", {
            "studio":            studio,
            "recording":         recording,
            "bytes_transferred": bytes_transferred,
            "transfer_speed":    transfer_speed,
            "eta_seconds":       eta_seconds,
        })
    except Exception as e:
        print(f"[upload] progress report failed: {e}")


def rclone_with_progress(studio, recording, *args):
    """Run rclone with JSON log output, parse stats every 10s and push to dashboard."""
    cmd = [
        str(RCLONE), "--config", str(RCLONE_CONFIG),
        "--use-json-log", "--log-level", "INFO",
        "--stats", "10s", "--stats-log-level", "INFO",
        *args,
    ]
    print(f"[rclone] {' '.join(str(a) for a in args)}")

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            msg  = data.get("msg", "")
            if "Transferred:" in msg:
                parsed = _parse_rclone_stats(msg)
                if parsed:
                    bytes_done, speed_str, eta_secs = parsed
                    print(f"[rclone] progress: {speed_str}, ETA {eta_secs}s, {bytes_done:,} bytes")
                    _report_progress(studio, recording, bytes_done, speed_str, eta_secs)
        except (json.JSONDecodeError, KeyError):
            # Non-JSON line — print as-is (rclone --progress fallback)
            print(line)

    proc.wait()
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd)


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

    # Prefer ATEM MDTM timestamp stored by copy_one.py (accurate recording time).
    # Fall back to earliest local file mtime if not present (old manifests).
    rec_dt = None
    if manifest.get("recording_time"):
        try:
            rec_dt = datetime.fromisoformat(manifest["recording_time"])
            print(f"[upload] Recording time (from ATEM MDTM): {rec_dt}")
        except Exception:
            pass
    if not rec_dt:
        rec_dt = get_recording_start(local_dir)
        print(f"[upload] Recording time (from file mtime): {rec_dt}")

    # Resolve client name from booking calendar
    client_name, booking_time = resolve_booking(args.studio, rec_dt) if rec_dt else (None, None)
    print(f"[upload] Booking match: {client_name or 'Unknown'} at {booking_time or '?'}")

    # Build named Drive folder
    drive_folder = build_drive_folder_name(
        args.studio, args.recording, client_name, booking_time, rec_dt
    )
    drive_dest = f"{DRIVE_REMOTE}:{args.studio}/{drive_folder}"

    print(f"\n[upload] Studio:    {args.studio}")
    print(f"[upload] Recording: {args.recording}")
    print(f"[upload] Local:     {local_dir}")
    print(f"[upload] Drive:     {drive_dest}")
    print(f"[upload] Expected:  {expected_files} files / {total_bytes:,} bytes\n")

    report(args.studio, args.recording, "uploading")

    try:
        rclone_with_progress(
            args.studio, args.recording,
            "copy",
            str(local_dir),
            drive_dest,
            "--checksum",
            "--exclude", "pcm_manifest.json",
            "--exclude", ".pcm_copy_complete",
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
             f"{DRIVE_REMOTE}:{args.studio}/"],
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
