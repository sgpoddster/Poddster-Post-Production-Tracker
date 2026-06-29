#!/usr/bin/env python3
"""
PCM Discovery Worker — /volume1/PCM/app/discover.py

Scans all enabled ATEM studios via FTP, finds recording folders that are:
  - Not system/hidden folders
  - At least min_age_minutes old (so the ATEM has finished writing)
  - Not already tracked in the PCM state file

Queues new recordings by reporting them as 'discovered' to the dashboard,
then automatically kicks off a copy for each one.

Run manually:        python3 /volume1/PCM/app/discover.py
Run via cron:        Add to Synology Task Scheduler (every 15 mins)
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")

from core.ftp_copy import connect, find_ssd_root_from_config, list_names, is_dir
from core.reporter import report

CONFIG     = Path("/volume1/PCM/config/settings.json")
STATE_FILE = Path("/volume1/PCM/config/state.json")

IGNORE_EXACT = {
    "System Volume Information", "$RECYCLE.BIN", ".Spotlight-V100",
    ".Trashes", ".fseventsd", "FOUND.000", "TemporaryItems",
}
IGNORE_PREFIXES = (".", "._", "@", "#", "$")


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
    """State file tracks which recordings we've already seen."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def find_ssd_root(ftp, studio_cfg: dict) -> str:
    """Use configured ssd_root if set, otherwise auto-detect."""
    if studio_cfg.get("ssd_root"):
        return studio_cfg["ssd_root"]

    # Auto-detect: look for a directory with 'ssd' in the name
    for item in list_names(ftp, "/"):
        if ignore(item):
            continue
        if "ssd" in item.lower() and is_dir(ftp, "/" + item):
            return "/" + item

    # Fallback: first non-ignored directory
    for item in list_names(ftp, "/"):
        if ignore(item):
            continue
        if is_dir(ftp, "/" + item):
            return "/" + item

    return "/"


def recording_looks_complete(ftp, root: str, folder: str, min_age_minutes: int) -> bool:
    """
    Check if a recording folder is stable enough to copy.
    We use FTP MDTM (modification time) on the folder itself.
    If MDTM isn't supported, we fall back to always returning True.
    """
    path = root.rstrip("/") + "/" + folder
    try:
        resp = ftp.sendcmd(f"MDTM {path}")
        # MDTM returns: 213 YYYYMMDDHHmmss
        ts_str = resp.split()[-1]
        ts = datetime.strptime(ts_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        age_minutes = (datetime.now(timezone.utc) - ts).total_seconds() / 60
        return age_minutes >= min_age_minutes
    except Exception:
        return True  # MDTM not supported — assume stable


def main():
    cfg       = load_config()
    ftp_cfg   = cfg["ftp"]
    min_age   = cfg.get("min_age_minutes", 15)
    state     = load_state()
    new_found = 0

    print(f"[discover] PCM v{cfg['version']} — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

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

            for folder in list_names(ftp, root):
                if ignore(folder):
                    continue

                full_path = root.rstrip("/") + "/" + folder
                if not is_dir(ftp, full_path):
                    continue

                key = f"{name}|{folder}"

                if key in state:
                    print(f"[discover]   already tracked: {folder} ({state[key]})")
                    continue

                if not recording_looks_complete(ftp, root, folder, min_age):
                    print(f"[discover]   too recent, skipping: {folder}")
                    continue

                print(f"[discover]   NEW: {folder}")
                report(name, folder, "discovered")
                state[key] = "discovered"
                save_state(state)
                new_found += 1

                # Kick off copy immediately
                print(f"[discover]   starting copy: {folder}")
                result = subprocess.run(
                    [
                        sys.executable,
                        "/volume1/PCM/app/copy_one.py",
                        "--studio", name,
                        "--root", root,
                        "--recording", folder,
                    ],
                    capture_output=False,
                )

                if result.returncode == 0:
                    state[key] = "copy_complete"
                else:
                    state[key] = "failed"
                save_state(state)

            ftp.quit()

        except Exception as e:
            print(f"[discover] FAILED to scan {name}: {e}")
            report(name, "—", "failed", error=f"Scan failed: {e}")

    print(f"\n[discover] Done. {new_found} new recording(s) found.")


if __name__ == "__main__":
    main()
