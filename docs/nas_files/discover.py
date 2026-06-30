#!/usr/bin/env python3
"""
PCM Discovery Worker — /volume1/PCM/app/discover.py

Scans all enabled ATEM studios via FTP in parallel (one thread per studio),
finds recording folders that are:
  - Not system/hidden folders
  - At least min_age_minutes old (so the ATEM has finished writing)
  - On or after min_date (to skip old backlog recordings)
  - Not already tracked in the PCM state file

Copy (ATEM → NAS) happens immediately on discovery.
Upload (NAS → Drive) only runs inside the configured upload window
(default 00:00–08:00) so Drive transfers don't compete with daytime bandwidth.

Failed recordings are auto-retried up to MAX_RETRIES times; after that
they become 'gave_up' and require manual intervention.

Run manually:        python3 /volume1/PCM/app/discover.py
Run via cron:        Add to Synology Task Scheduler (every 15 mins)
"""

import json
import subprocess
import sys
import threading
import urllib.request
import urllib.error
import urllib.parse
import os
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")

from core.ftp_copy import connect, list_names, is_dir
from core.reporter import report

CONFIG     = Path("/volume1/PCM/config/settings.json")
STATE_FILE = Path("/volume1/PCM/config/state.json")

MAX_RETRIES = 5

IGNORE_EXACT = {
    "System Volume Information", "$RECYCLE.BIN", ".Spotlight-V100",
    ".Trashes", ".fseventsd", "FOUND.000", "TemporaryItems",
}
IGNORE_PREFIXES = (".", "._", "@", "#", "$")

DONE_STATES   = {"archived", "gave_up"}
ACTIVE_STATES = {"copying", "uploading", "discovered"}

# Thread lock for shared state dict + counters
_state_lock = threading.Lock()


def ignore(name):
    return (
        name in IGNORE_EXACT
        or name.startswith(IGNORE_PREFIXES)
        or name.lower().endswith((".exe", ".dmg", ".txt", ".plist"))
        or name.lower().startswith("install sandisk")
    )


def load_config():
    return json.load(open(CONFIG))


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ---------------------------------------------------------------------------
# State helpers — always call under _state_lock
# ---------------------------------------------------------------------------

def _entry(state, key):
    val = state.get(key)
    if val is None:
        return None
    if isinstance(val, str):
        return {"status": val, "retries": 0}
    return val


def get_status(state, key):
    e = _entry(state, key)
    return e["status"] if e else None


def get_retries(state, key):
    e = _entry(state, key)
    return e.get("retries", 0) if e else 0


def set_status(state, key, status, retries=None):
    current_retries = get_retries(state, key)
    state[key] = {
        "status":  status,
        "retries": retries if retries is not None else current_retries,
    }


# ---------------------------------------------------------------------------
# Upload window
# ---------------------------------------------------------------------------

def in_upload_window(cfg):
    window = cfg.get("upload_window", {})
    start  = window.get("start_hour", 0)
    end    = window.get("end_hour",   8)
    now_h  = datetime.now().hour
    if start <= end:
        return start <= now_h < end
    return now_h >= start or now_h < end


# ---------------------------------------------------------------------------
# Min-date filter
# ---------------------------------------------------------------------------

def recording_is_too_old(ftp, root, folder, min_date_str):
    """Return True if the recording's MDTM date is before min_date."""
    if not min_date_str:
        return False
    try:
        min_date = datetime.strptime(min_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        path = root.rstrip("/") + "/" + folder
        resp = ftp.sendcmd(f"MDTM {path}")
        ts_str = resp.split()[-1]
        ts = datetime.strptime(ts_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        return ts < min_date
    except Exception:
        return False


# ---------------------------------------------------------------------------
# SSD capacity
# ---------------------------------------------------------------------------

def _ftp_dir_size(ftp, path, depth=0):
    """Recursively sum file sizes via FTP DIR listings (max 4 levels deep)."""
    if depth > 4:
        return 0
    total = 0
    try:
        lines = []
        ftp.dir(path, lines.append)
        for line in lines:
            parts = line.split(None, 8)
            if len(parts) < 9:
                continue
            name = parts[8]
            if name in ('.', '..') or ignore(name):
                continue
            child = path.rstrip('/') + '/' + name
            if line.startswith('d'):
                total += _ftp_dir_size(ftp, child, depth + 1)
            else:
                try:
                    total += int(parts[4])
                except ValueError:
                    pass
    except Exception:
        pass
    return total


def get_ssd_stats(ftp, root, studio_cfg=None):
    """
    Compute SSD usage by recursively summing file sizes via FTP.
    total_bytes comes from ssd_capacity_bytes in studio config (if set).
    """
    used_bytes  = _ftp_dir_size(ftp, root)
    total_bytes = None
    free_bytes  = None

    if studio_cfg:
        cap = studio_cfg.get("ssd_capacity_bytes")
        if cap:
            total_bytes = int(cap)
            free_bytes  = max(0, total_bytes - used_bytes)

    return {
        "used_bytes":  used_bytes  if used_bytes  else None,
        "free_bytes":  free_bytes,
        "total_bytes": total_bytes,
    }


def report_studio_stats(name, stats):
    if not stats:
        return
    from core.reporter import _post
    try:
        _post("/api/pcm/studio-status", {
            "studio":      name,
            "used_bytes":  stats.get("used_bytes"),
            "free_bytes":  stats.get("free_bytes"),
            "total_bytes": stats.get("total_bytes"),
            "ssd_root":    stats.get("ssd_root"),
        })
    except Exception as e:
        print(f"[{name}] WARNING: could not report SSD stats: {e}")


# ---------------------------------------------------------------------------

def find_ssd_root(ftp, studio_cfg):
    if studio_cfg.get("ssd_root"):
        return studio_cfg["ssd_root"]

    for item in list_names(ftp, "/"):
        if ignore(item):
            continue
        if "ssd" in item.lower() and is_dir(ftp, "/" + item):
            return "/" + item

    for item in list_names(ftp, "/"):
        if ignore(item):
            continue
        if is_dir(ftp, "/" + item):
            return "/" + item

    return "/"


def recording_looks_complete(ftp, root, folder, min_age_minutes):
    path = root.rstrip("/") + "/" + folder
    try:
        resp = ftp.sendcmd(f"MDTM {path}")
        ts_str = resp.split()[-1]
        ts = datetime.strptime(ts_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        age_minutes = (datetime.now(timezone.utc) - ts).total_seconds() / 60
        return age_minutes >= min_age_minutes
    except Exception:
        return True


def run_upload(name, folder, retries, state, key):
    upload_bin = Path("/volume1/PCM/app/upload_drive.py")
    if not upload_bin.exists():
        print(f"[{name}]   upload_drive.py not found — skipping")
        return False

    print(f"[{name}]   uploading to Drive: {folder}")
    result = subprocess.run(
        [sys.executable, str(upload_bin), "--studio", name, "--recording", folder],
        capture_output=False,
    )

    if result.returncode == 0:
        with _state_lock:
            set_status(state, key, "archived", 0)
            save_state(state)
        return True

    new_retries = retries + 1
    with _state_lock:
        if new_retries >= MAX_RETRIES:
            set_status(state, key, "gave_up", new_retries)
            save_state(state)
            report(name, folder, "gave_up",
                   error=f"Upload gave up after {new_retries} attempts — manual intervention required",
                   retry_count=new_retries)
        else:
            set_status(state, key, "failed", new_retries)
            save_state(state)
            report(name, folder, "failed",
                   error=f"Upload failed — will auto-retry (attempt {new_retries}/{MAX_RETRIES})",
                   retry_count=new_retries)
    return False


# ---------------------------------------------------------------------------
# Per-studio worker (runs in its own thread)
# ---------------------------------------------------------------------------

def scan_studio(studio_cfg, cfg, state, in_window, counters):
    name     = studio_cfg["name"]
    ip       = studio_cfg["ip"]
    ftp_cfg  = cfg["ftp"]
    min_age  = cfg.get("min_age_minutes", 15)
    min_date = cfg.get("min_date", "")

    print(f"\n[{name}] Scanning ({ip})…")

    try:
        ftp  = connect(ip, ftp_cfg["username"], ftp_cfg["password"], ftp_cfg["timeout_seconds"])
        root = find_ssd_root(ftp, studio_cfg)
        print(f"[{name}] SSD root: {root}")

        stats = get_ssd_stats(ftp, root, studio_cfg)
        if stats:
            stats['ssd_root'] = root
            print(f"[{name}] SSD root={root}, used={stats.get('used_bytes')}, free={stats.get('free_bytes')}")
            report_studio_stats(name, stats)

        for folder in list_names(ftp, root):
            if ignore(folder):
                continue

            full_path = root.rstrip("/") + "/" + folder
            if not is_dir(ftp, full_path):
                continue

            key = f"{name}|{folder}"

            with _state_lock:
                status  = get_status(state, key)
                retries = get_retries(state, key)

            # ── Already done or in-flight ────────────────────────────────
            if status in DONE_STATES or status in ACTIVE_STATES:
                print(f"[{name}]   skip: {folder} ({status})")
                continue

            # ── Min-date filter ──────────────────────────────────────────
            if recording_is_too_old(ftp, root, folder, min_date):
                print(f"[{name}]   too old, skipping: {folder}")
                continue

            # ── copy_complete: upload if in window ───────────────────────
            if status == "copy_complete":
                if in_window:
                    run_upload(name, folder, retries, state, key)
                else:
                    counters["deferred"] += 1
                    print(f"[{name}]   deferred (outside upload window): {folder}")
                continue

            # ── failed: retry ────────────────────────────────────────────
            if status == "failed":
                if retries >= MAX_RETRIES:
                    print(f"[{name}]   gave up ({retries} retries): {folder}")
                    with _state_lock:
                        set_status(state, key, "gave_up", retries)
                        save_state(state)
                    report(name, folder, "gave_up",
                           error=f"Gave up after {retries} attempts — manual intervention required",
                           retry_count=retries)
                    continue
                print(f"[{name}]   retry {retries + 1}/{MAX_RETRIES}: {folder}")

            # ── Age check ────────────────────────────────────────────────
            if not recording_looks_complete(ftp, root, folder, min_age):
                print(f"[{name}]   too recent, skipping: {folder}")
                continue

            # ── New recording ────────────────────────────────────────────
            if status is None:
                print(f"[{name}]   NEW: {folder}")
                report(name, folder, "discovered")
                with _state_lock:
                    set_status(state, key, "discovered", 0)
                    save_state(state)
                counters["found"] += 1

            # ── Copy ATEM → NAS ──────────────────────────────────────────
            print(f"[{name}]   copying: {folder}")
            copy_result = subprocess.run(
                [sys.executable, "/volume1/PCM/app/copy_one.py",
                 "--studio", name, "--root", root, "--recording", folder],
                capture_output=False,
            )

            if copy_result.returncode != 0:
                new_retries = retries + 1
                with _state_lock:
                    if new_retries >= MAX_RETRIES:
                        set_status(state, key, "gave_up", new_retries)
                        save_state(state)
                        report(name, folder, "gave_up",
                               error=f"Gave up after {new_retries} attempts — manual intervention required",
                               retry_count=new_retries)
                    else:
                        set_status(state, key, "failed", new_retries)
                        save_state(state)
                        report(name, folder, "failed",
                               error=f"Copy failed — will auto-retry (attempt {new_retries}/{MAX_RETRIES})",
                               retry_count=new_retries)
                continue

            with _state_lock:
                set_status(state, key, "copy_complete", 0)
                save_state(state)

            # ── Upload NAS → Drive (window-gated) ────────────────────────
            if in_window:
                run_upload(name, folder, 0, state, key)
            else:
                counters["deferred"] += 1
                print(f"[{name}]   on NAS, upload deferred until upload window: {folder}")

        ftp.quit()

    except Exception as e:
        print(f"[{name}] FAILED: {e}")
        report(name, "—", "failed", error=f"Scan failed: {e}")


# ---------------------------------------------------------------------------
# Drive cleanup — delete recordings backed up more than 30 days ago
# ---------------------------------------------------------------------------

def cleanup_drive():
    """
    Fetch recordings ready for deletion (archived 30+ days ago) from the API,
    purge each from Google Drive via rclone, then mark them as 'deleted'.
    """
    endpoint = os.environ.get("PCM_ENDPOINT", "")
    secret   = os.environ.get("PCM_SECRET", "")
    if not endpoint or not secret:
        return

    base = endpoint.rsplit("/api/pcm/", 1)[0]
    url  = f"{base}/api/pcm/pending-deletion"
    req  = urllib.request.Request(url, headers={"x-pcm-secret": secret})

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            pending = json.loads(resp.read().decode())
    except Exception as e:
        print(f"[cleanup] WARNING: could not fetch pending deletions: {e}")
        return

    if not pending:
        return

    rclone     = Path("/volume1/PCM/bin/rclone")
    rclone_cfg = Path("/volume1/PCM/config/rclone.conf")

    print(f"[cleanup] {len(pending)} recording(s) due for deletion from Drive")

    for rec in pending:
        studio       = rec["studio"]
        recording    = rec["recording"]
        drive_folder = rec.get("drive_folder")

        if not drive_folder:
            print(f"[cleanup] No drive_folder stored for {studio}/{recording} — skipping")
            continue

        drive_path = f"gdrive:{studio}/{drive_folder}"
        print(f"[cleanup] Purging: {drive_path}")

        result = subprocess.run(
            [str(rclone), "--config", str(rclone_cfg), "purge", drive_path],
            capture_output=True, text=True
        )

        if result.returncode == 0:
            report(studio, recording, "deleted")
            print(f"[cleanup] ✓ Deleted from Drive: {studio}/{recording}")
        else:
            print(f"[cleanup] WARNING: rclone purge failed for {studio}/{recording}: {result.stderr}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    cfg       = load_config()
    state     = load_state()
    in_window = in_upload_window(cfg)
    min_date  = cfg.get("min_date", "")

    window  = cfg.get("upload_window", {})
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[discover] PCM v{cfg['version']} — {now_str}")
    print(f"[discover] Upload window: {window.get('start_hour', 0):02d}:00–"
          f"{window.get('end_hour', 8):02d}:00 "
          f"({'ACTIVE' if in_window else 'outside window — uploads deferred'})")
    if min_date:
        print(f"[discover] Min date filter: {min_date} (skipping older recordings)")

    enabled = [s for s in cfg["studios"] if s.get("enabled", True)]
    print(f"[discover] Scanning {len(enabled)} studio(s) in parallel…")

    counters = {"found": 0, "deferred": 0}
    threads  = []

    for studio_cfg in enabled:
        t = threading.Thread(
            target=scan_studio,
            args=(studio_cfg, cfg, state, in_window, counters),
            name=studio_cfg["name"],
        )
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    print(f"\n[discover] Done. {counters['found']} new, {counters['deferred']} deferred for upload window.")

    cleanup_drive()


if __name__ == "__main__":
    main()
