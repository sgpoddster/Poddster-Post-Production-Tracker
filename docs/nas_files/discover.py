#!/usr/bin/env python3
"""
PCM Discovery Worker — /volume1/PCM/app/discover.py

Scans all enabled ATEM studios via FTP, finds recording folders that are:
  - Not system/hidden folders
  - At least min_age_minutes old (so the ATEM has finished writing)
  - Not already tracked in the PCM state file

Copy (ATEM → NAS) happens immediately on discovery.
Upload (NAS → Drive) only runs inside the configured upload window
(default 00:00–08:00) so Drive transfers don't compete with daytime bandwidth.
Recordings that are copy_complete but outside the window are left on NAS
and uploaded on the next scan that falls inside the window.

Failed recordings are auto-retried up to MAX_RETRIES times; after that
they become 'gave_up' and require manual intervention.

Run manually:        python3 /volume1/PCM/app/discover.py
Run via cron:        Add to Synology Task Scheduler (every 15 mins)
"""

import json
import subprocess
import sys
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

# States where nothing further should happen
DONE_STATES   = {"archived", "gave_up"}
# States currently in-flight (shouldn't persist across runs, but skip if seen)
ACTIVE_STATES = {"copying", "uploading", "discovered"}


def ignore(name: str) -> bool:
    return (
        name in IGNORE_EXACT
        or name.startswith(IGNORE_PREFIXES)
        or name.lower().endswith((".exe", ".dmg", ".txt", ".plist"))
        or name.lower().startswith("install sandisk")
    )


def load_config():
    return json.load(open(CONFIG))


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ---------------------------------------------------------------------------
# State entries are stored as {status, retries} dicts.
# Existing string-format entries (from older versions) are migrated on read.
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
        "status": status,
        "retries": retries if retries is not None else current_retries,
    }


# ---------------------------------------------------------------------------
# Upload window helpers
# ---------------------------------------------------------------------------

def in_upload_window(cfg: dict) -> bool:
    """Return True if the current local hour falls within the upload window."""
    window = cfg.get("upload_window", {})
    start  = window.get("start_hour", 0)   # default midnight
    end    = window.get("end_hour",   8)    # default 08:00
    now_h  = datetime.now().hour
    if start <= end:
        return start <= now_h < end
    # Wraps midnight (e.g. 22–06)
    return now_h >= start or now_h < end


# ---------------------------------------------------------------------------
# SSD capacity helpers
# ---------------------------------------------------------------------------

def get_ssd_stats(ftp, root):
    """
    Best-effort SSD capacity probe via FTP.
    Returns {used_bytes, free_bytes, total_bytes} or None if unsupported.
    """
    free_bytes = None
    used_bytes = None

    # Try SITE AVAIL (returns free bytes on some FTP servers)
    for cmd in ("SITE AVAIL", "SITE DISKFREE", "SITE FREE"):
        try:
            resp = ftp.sendcmd(cmd)
            # Response is typically "200 <bytes>" or just "<bytes>"
            digits = "".join(c for c in resp if c.isdigit())
            if digits:
                free_bytes = int(digits)
                break
        except Exception:
            continue

    # Sum file sizes for used bytes (walk top-level only to keep it fast)
    try:
        total_size = 0
        lines = []
        ftp.dir(root, lines.append)
        for line in lines:
            parts = line.split()
            if len(parts) >= 5:
                try:
                    total_size += int(parts[4])
                except ValueError:
                    pass
        used_bytes = total_size if total_size > 0 else None
    except Exception:
        pass

    if free_bytes is None and used_bytes is None:
        return None

    total_bytes = None
    if free_bytes is not None and used_bytes is not None:
        total_bytes = free_bytes + used_bytes

    return {
        "used_bytes":  used_bytes,
        "free_bytes":  free_bytes,
        "total_bytes": total_bytes,
    }


def report_studio_stats(name, stats):
    """Push SSD capacity to the dashboard via a separate endpoint."""
    if not stats:
        return
    from core.reporter import _post  # reuse the same HTTP helper
    try:
        _post("/api/pcm/studio-status", {
            "studio":      name,
            "used_bytes":  stats.get("used_bytes"),
            "free_bytes":  stats.get("free_bytes"),
            "total_bytes": stats.get("total_bytes"),
        })
    except Exception as e:
        print(f"[discover] WARNING: could not report SSD stats for {name}: {e}")


# ---------------------------------------------------------------------------

def find_ssd_root(ftp, studio_cfg: dict) -> str:
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


def recording_looks_complete(ftp, root: str, folder: str, min_age_minutes: int) -> bool:
    path = root.rstrip("/") + "/" + folder
    try:
        resp = ftp.sendcmd(f"MDTM {path}")
        ts_str = resp.split()[-1]
        ts = datetime.strptime(ts_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        age_minutes = (datetime.now(timezone.utc) - ts).total_seconds() / 60
        return age_minutes >= min_age_minutes
    except Exception:
        return True


def run_upload(name: str, folder: str, retries: int, state: dict, key: str):
    """Run upload_drive.py and update state. Returns True on success."""
    upload_bin = Path("/volume1/PCM/app/upload_drive.py")
    if not upload_bin.exists():
        print(f"[discover]   upload_drive.py not found — skipping upload step")
        return False

    print(f"[discover]   starting upload to Drive: {folder}")
    result = subprocess.run(
        [sys.executable, str(upload_bin), "--studio", name, "--recording", folder],
        capture_output=False,
    )

    if result.returncode == 0:
        set_status(state, key, "archived", 0)
        return True

    new_retries = retries + 1
    if new_retries >= MAX_RETRIES:
        set_status(state, key, "gave_up", new_retries)
        report(name, folder, "gave_up",
               error=f"Upload gave up after {new_retries} attempts — manual intervention required",
               retry_count=new_retries)
    else:
        set_status(state, key, "failed", new_retries)
        report(name, folder, "failed",
               error=f"Upload failed — will auto-retry (attempt {new_retries}/{MAX_RETRIES})",
               retry_count=new_retries)
    return False


def main():
    cfg       = load_config()
    ftp_cfg   = cfg["ftp"]
    min_age   = cfg.get("min_age_minutes", 15)
    state     = load_state()
    new_found = 0
    uploading_deferred = 0
    in_window = in_upload_window(cfg)

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    window   = cfg.get("upload_window", {})
    print(f"[discover] PCM v{cfg['version']} — {now_str}")
    print(f"[discover] Upload window: {window.get('start_hour', 0):02d}:00–{window.get('end_hour', 8):02d}:00 "
          f"({'ACTIVE' if in_window else 'outside window — uploads deferred'})")

    for studio_cfg in cfg["studios"]:
        if not studio_cfg.get("enabled", True):
            print(f"[discover] {studio_cfg['name']} — disabled, skipping")
            continue

        name = studio_cfg["name"]
        ip   = studio_cfg["ip"]
        print(f"\n[discover] Scanning {name} ({ip})…")

        try:
            ftp  = connect(ip, ftp_cfg["username"], ftp_cfg["password"], ftp_cfg["timeout_seconds"])
            root = find_ssd_root(ftp, studio_cfg)
            print(f"[discover] SSD root: {root}")

            # Probe SSD capacity and push to dashboard
            stats = get_ssd_stats(ftp, root)
            if stats:
                print(f"[discover] SSD: used={stats.get('used_bytes')}, "
                      f"free={stats.get('free_bytes')}, total={stats.get('total_bytes')}")
                report_studio_stats(name, stats)

            for folder in list_names(ftp, root):
                if ignore(folder):
                    continue

                full_path = root.rstrip("/") + "/" + folder
                if not is_dir(ftp, full_path):
                    continue

                key     = f"{name}|{folder}"
                status  = get_status(state, key)
                retries = get_retries(state, key)

                # ── Already done or in-flight ────────────────────────────────
                if status in DONE_STATES or status in ACTIVE_STATES:
                    print(f"[discover]   skip: {folder} ({status})")
                    continue

                # ── copy_complete: ready to upload, respect window ───────────
                if status == "copy_complete":
                    if in_window:
                        if run_upload(name, folder, retries, state, key):
                            save_state(state)
                        else:
                            save_state(state)
                    else:
                        uploading_deferred += 1
                        print(f"[discover]   deferred (outside upload window): {folder}")
                    continue

                # ── failed: retry with backoff ───────────────────────────────
                if status == "failed":
                    if retries >= MAX_RETRIES:
                        print(f"[discover]   gave up ({retries} retries): {folder}")
                        set_status(state, key, "gave_up", retries)
                        save_state(state)
                        report(name, folder, "gave_up",
                               error=f"Gave up after {retries} attempts — manual intervention required",
                               retry_count=retries)
                        continue
                    print(f"[discover]   retry {retries + 1}/{MAX_RETRIES}: {folder}")

                # ── Age check (new recordings and retries) ───────────────────
                if not recording_looks_complete(ftp, root, folder, min_age):
                    print(f"[discover]   too recent, skipping: {folder}")
                    continue

                # ── New recording ────────────────────────────────────────────
                if status is None:
                    print(f"[discover]   NEW: {folder}")
                    report(name, folder, "discovered")
                    set_status(state, key, "discovered", 0)
                    save_state(state)
                    new_found += 1

                # ── Step 1: Copy ATEM → NAS (always immediate) ───────────────
                print(f"[discover]   copying: {folder}")
                copy_result = subprocess.run(
                    [sys.executable, "/volume1/PCM/app/copy_one.py",
                     "--studio", name, "--root", root, "--recording", folder],
                    capture_output=False,
                )

                if copy_result.returncode != 0:
                    new_retries = retries + 1
                    if new_retries >= MAX_RETRIES:
                        print(f"[discover]   giving up after {new_retries} failures: {folder}")
                        set_status(state, key, "gave_up", new_retries)
                        save_state(state)
                        report(name, folder, "gave_up",
                               error=f"Gave up after {new_retries} attempts — manual intervention required",
                               retry_count=new_retries)
                    else:
                        print(f"[discover]   copy failed (attempt {new_retries}/{MAX_RETRIES}): {folder}")
                        set_status(state, key, "failed", new_retries)
                        save_state(state)
                        report(name, folder, "failed",
                               error=f"Copy failed — will auto-retry (attempt {new_retries}/{MAX_RETRIES})",
                               retry_count=new_retries)
                    continue

                set_status(state, key, "copy_complete", 0)
                save_state(state)

                # ── Step 2: Upload NAS → Drive (window-gated) ────────────────
                if in_window:
                    if run_upload(name, folder, 0, state, key):
                        save_state(state)
                    else:
                        save_state(state)
                else:
                    uploading_deferred += 1
                    print(f"[discover]   on NAS, upload deferred until upload window: {folder}")

            ftp.quit()

        except Exception as e:
            print(f"[discover] FAILED to scan {name}: {e}")
            report(name, "—", "failed", error=f"Scan failed: {e}")

    print(f"\n[discover] Done. {new_found} new, {uploading_deferred} deferred for upload window.")


if __name__ == "__main__":
    main()
