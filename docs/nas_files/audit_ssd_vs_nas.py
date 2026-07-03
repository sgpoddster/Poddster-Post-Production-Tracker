#!/usr/bin/env python3
"""
PCM SSD vs NAS Audit — /volume1/PCM/app/audit_ssd_vs_nas.py

Connects to all ATEM SSDs via FTP and compares every recording folder
against the local state.json and the NAS backup directory. No date filter
— it looks at everything, old and new.

Reports:
  ✗ MISSING    — folder is on the SSD but has NO entry in state.json
                 (never discovered; most likely to indicate a missed backup)
  ⚠ STUCK      — folder is in a non-done state (copying/uploading/failed/gave_up)
  ✓ DONE       — archived or split (backed up successfully)
  ~ NAS ONLY   — entry is in state.json but folder is no longer on the SSD

Run:
  source /volume1/PCM/config/env.sh
  python3 /volume1/PCM/app/audit_ssd_vs_nas.py

Optional flags:
  --studio "Studio 2"   — audit only one studio
  --missing-only        — only print rows that need attention
"""

import argparse
import json
import sys
import threading
from datetime import datetime, timezone
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

DONE_STATES = {"archived", "split"}


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


def _entry(state, key):
    val = state.get(key)
    if val is None:
        return None
    if isinstance(val, str):
        return {"status": val, "retries": 0}
    return val


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


def audit_studio(studio_cfg, cfg, state, backup_root, missing_only, results):
    name = studio_cfg["name"]
    ip   = studio_cfg["ip"]
    ftp_cfg = cfg["ftp"]

    rows = []
    error = None

    try:
        ftp  = connect(ip, ftp_cfg["username"], ftp_cfg["password"], ftp_cfg["timeout_seconds"])
        root = find_ssd_root(ftp, studio_cfg)

        ssd_folders = set()
        for folder in list_names(ftp, root):
            if ignore(folder):
                continue
            full_path = root.rstrip("/") + "/" + folder
            if not is_dir(ftp, full_path):
                continue
            ssd_folders.add(folder)

        ftp.quit()

        # Check each SSD folder against state.json and NAS
        for folder in sorted(ssd_folders):
            key   = f"{name}|{folder}"
            entry = _entry(state, key)
            status = entry["status"] if entry else None
            nas_path = Path(backup_root) / name / folder
            nas_exists = nas_path.exists()

            if status is None:
                tag = "✗ MISSING"
                note = "no state entry — never discovered or entry lost"
            elif status in DONE_STATES:
                tag = "✓ DONE   "
                note = f"{status}"
                if nas_exists:
                    note += " (NAS copy still present)"
                else:
                    note += " (NAS copy deleted — Drive only)"
            elif status == "gave_up":
                retries = entry.get("retries", 0)
                if retries == 0:
                    # Marked by mark_legacy.py — intentionally skipped pre-PCM recording
                    tag = "- LEGACY "
                    note = "intentionally skipped (pre-PCM)"
                    needs_attention = False
                else:
                    tag = "✗ GAVE UP"
                    note = f"gave_up after {retries} retries — needs manual attention"
            else:
                tag = "⚠ STUCK  "
                retries = entry.get("retries", 0)
                note = f"state={status}"
                if retries:
                    note += f", {retries} retries"
                if nas_exists:
                    note += ", NAS folder exists"

            needs_attention = tag.startswith("✗") or tag.startswith("⚠")
            if not missing_only or needs_attention:
                rows.append((tag, folder, note, needs_attention))

        # Folders in state.json for this studio that are NOT on the SSD
        for key, entry in state.items():
            if not key.startswith(f"{name}|"):
                continue
            folder = key[len(name) + 1:]
            if folder not in ssd_folders:
                e = _entry(state, key)
                status = e["status"] if e else "?"
                if status in DONE_STATES:
                    continue  # expected — SSD may have been cleared after backup
                tag = "~ NAS ONLY"
                note = f"state={status} but folder is gone from SSD"
                if not missing_only:
                    rows.append((tag, folder, note, False))

    except Exception as e:
        error = str(e)

    results[name] = {"rows": rows, "error": error}


def main():
    parser = argparse.ArgumentParser(description="Audit SSD folders vs NAS state.")
    parser.add_argument("--studio",       help="Audit only this studio (e.g. 'Studio 2')")
    parser.add_argument("--missing-only", action="store_true",
                        help="Only print rows that need attention")
    args = parser.parse_args()

    cfg         = load_config()
    state       = load_state()
    backup_root = cfg.get("backup_root", "/volume1/Atem Backup")

    enabled = [s for s in cfg["studios"] if s.get("enabled", True)]
    if args.studio:
        enabled = [s for s in enabled if s["name"] == args.studio]
        if not enabled:
            print(f"Studio '{args.studio}' not found in config.")
            sys.exit(1)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\nPCM SSD vs NAS Audit — {now_str}")
    print(f"Scanning {len(enabled)} studio(s)…\n")

    results  = {}
    threads  = []
    for studio_cfg in enabled:
        t = threading.Thread(
            target=audit_studio,
            args=(studio_cfg, cfg, state, backup_root, args.missing_only, results),
            name=studio_cfg["name"],
        )
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

    total_issues = 0

    for studio_cfg in enabled:
        name = studio_cfg["name"]
        r    = results.get(name, {})
        rows = r.get("rows", [])
        err  = r.get("error")

        print(f"{'─' * 60}")
        print(f"  {name}")
        print(f"{'─' * 60}")

        if err:
            print(f"  ✗ FAILED to connect: {err}\n")
            total_issues += 1
            continue

        if not rows:
            print(f"  (no folders found on SSD)\n")
            continue

        for tag, folder, note, needs_attention in rows:
            print(f"  {tag}  {folder}")
            print(f"           {note}")
            if needs_attention:
                total_issues += 1
        print()

    print(f"{'═' * 60}")
    if total_issues == 0:
        print("  ✓ All clear — no issues found.")
    else:
        print(f"  {total_issues} issue(s) need attention.")
    print()


if __name__ == "__main__":
    main()
