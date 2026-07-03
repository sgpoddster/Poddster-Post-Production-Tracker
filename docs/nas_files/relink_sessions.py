#!/usr/bin/env python3
"""
One-time NAS audit: re-resolve booking links for all existing session folders
using NAS file mtime (more accurate than ATEM FTP MDTM).

The ATEM updates a recording file's MDTM when it closes/finalises the session
(up to 10-20 min after the last video frame), which can push the end_time
outside the booking window and cause sessions to be named "Uncategorised".
NAS file mtime (set when copy_one.py wrote the file) is a better proxy for
actual recording end time.

This script is READ-ONLY — it reports what the booking resolution would now
produce but does not rename any folders.

Usage:
    source /volume1/PCM/config/env.sh
    python3 /volume1/PCM/app/relink_sessions.py
    python3 /volume1/PCM/app/relink_sessions.py --studio "Studio 3"
    python3 /volume1/PCM/app/relink_sessions.py --uncategorised-only
    python3 /volume1/PCM/app/relink_sessions.py --verbose

Output key:
    ★ FIXED      Folder named "Uncategorised" — NAS mtime now matches a booking
    ~ UNRESOLVED Folder named "Uncategorised" — still no booking match with mtime
    ✓ CORRECT    Already named with a client — mtime confirms same booking
    ✗ WRONG      Already named with a client — mtime says different booking
    ? MTIME MISS Already named with a client — mtime outside booking window
                 (may be a long copy, or the NAS mtime was reset)
    - NO FILES   Session folder contains no video files to check
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

# ── Config from environment ────────────────────────────────────────────────────
PCM_ENDPOINT = os.environ.get("PCM_ENDPOINT", "").strip()
PCM_SECRET   = os.environ.get("PCM_SECRET", "").strip()
SETTINGS     = Path("/volume1/PCM/config/settings.json")

SGT = timezone(timedelta(hours=8))
VIDEO_EXT = {".mp4", ".mov", ".mts", ".m2ts", ".mkv"}

# Session folders sit directly under the studio dir:
#   "Studio 3 27 — 2026-07-03 11:30 — Uncategorised"
#   "Studio 1 5 — 2026-06-15 10:00 — Poddster Media"
SESSION_RE = re.compile(
    r"^(.+?) — (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) — (.+)$"
)


def base_url():
    if not PCM_ENDPOINT:
        return ""
    return PCM_ENDPOINT.rsplit("/api/pcm/", 1)[0]


def get_nas_mtime(session_dir):
    """
    Return the EARLIEST mtime of video files inside this session folder (UTC).

    The ISO camera files (.mp4 in Video ISO Files/) are copied first and reflect
    the actual recording end time. The main composite recording is the largest file,
    copied last, and its mtime reflects ATEM finalisation — not recording end.
    Taking the minimum gives the best proxy for when recording actually stopped.
    """
    earliest = None
    for f in Path(session_dir).rglob("*"):
        if f.is_file() and f.suffix.lower() in VIDEO_EXT:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if earliest is None or mtime < earliest:
                earliest = mtime
    return earliest


def resolve_booking(base, studio, date, end_time_sgt):
    """Call resolve-booking API; return (client_name, booking_time) or (None, None)."""
    params = urllib.parse.urlencode(
        {"studio": studio, "date": date, "end_time": end_time_sgt}
    )
    url = f"{base}/api/pcm/resolve-booking?{params}"
    req = urllib.request.Request(url, headers={"x-pcm-secret": PCM_SECRET})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("client_name"), data.get("booking_time")
    except urllib.error.HTTPError as e:
        print(f"    API HTTP {e.code}: {url}", file=sys.stderr)
    except Exception as e:
        print(f"    API error: {e}", file=sys.stderr)
    return None, None


def main():
    if not PCM_ENDPOINT or not PCM_SECRET:
        print(
            "ERROR: PCM_ENDPOINT and PCM_SECRET must be set.\n"
            "  source /volume1/PCM/config/env.sh",
            file=sys.stderr,
        )
        sys.exit(1)

    filter_studio      = None
    uncategorised_only = False
    verbose            = False

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--studio" and i + 1 < len(args):
            filter_studio = args[i + 1]
            i += 2
        elif args[i] == "--uncategorised-only":
            uncategorised_only = True
            i += 1
        elif args[i] in ("--verbose", "-v"):
            verbose = True
            i += 1
        else:
            i += 1

    backup_root = Path("/volume1/Atem Backup")
    if SETTINGS.exists():
        try:
            cfg = json.loads(SETTINGS.read_text())
            backup_root = Path(cfg.get("backup_root", str(backup_root)))
        except Exception:
            pass

    base = base_url()

    print(f"Backup root : {backup_root}")
    print(f"API base    : {base}")
    print()

    studios = sorted(
        d for d in backup_root.iterdir()
        if d.is_dir() and d.name.startswith("Studio")
        and (filter_studio is None or d.name == filter_studio)
    )

    if not studios:
        print("No studio directories found (check backup_root or --studio name).")
        sys.exit(0)

    counts = {
        "fixed": 0, "unresolved": 0, "correct": 0, "wrong": 0,
        "mtime_miss": 0, "no_files": 0, "total": 0,
    }

    for studio_dir in studios:
        studio = studio_dir.name
        header_printed = False

        for sess_dir in sorted(d for d in studio_dir.iterdir() if d.is_dir()):
            m = SESSION_RE.match(sess_dir.name)
            if not m:
                continue

            date           = m.group(2)
            time_in_name   = m.group(3)
            client_in_name = m.group(4).strip()
            is_uncat       = client_in_name.lower() == "uncategorised"

            if uncategorised_only and not is_uncat:
                continue

            counts["total"] += 1

            if not header_printed:
                print(f"{'='*64}")
                print(f"  {studio}")
                print(f"{'='*64}")
                header_printed = True

            mtime_utc = get_nas_mtime(sess_dir)
            if mtime_utc is None:
                print(f"  - NO FILES   {sess_dir.name}")
                counts["no_files"] += 1
                continue

            mtime_sgt    = mtime_utc.astimezone(SGT)
            end_time_sgt = mtime_sgt.strftime("%H:%M")

            new_client, new_booking_time = resolve_booking(base, studio, date, end_time_sgt)

            if is_uncat:
                if new_client:
                    print(f"  ★ FIXED      {sess_dir.name}")
                    print(f"               → {new_booking_time} — {new_client}  (mtime {end_time_sgt})")
                    counts["fixed"] += 1
                else:
                    print(f"  ~ UNRESOLVED {sess_dir.name}  (mtime {end_time_sgt})")
                    counts["unresolved"] += 1
            else:
                if new_client and new_client.strip().lower() != client_in_name.lower():
                    print(f"  ✗ WRONG      {sess_dir.name}")
                    print(f"               → {new_booking_time} — {new_client}  (mtime {end_time_sgt})")
                    counts["wrong"] += 1
                elif not new_client:
                    if verbose:
                        print(f"  ? MTIME MISS {sess_dir.name}  (mtime {end_time_sgt}, name says {time_in_name})")
                    counts["mtime_miss"] += 1
                else:
                    if verbose:
                        print(f"  ✓ CORRECT    {sess_dir.name}  (mtime {end_time_sgt})")
                    counts["correct"] += 1

    print()
    print(f"{'='*64}")
    print(f"SUMMARY  ({counts['total']} session folders scanned)")
    print(f"  ★ FIXED       {counts['fixed']:3d}   (Uncategorised → booking found)")
    print(f"  ~ UNRESOLVED  {counts['unresolved']:3d}   (Uncategorised, still no match)")
    print(f"  ✓ CORRECT     {counts['correct']:3d}   (already named correctly)")
    print(f"  ✗ WRONG       {counts['wrong']:3d}   (client name mismatch)")
    print(f"  ? MTIME MISS  {counts['mtime_miss']:3d}   (mtime outside window, name may still be right)")
    print(f"  - NO FILES    {counts['no_files']:3d}   (no video files to check)")


if __name__ == "__main__":
    main()
