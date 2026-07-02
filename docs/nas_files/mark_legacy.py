#!/usr/bin/env python3
"""
PCM mark_legacy — /volume1/PCM/app/mark_legacy.py

One-shot script: scans all ATEM SSDs and marks any recording folder that
has NO entry in state.json as 'gave_up' (intentionally skipped — pre-PCM
recordings that don't need to be backed up).

Safe to re-run: only touches entries that are genuinely absent from state.json.
Folders already in any state (archived, split, failed, etc.) are left alone.

Run:
  python3 /volume1/PCM/app/mark_legacy.py

Add --dry-run to preview what would be marked without writing anything.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")

from core.ftp_copy import connect, list_names, is_dir

CONFIG     = Path("/volume1/PCM/config/settings.json")
STATE_FILE = Path("/volume1/PCM/config/state.json")

IGNORE_EXACT = {
    "System Volume Information", "$RECYCLE.BIN", ".Spotlight-V100",
    ".Trashes", ".fseventsd", "FOUND.000", "TemporaryItems",
}
IGNORE_PREFIXES = (".", "._", "@", "#", "$")


def ignore(name):
    return (
        name in IGNORE_EXACT
        or name.startswith(IGNORE_PREFIXES)
        or name.lower().endswith((".exe", ".dmg", ".txt", ".plist"))
        or name.lower().startswith("install sandisk")
    )


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview only, don't write state.json")
    args = parser.parse_args()

    cfg     = json.load(open(CONFIG))
    state   = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    ftp_cfg = cfg["ftp"]

    to_mark = []

    for studio_cfg in cfg["studios"]:
        if not studio_cfg.get("enabled", True):
            continue
        name = studio_cfg["name"]
        ip   = studio_cfg["ip"]
        print(f"[{name}] connecting…")
        try:
            ftp  = connect(ip, ftp_cfg["username"], ftp_cfg["password"], ftp_cfg["timeout_seconds"])
            root = find_ssd_root(ftp, studio_cfg)
            for folder in list_names(ftp, root):
                if ignore(folder):
                    continue
                full_path = root.rstrip("/") + "/" + folder
                if not is_dir(ftp, full_path):
                    continue
                key = f"{name}|{folder}"
                if key not in state:
                    to_mark.append(key)
                    print(f"  → would mark: {folder}")
            ftp.quit()
        except Exception as e:
            print(f"  FAILED: {e}")

    if not to_mark:
        print("\nNothing to mark — all SSD folders already have state entries.")
        return

    print(f"\n{len(to_mark)} folder(s) will be marked as 'gave_up' (legacy/pre-PCM).")

    if args.dry_run:
        print("Dry run — no changes written.")
        return

    for key in to_mark:
        state[key] = {"status": "gave_up", "retries": 0}

    STATE_FILE.write_text(json.dumps(state, indent=2))
    print(f"state.json updated — {len(to_mark)} entries added.")


if __name__ == "__main__":
    main()
