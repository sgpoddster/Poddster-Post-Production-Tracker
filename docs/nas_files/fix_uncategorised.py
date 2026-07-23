#!/usr/bin/env python3
"""
Fix incorrectly-named "Uncategorised" session folders.

Merges multiple NAS/Drive folders for the same session into one correctly-named
folder, marks the old DB rows as 'split' (so they vanish from the dashboard),
and inserts a single correct 'archived' row.

Usage (on the NAS):
    source /volume1/PCM/config/env.sh
    python3 /volume1/PCM/app/fix_uncategorised.py

Edit the FIXES list at the bottom to describe each correction needed.
"""

import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

RCLONE      = Path("/volume1/PCM/bin/rclone")
RCLONE_CONF = Path("/volume1/PCM/config/rclone.conf")
BACKUP_ROOT = Path("/volume1/Atem Backup")

PCM_ENDPOINT = os.environ.get("PCM_ENDPOINT", "")
PCM_SECRET   = os.environ.get("PCM_SECRET", "")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def rclone(*args, check=False):
    cmd = [str(RCLONE), "--config", str(RCLONE_CONF)] + list(args)
    print(f"  [rclone] {' '.join(str(a) for a in args)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    WARN: {result.stderr.strip()[:300]}")
    return result


def get_drive_folder_url(studio: str, folder_name: str) -> str | None:
    result = rclone("lsjson", "--dirs-only", f"gdrive:{studio}/")
    try:
        for item in json.loads(result.stdout):
            if item.get("Name") == folder_name:
                fid = item.get("ID", "")
                return f"https://drive.google.com/drive/folders/{fid}" if fid else None
    except Exception:
        pass
    return None


def _api(path: str, payload: dict):
    if not PCM_ENDPOINT or not PCM_SECRET:
        print("  [api] PCM_ENDPOINT/PCM_SECRET not set — skipping API call")
        return
    base = PCM_ENDPOINT.rsplit("/api/pcm/", 1)[0]
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json", "x-pcm-secret": PCM_SECRET},
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            pass
    except urllib.error.HTTPError as e:
        print(f"  [api] WARN {e.code}: {e.read().decode()[:200]}")
    except Exception as e:
        print(f"  [api] WARN: {e}")


# ---------------------------------------------------------------------------
# Core fix logic
# ---------------------------------------------------------------------------

def fix_session(studio: str, old_names: list[str], new_name: str):
    """
    Merge `old_names` folders (NAS + Drive) into `new_name`, then update the DB.

    studio    — e.g. "Studio 1"
    old_names — list of current (wrong) folder names
    new_name  — correct folder name
    """
    print(f"\n{'='*60}")
    print(f"  Studio : {studio}")
    print(f"  Old    : {old_names}")
    print(f"  New    : {new_name}")
    print(f"{'='*60}")

    studio_nas = BACKUP_ROOT / studio
    target_dir = studio_nas / new_name

    # 1. Merge NAS folders -------------------------------------------------
    target_dir.mkdir(parents=True, exist_ok=True)
    total_files = 0
    total_bytes = 0

    for old_name in old_names:
        src = studio_nas / old_name
        if not src.exists():
            print(f"  [nas] Not found (may already be moved): {old_name}")
            continue
        print(f"  [nas] Moving files: {old_name} → {new_name}")
        for f in sorted(src.rglob("*")):
            if not f.is_file():
                continue
            rel = f.relative_to(src)
            dst = target_dir / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(f), str(dst))
        try:
            shutil.rmtree(str(src))
            print(f"  [nas] Removed empty source: {old_name}")
        except Exception as e:
            print(f"  [nas] Could not remove source dir: {e}")

    # Recount after merge
    for f in target_dir.rglob("*"):
        if f.is_file():
            total_files += 1
            try:
                total_bytes += f.stat().st_size
            except OSError:
                pass
    print(f"  [nas] Merged total: {total_files} files, {total_bytes / 1e9:.2f} GB")

    # 2. Merge Drive folders -----------------------------------------------
    drive_studio = f"gdrive:{studio}"
    for old_name in old_names:
        rclone("move", f"{drive_studio}/{old_name}", f"{drive_studio}/{new_name}")
        rclone("purge", f"{drive_studio}/{old_name}")

    # 3. Get the merged Drive folder URL ------------------------------------
    drive_url = get_drive_folder_url(studio, new_name)
    print(f"  [drive] URL: {drive_url}")

    # 4. Mark old DB rows as 'split' (hides them from the dashboard) -------
    for old_name in old_names:
        print(f"  [db] Marking split: {old_name}")
        _api("/api/pcm/update", {
            "studio":    studio,
            "recording": old_name,
            "state":     "split",
        })

    # 5. Insert the correct merged row -------------------------------------
    print(f"  [db] Inserting correct row: {new_name}")
    _api("/api/pcm/update", {
        "studio":       studio,
        "recording":    new_name,
        "state":        "archived",
        "drive_url":    drive_url,
        "drive_folder": new_name,
        "nas_path":     str(target_dir),
        "file_count":   total_files,
        "total_bytes":  total_bytes,
    })

    print(f"  [done] {new_name}")


# ---------------------------------------------------------------------------
# Fixes to apply — edit this list as needed
# ---------------------------------------------------------------------------

FIXES = [
    {
        "studio": "Studio 1",
        "old_names": [
            "Studio 1 21 — 2026-07-23 12:27 — Uncategorised",
            "Studio 1 21 — 2026-07-23 12:35 — Uncategorised",
            "Studio 1 21 — 2026-07-23 12:54 — Uncategorised",
        ],
        "new_name": "Studio 1 21 — 2026-07-23 11:30 — Yana Fry",
    },
    # Add more corrections here as needed, e.g.:
    # {
    #     "studio": "Studio 4",
    #     "old_names": ["Studio 4 9 — 2026-07-21 12:51 — Uncategorised"],
    #     "new_name":  "Studio 4 9 — 2026-07-20 14:30 — Lynette Yeo",
    # },
]


if __name__ == "__main__":
    for fix in FIXES:
        fix_session(fix["studio"], fix["old_names"], fix["new_name"])
    print("\nAll fixes complete.")
