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
import shutil
import subprocess
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

SGT = timezone(timedelta(hours=8))

# Google Drive shared-drive daily upload limit per service account.
# We stop at 95% to leave headroom for retries and manifest overhead.
QUOTA_LIMIT_BYTES  = 750_000_000_000
QUOTA_SAFE_BYTES   = int(QUOTA_LIMIT_BYTES * 0.95)  # 712.5 GB
EXIT_QUOTA         = 3  # special exit code: quota exhausted, caller should defer

sys.path.insert(0, "/volume1/PCM/app")
from core.reporter import report

CONFIG        = Path("/volume1/PCM/config/settings.json")
RCLONE        = Path("/volume1/PCM/bin/rclone")
RCLONE_CONFIG = Path("/volume1/PCM/config/rclone.conf")
DRIVE_REMOTE  = "gdrive"
DRIVE_ROOT    = ""  # files go directly under shared drive root → Studio 2/...


def load_config():
    return json.load(open(CONFIG))


# ---------------------------------------------------------------------------
# Quota helpers
# ---------------------------------------------------------------------------

def _quota_base():
    endpoint = os.environ.get("PCM_ENDPOINT", "")
    secret   = os.environ.get("PCM_SECRET", "")
    if not endpoint or not secret:
        return None, None
    base = endpoint.rsplit("/api/pcm/", 1)[0]
    return base, secret


def get_quota_used():
    """
    Return bytes uploaded to Drive in the trailing 24 hours. Returns 0 on error.

    Google's 750 GB limit is a ROLLING 24-hour window, not a calendar day, so the
    API sums upload events over the last 24h rather than a per-date counter.
    """
    base, secret = _quota_base()
    if not base:
        return 0
    url = f"{base}/api/pcm/quota"
    req = urllib.request.Request(url, headers={"x-pcm-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("bytes_uploaded", 0)
    except Exception as e:
        print(f"[upload] WARNING: could not fetch quota: {e}")
        return 0


def report_quota(bytes_add, studio=None, recording=None):
    """Record one upload event (actual bytes sent to Drive) in the rolling window."""
    base, secret = _quota_base()
    if not base or bytes_add <= 0:
        return
    payload = json.dumps({
        "bytes_add": bytes_add,
        "studio":    studio,
        "recording": recording,
    }).encode()
    req = urllib.request.Request(
        f"{base}/api/pcm/quota",
        data=payload,
        headers={"x-pcm-secret": secret, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            used = data.get("bytes_uploaded", 0)
            print(f"[upload] Quota updated: {used/1e9:.1f} GB / {QUOTA_LIMIT_BYTES/1e9:.0f} GB used (rolling 24h)")
    except Exception as e:
        print(f"[upload] WARNING: could not report quota: {e}")


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

    Primary: session_times from manifest — the EARLIEST ATEM FTP MDTM across
    all files for this suffix, as recorded by copy_one.py. The ISO camera files
    (.mp4 in Video ISO Files/) end at the actual recording end time. The main
    composite recording (.mp4 in the root) is finalised by the ATEM later, so
    copy_one.py keeps the minimum MDTM to avoid the late finalisation timestamp.

    Fallback: minimum NAS file mtime for files matching this suffix. These are
    set when copy_one.py copies files from SSD, so they're a reasonable proxy
    when the manifest has no session_times.
    """
    # Primary: SSD FTP MDTM captured by copy_one.py (earliest across files)
    times = manifest.get("session_times", {})
    if suffix in times:
        try:
            return datetime.fromisoformat(times[suffix])
        except Exception:
            pass

    # Fallback: earliest NAS file mtime for files matching this suffix
    pattern  = re.compile(rf' {re.escape(suffix)}\.[a-zA-Z0-9]+$', re.IGNORECASE)
    earliest = None
    for f in Path(local_dir).rglob('*'):
        if f.is_file() and pattern.search(f.name):
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if earliest is None or mtime < earliest:
                earliest = mtime
    return earliest


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

    hour = sgt.hour
    # Only try adjacent days when the recording end time is near midnight — the
    # ±1 day fallback exists solely for ATEM MDTM drift that can push a recording
    # that ended late at night just past midnight (or vice-versa). Applying it at
    # noon would match tomorrow's bookings, which is always wrong.
    deltas = [0]
    if hour <= 3:    deltas.append(-1)   # just past midnight → try previous day
    if hour >= 21:   deltas.append(+1)   # late night → might drift to next day

    for delta in deltas:
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
    client_str = client_name or "Uncategorised"
    if recording.lower().startswith(studio.lower()):
        prefix = recording
    else:
        prefix = f"{studio} {recording}"
    return f"{prefix} — {date_str} {time_str} — {client_str}"


def get_drive_folder_url(studio, drive_folder):
    """Resolve the Drive folder URL via rclone lsjson (unambiguous JSON ID field)."""
    try:
        result = subprocess.run(
            [str(RCLONE), "--config", str(RCLONE_CONFIG),
             "lsjson", "--dirs-only",
             f"{DRIVE_REMOTE}:{studio}/"],
            capture_output=True, text=True
        )
        items = json.loads(result.stdout)
        for item in items:
            if item.get("Name") == drive_folder:
                folder_id = item.get("ID", "")
                if folder_id:
                    return f"https://drive.google.com/drive/folders/{folder_id}"
    except Exception:
        pass
    return None


def _move_session_files(src_dir: Path, dst_dir: Path, suffix: str):
    """
    Move files for `suffix` from staging src_dir to session dst_dir (a sibling folder).
    Also copies the .drp project file (shared across sessions, deleted from staging later).
    Maintains subdirectory structure.
    """
    suffix_pattern = re.compile(rf' {re.escape(suffix)}\.[a-zA-Z0-9]+$', re.IGNORECASE)
    skip = {'pcm_manifest.json', '.pcm_copy_complete'}
    dst_dir.mkdir(parents=True, exist_ok=True)

    for src in sorted(src_dir.rglob('*')):
        if not src.is_file():
            continue
        name = src.name
        if name.startswith('.') or name in skip:
            continue
        rel = src.relative_to(src_dir)
        dst = dst_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if suffix_pattern.search(name):
            shutil.move(str(src), str(dst))
        elif name.lower().endswith('.drp') and not dst.exists():
            shutil.copy2(str(src), str(dst))


def _suffix_in_sibling(backup_root: Path, studio: str, recording: str, suffix: str):
    """
    Return the sibling session folder Path if it already contains files for
    `suffix`, else None.

    When discover.py re-queues a recording after detecting new SSD sessions,
    copy_one.py re-copies ALL files from the SSD to a fresh staging folder.
    The ATEM can update file MDTMs between sessions, so an earlier suffix may
    resolve to a different booking name on the second run — and upload_drive.py
    would create a new session folder with duplicated content.  This guard
    prevents that by checking whether ANY existing sibling folder already holds
    files for the suffix before proceeding.
    """
    suffix_pattern = re.compile(rf' {re.escape(suffix)}\.[a-zA-Z0-9]+$', re.IGNORECASE)
    studio_dir = backup_root / studio
    prefix = recording + " — "  # em dash separator used in session folder names
    try:
        for candidate in sorted(studio_dir.iterdir()):
            if not candidate.is_dir() or not candidate.name.startswith(prefix):
                continue
            for f in candidate.rglob('*'):
                if f.is_file() and suffix_pattern.search(f.name):
                    return candidate
    except OSError:
        pass
    return None


def _count_and_size(path: Path):
    """Return (file_count, total_bytes) for all files under path."""
    count, size = 0, 0
    for f in path.rglob('*'):
        if f.is_file():
            count += 1
            try:
                size += f.stat().st_size
            except OSError:
                pass
    return count, size


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
    """
    Run rclone with JSON log output, parse stats every 10s and push to dashboard.
    Returns the actual bytes transferred (last cumulative 'Transferred:' figure).
    Files skipped by --checksum count as ~0, so duplicate uploads don't inflate
    the Drive quota counter.
    """
    cmd = [
        str(RCLONE), "--config", str(RCLONE_CONFIG),
        "--use-json-log", "--log-level", "INFO",
        "--stats", "10s", "--stats-log-level", "INFO",
        *args,
    ]
    print(f"[rclone] {' '.join(str(a) for a in args)}")

    last_bytes_done = 0
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
                    last_bytes_done = bytes_done
                    print(f"[rclone] progress: {speed_str}, ETA {eta_secs}s, {bytes_done:,} bytes")
                    _report_progress(studio, recording, bytes_done, speed_str, eta_secs)
        except (json.JSONDecodeError, KeyError):
            print(line)

    proc.wait()
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd)
    return last_bytes_done


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--studio",    required=True)
    parser.add_argument("--recording", required=True)
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

    # --- Quota check (rolling 24h window) ---
    bytes_used = get_quota_used()
    remaining = QUOTA_SAFE_BYTES - bytes_used
    print(f"[upload] Drive quota (rolling 24h): {bytes_used/1e9:.1f} / {QUOTA_LIMIT_BYTES/1e9:.0f} GB used, "
          f"{remaining/1e9:.1f} GB remaining (safe limit)")
    if total_bytes > 0 and total_bytes > remaining:
        print(f"[upload] QUOTA EXCEEDED: need {total_bytes/1e9:.1f} GB but only {remaining/1e9:.1f} GB remaining — deferring")
        sys.exit(EXIT_QUOTA)

    # Detect sessions (01, 02...) -- multi-session ATEM folders split per booking
    sessions = detect_sessions(local_dir, manifest)
    n        = len(sessions)

    print(f"\n[upload] Studio:    {args.studio}")
    print(f"[upload] Recording: {args.recording}")
    print(f"[upload] Local:     {local_dir}")
    print(f"[upload] Sessions:  {sessions} ({n} total)")
    print(f"[upload] Expected:  {expected_files} files / {total_bytes:,} bytes\n")

    report(args.studio, args.recording, "uploading")

    backup_root           = Path(cfg["backup_root"])
    actual_uploaded_bytes = 0  # real bytes sent to Drive (0 for checksum-skipped files)
    new_sessions          = 0

    for suffix in sessions:
        session_end_dt = get_session_end_time(manifest, suffix, local_dir)
        print(f"[upload] --- Session {suffix} ---")
        print(f"[upload] End time: {session_end_dt}")

        if session_end_dt:
            client_name, booking_time = resolve_booking(args.studio, session_end_dt)
        else:
            client_name, booking_time = None, None
        print(f"[upload] Booking: {client_name or 'Uncategorised'} at {booking_time or '?'}")

        drive_folder     = build_drive_folder_name(
            args.studio, args.recording, client_name, booking_time, session_end_dt
        )
        drive_dest       = f"{DRIVE_REMOTE}:{args.studio}/{drive_folder}"
        session_nas_dir  = backup_root / args.studio / drive_folder

        # Guard: if any sibling session folder already holds files for this suffix,
        # skip — the files were organised on a prior run. This catches the case
        # where discover.py re-queued the recording after new SSD sessions appeared
        # and the SSD MDTM for an older suffix changed (causing it to resolve to a
        # different booking name), which would otherwise create a duplicate folder.
        existing_sibling = _suffix_in_sibling(backup_root, args.studio, args.recording, suffix)
        if existing_sibling:
            print(f"[upload] Suffix {suffix} already in '{existing_sibling.name}' — skipping")
            continue

        # If we've already organised this session (from a previous run of this
        # recording), skip upload + file-move but still continue to the next session.
        if session_nas_dir.exists():
            print(f"[upload] Session {suffix} already organised → {drive_folder} (skipping)")
            continue

        print(f"[upload] Drive: {drive_dest}")

        # Upload only files for this session suffix + shared .drp project file.
        # rclone --include implicitly excludes everything else (no --exclude needed).
        try:
            actual_uploaded_bytes += rclone_with_progress(
                args.studio, args.recording,
                "copy",
                str(local_dir),
                drive_dest,
                "--checksum",
                # Ground truth: stop hard the moment Google returns the real 750 GB
                # rolling-limit error, instead of retrying into a wall. rclone exits 8.
                "--drive-stop-on-upload-limit",
                "--include", f"* {suffix}.*",
                "--include", "*.drp",
                "--transfers", "4",
            )
        except subprocess.CalledProcessError as e:
            if e.returncode == 8:
                print(f"[upload] Google reported the 750 GB rolling limit (rclone exit 8) — deferring {args.recording}")
                report(args.studio, args.recording, "copy_complete")
                if actual_uploaded_bytes > 0:
                    partial = min(actual_uploaded_bytes, total_bytes) if total_bytes > 0 else actual_uploaded_bytes
                    report_quota(partial, studio=args.studio, recording=args.recording)
                sys.exit(EXIT_QUOTA)
            report(args.studio, args.recording, "failed",
                   error=f"rclone failed (session {suffix}): {e}")
            raise SystemExit(f"Upload failed: {e}")

        # Move session files from staging to their permanent named NAS folder.
        _move_session_files(local_dir, session_nas_dir, suffix)
        session_file_count, session_bytes = _count_and_size(session_nas_dir)

        session_drive_url = get_drive_folder_url(args.studio, drive_folder)

        # Report this session as its own DB row (recording = session folder name).
        report(
            args.studio, drive_folder, "archived",
            drive_url=session_drive_url,
            drive_folder=drive_folder,
            nas_path=str(session_nas_dir),
            file_count=session_file_count,
            total_bytes=session_bytes,
            session_end_at=session_end_dt.isoformat() if session_end_dt else None,
        )
        new_sessions += 1
        print(f"[upload] Session {suffix} → {drive_folder}")

    # Delete the staging folder — all session files have been moved to named sibling
    # folders (or were already there from a previous run).
    try:
        shutil.rmtree(str(local_dir))
        print(f"[upload] Removed staging dir: {local_dir.name}")
    except Exception as e:
        print(f"[upload] WARNING: could not remove staging dir: {e}")

    # Mark the original staging row as 'split' so it disappears from the dashboard.
    report(args.studio, args.recording, "split")

    # Report bytes sent to Drive, capped at the recording's real size.
    quota_bytes = min(actual_uploaded_bytes, total_bytes) if total_bytes > 0 else actual_uploaded_bytes
    report_quota(quota_bytes, studio=args.studio, recording=args.recording)
    print(f"\n[upload] Done: {new_sessions} new session(s) uploaded, {n - new_sessions} already organised.")


if __name__ == "__main__":
    main()
