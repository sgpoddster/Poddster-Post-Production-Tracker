#!/usr/bin/env python3
"""
PCM Upload Worker — /volume1/PCM/app/upload_drive.py

Uploads a completed NAS recording to Google Drive using rclone.
Handles multi-session ATEM folders: files suffixed 01, 02, 03... are
split into separate Drive folders, each named after the booking they belong to.

Drive path: {studio}/{studio} {recording} — {date} {time} — {client}/

The session end time (ATEM MDTM stored in manifest by copy_one.py) is matched
against footage_deliveries booking windows to resolve the client name.
There is always a 30-minute gap between bookings, so matching is unambiguous.

Prerequisites:
  - rclone installed at /volume1/PCM/bin/rclone
  - Service account JSON at /volume1/PCM/config/service_account.json
  - rclone configured (done by configure_rclone.sh)
  - PCM_ENDPOINT and PCM_SECRET env vars set

Usage:
  python3 /volume1/PCM/app/upload_drive.py --studio "Studio 2" --recording "Studio 2 40"
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

SGT = timezone(timedelta(hours=8))

sys.path.insert(0, "/volume1/PCM/app")
from core.reporter import report

CONFIG        = Path("/volume1/PCM/config/settings.json")
RCLONE        = Path("/volume1/PCM/bin/rclone")
RCLONE_CONFIG = Path("/volume1/PCM/config/rclone.conf")
DRIVE_REMOTE  = "gdrive"
DRIVE_ROOT    = ""  # files go directly under shared drive root → Studio 2/...


def load_config():
    return json.load(open(CONFIG))


def load_manifest(local_dir):
    manifest_path = local_dir / "pcm_manifest.json"
    if not manifest_path.exists():
        raise RuntimeError(f"No manifest found at {manifest_path}")
    return json.loads(manifest_path.read_text())


def detect_sessions(local_dir, manifest):
    """
    Find distinct numeric session suffixes (01, 02...) from ATEM media files.
    Prefers manifest session_times (accurate ATEM MDTM) over local file scan.
    Returns a sorted list of suffix strings, e.g. ['01', '02'].
    """
    if manifest.get("session_times"):
        return sorted(manifest["session_times"].keys())

    pattern  = re.compile(r' (\d{2})\.[a-zA-Z0-9]+$', re.IGNORECASE)
    suffixes = set()
    skip     = {'pcm_manifest.json', '.pcm_copy_complete'}
    for f in Path(local_dir).rglob('*'):
        if f.is_file() and f.name not in skip and not f.name.startswith('.'):
            m = pattern.search(f.name)
            if m:
                suffixes.add(m.group(1))
    return sorted(suffixes) or ['01']


def get_session_end_time(manifest, suffix, local_dir):
    """
    Return the end time (UTC datetime) for a session suffix.
    Uses ATEM MDTM from manifest if available (accurate recording end time).
    Falls back to latest local file mtime for that suffix (less accurate).
    """
    times = manifest.get("session_times", {})
    if suffix in times:
        try:
            return datetime.fromisoformat(times[suffix])
        except Exception:
            pass

    # Fallback: latest mtime of NAS files matching this suffix
    pattern = re.compile(rf' {re.escape(suffix)}\.[a-zA-Z0-9]+$', re.IGNORECASE)
    latest  = None
    for f in Path(local_dir).rglob('*'):
        if f.is_file() and pattern.search(f.name):
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if latest is None or mtime > latest:
                latest = mtime
    return latest


def _call_resolve_api(base, secret, studio, date, end_time):
    """Call resolve-booking with session end time HH:MM (SGT) for booking window matching."""
    params = urllib.parse.urlencode({"studio": studio, "date": date, "end_time": end_time})
    url    = f"{base}/api/pcm/resolve-booking?{params}"
    req    = urllib.request.Request(url, headers={"x-pcm-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("client_name"), data.get("booking_time")
    except Exception as e:
        print(f"[upload] WARNING: resolve-booking API error: {e}")
        return None, None


def resolve_booking(studio, session_end_dt):
    """
    Resolve client name from footage_deliveries by matching session end time
    to a booking window (booking_start <= end_time <= booking_end + 25 min buffer).
    Tries SGT date +/-1 day to handle mtime drift across midnight.
    Returns (client_name, booking_time) or (None, None).
    """
    endpoint = os.environ.get("PCM_ENDPOINT", "")
    secret   = os.environ.get("PCM_SECRET", "")
    if not endpoint or not secret:
        return None, None

    base = endpoint.rsplit("/api/pcm/", 1)[0]
    sgt  = session_end_dt.astimezone(SGT)

    for delta in (0, -1, 1):
        candidate  = sgt + timedelta(days=delta)
        date_str   = candidate.strftime("%Y-%m-%d")
        end_time   = candidate.strftime("%H:%M")
        client, bt = _call_resolve_api(base, secret, studio, date_str, end_time)
        if client:
            print(f"[upload] Booking found on {date_str}: {client} at {bt}")
            return client, bt

    return None, None


def build_drive_folder_name(studio, recording, client_name, booking_time, session_end_dt):
    """
    Build the Drive folder name: Studio 2 40 -- 2026-06-30 13:00 -- Momo
    Date is always from SGT session end time.
    Time is from booking start (more accurate) if resolved, else session end time.
    """
    sgt        = session_end_dt.astimezone(SGT) if session_end_dt else None
    date_str   = sgt.strftime("%Y-%m-%d") if sgt else "unknown-date"
    time_str   = booking_time or (sgt.strftime("%H:%M") if sgt else "")
    client_str = client_name or "Unknown"
    if recording.lower().startswith(studio.lower()):
        prefix = recording
    else:
        prefix = f"{studio} {recording}"
    return f"{prefix} — {date_str} {time_str} — {client_str}"


def get_drive_folder_url(studio, drive_folder):
    """Resolve the Drive folder URL via rclone lsf (returns folder ID)."""
    try:
        result = subprocess.run(
            [str(RCLONE), "--config", str(RCLONE_CONFIG),
             "lsf", "--dirs-only", "--format", "pi",
             f"{DRIVE_REMOTE}:{studio}/"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if drive_folder in line:
                parts = line.split(";")
                if len(parts) >= 2:
                    folder_id = parts[1].strip().rstrip('/')
                    return f"https://drive.google.com/drive/folders/{folder_id}"
    except Exception:
        pass
    return None


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
    bytes_done = _to_bytes(m.group(1), m.group(2))
    speed_unit = m.group(4).split('/')[0]  # "MiB/s" -> "MiB"
    speed_bps  = _to_bytes(m.group(3), speed_unit)
    speed_mbps = speed_bps * 8 / 1_000_000
    speed_str  = f"{speed_mbps:.0f} Mbps"
    eta_secs   = _parse_eta(m.group(5))
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
            print(line)

    proc.wait()
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd)


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

    total_bytes    = manifest.get("total_bytes", 0)
    expected_files = manifest.get("file_count", 0)

    # Detect sessions (01, 02...) -- multi-session ATEM folders split per booking
    sessions = detect_sessions(local_dir, manifest)
    n        = len(sessions)

    print(f"\n[upload] Studio:    {args.studio}")
    print(f"[upload] Recording: {args.recording}")
    print(f"[upload] Local:     {local_dir}")
    print(f"[upload] Sessions:  {sessions} ({n} total)")
    print(f"[upload] Expected:  {expected_files} files / {total_bytes:,} bytes\n")

    report(args.studio, args.recording, "uploading")

    first_drive_url = None

    for suffix in sessions:
        session_end_dt = get_session_end_time(manifest, suffix, local_dir)
        print(f"[upload] --- Session {suffix} ---")
        print(f"[upload] End time: {session_end_dt}")

        if session_end_dt:
            client_name, booking_time = resolve_booking(args.studio, session_end_dt)
        else:
            client_name, booking_time = None, None
        print(f"[upload] Booking: {client_name or 'Unknown'} at {booking_time or '?'}")

        drive_folder = build_drive_folder_name(
            args.studio, args.recording, client_name, booking_time, session_end_dt
        )
        drive_dest = f"{DRIVE_REMOTE}:{args.studio}/{drive_folder}"
        print(f"[upload] Drive: {drive_dest}")

        # Upload only files for this session suffix + shared .drp project file.
        # rclone --include implicitly excludes everything else (no --exclude needed).
        try:
            rclone_with_progress(
                args.studio, args.recording,
                "copy",
                str(local_dir),
                drive_dest,
                "--checksum",
                "--include", f"* {suffix}.*",
                "--include", "*.drp",
                "--transfers", "4",
            )
        except subprocess.CalledProcessError as e:
            report(args.studio, args.recording, "failed",
                   error=f"rclone failed (session {suffix}): {e}")
            raise SystemExit(f"Upload failed: {e}")

        if first_drive_url is None:
            first_drive_url = get_drive_folder_url(args.studio, drive_folder)

    report(
        args.studio, args.recording, "archived",
        drive_url=first_drive_url,
        file_count=expected_files,
        total_bytes=total_bytes,
    )
    print(f"\n[upload] Archived: {n} session(s) uploaded to Drive")

    if not args.no_cleanup:
        print(f"[upload] Deleting NAS copy: {local_dir}")
        import shutil
        shutil.rmtree(local_dir)
        print(f"[upload] NAS copy deleted")
    else:
        print(f"[upload] --no-cleanup set -- NAS copy kept at {local_dir}")


if __name__ == "__main__":
    main()
